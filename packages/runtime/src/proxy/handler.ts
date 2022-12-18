/* eslint-disable @typescript-eslint/no-explicit-any */
import cuid from 'cuid';
import superjson from 'superjson';
import { TRANSACTION_FIELD_NAME } from '../constants';
import { DbClientContract, DbOperations } from '../types';
import { AuthUser } from '../types';
import {
    checkPolicyForFilter,
    ensureArray,
    ensureAuthGuard,
    injectTransactionId,
    preprocessWritePayload,
    preUpdateCheck,
    readWithCheck,
    validateModelPayload,
} from './policy-utils';
import {
    NotFoundError,
    PrismaClientValidationError,
} from '@prisma/client/runtime';
import { Logger } from './logger';
import { PolicyDef } from '../policy';

type PrismaClientOperations =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'findMany'
    | 'create'
    | 'createMany'
    | 'delete'
    | 'update'
    | 'deleteMany'
    | 'updateMany'
    | 'upsert'
    | 'aggregate'
    | 'groupBy'
    | 'count';

export function prismaClientProxyHandler(
    prisma: any,
    policy: PolicyDef,
    user?: AuthUser
) {
    return {
        get: (target: any, prop: string | symbol, receiver: any) => {
            const propVal = Reflect.get(target, prop, receiver);
            if (!propVal || typeof prop !== 'string' || prop.startsWith('$')) {
                return Reflect.get(target, prop, receiver);
            }
            return new PrismaModelHandler(
                prisma as DbClientContract,
                policy,
                prop,
                user
            );
        },
    };
}

/**
 * Request handler for /data endpoint which processes data CRUD requests.
 */
export class PrismaModelHandler<DbClient extends DbClientContract>
    implements Record<PrismaClientOperations, (args: any) => Promise<unknown>>
{
    private readonly logger: Logger;
    constructor(
        private readonly prisma: DbClient,
        private readonly policy: PolicyDef,
        private readonly model: string,
        private readonly user?: AuthUser
    ) {
        this.logger = new Logger(prisma);
    }

    async findUnique(args: any) {
        const entities = await readWithCheck(
            this.model,
            args,
            this.user,
            this.prisma,
            this.policy,
            this.logger
        );
        return entities[0];
    }

    async findUniqueOrThrow(args: any) {
        const entity = await this.findUnique(args);
        if (!entity) {
            throw new NotFoundError('entity not found');
        }
        return entity;
    }

    async findFirst(args: any) {
        const entities = await readWithCheck(
            this.model,
            args,
            this.user,
            this.prisma,
            this.policy,
            this.logger
        );
        return entities[0];
    }

    async findFirstOrThrow(args: any) {
        const entity = await this.findFirst(args);
        if (!entity) {
            throw new NotFoundError('entity not found');
        }
        return entity;
    }

    async findMany(args: any) {
        return readWithCheck(
            this.model,
            args,
            this.user,
            this.prisma,
            this.policy,
            this.logger
        );
    }

    private async checkPolicyForCreatedModels(
        createdModels: string[],
        transactionId: string,
        tx: Record<string, DbOperations>
    ) {
        if (createdModels.length === 0) {
            return;
        }
        await Promise.all(
            createdModels.map(async (model) => {
                await checkPolicyForFilter(
                    model,
                    {
                        [TRANSACTION_FIELD_NAME]: `${transactionId}:create`,
                    },
                    'create',
                    this.user,
                    tx,
                    this.policy,
                    this.logger
                );
            })
        );
    }

    private async checkReadback(readArgs: any, operation: string) {
        try {
            const result = await readWithCheck(
                this.model,
                readArgs,
                this.user,
                this.prisma,
                this.policy,
                this.logger
            );
            if (result.length === 0) {
                this.logger.warn(`${operation} result cannot be read back`);
                return undefined;
            }
            return result[0];
        } catch (err) {
            this.logger.warn(`${operation} result cannot be read back: ${err}`);
            return undefined;
        }
    }

    async create(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError(
                'data field is required in query argument'
            );
        }

        await validateModelPayload(this.model, 'create', args.data);

        // preprocess payload to modify fields as required by attribute like @password
        await preprocessWritePayload(this.policy, this.model, args.data);

        const transactionId = cuid();

        const { createdModels } = await injectTransactionId(
            this.model,
            args.data,
            'create',
            transactionId,
            this.policy
        );

        // start an interactive transaction
        const createResult = await this.prisma.$transaction(
            async (tx: Record<string, DbOperations>) => {
                // inject transaction id into update/create payload (direct and nested)
                // conduct the create
                this.logger.info(
                    `Conducting create: ${this.model}:\n${superjson.stringify(
                        args
                    )}`
                );
                const createResult = (await tx[this.model].create(args)) as {
                    id: string;
                };

                // verify that nested creates pass policy check
                this.logger.info(
                    `Checking all created models: [${createdModels.join(',')}]`
                );

                await this.checkPolicyForCreatedModels(
                    createdModels,
                    transactionId,
                    tx
                );

                return createResult;
            }
        );

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args, where: { id: createResult.id } };
        delete readArgs.data;

        return this.checkReadback(readArgs, 'create');
    }

    async createMany(args: any, skipDuplicates?: boolean) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError(
                'data field is required and must be an array'
            );
        }

        const transactionId = cuid();

        let createdModels: string[] = [];
        for (const data of ensureArray(args.data)) {
            await validateModelPayload(this.model, 'create', data);

            // preprocess payload to modify fields as required by attribute like @password
            await preprocessWritePayload(this.policy, this.model, data);

            // inject transaction id into update/create payload (direct and nested)
            const { createdModels: created } = await injectTransactionId(
                this.model,
                data,
                'create',
                transactionId,
                this.policy
            );

            createdModels.push(...created);
        }

        createdModels = [...new Set<string>(createdModels)];

        // start an interactive transaction
        const createResult = await this.prisma.$transaction(
            async (tx: Record<string, DbOperations>) => {
                // conduct the create
                this.logger.info(
                    `Conducting createMany: ${
                        this.model
                    }:\n${superjson.stringify(args)}`
                );
                const createResult = await tx[this.model].createMany(
                    args,
                    skipDuplicates
                );

                // verify that nested creates pass policy check
                this.logger.info(
                    `Checking all created models: [${createdModels.join(',')}]`
                );

                await this.checkPolicyForCreatedModels(
                    createdModels,
                    transactionId,
                    tx
                );

                return createResult;
            }
        );

        return createResult;
    }

    async doUpdate(
        args: any,
        updateAction: (db: DbOperations) => Promise<unknown>,
        operation: string
    ) {
        await validateModelPayload(this.model, 'update', args.data);

        // preprocess payload to modify fields as required by attribute like @password
        await preprocessWritePayload(this.policy, this.model, args.data);

        const transactionId = cuid();

        await this.prisma.$transaction(
            async (tx: Record<string, DbOperations>) => {
                // make sure the entity (including ones involved in nested write) pass policy check
                await preUpdateCheck(
                    this.model,
                    args,
                    this.user,
                    tx,
                    this.policy,
                    this.logger
                );

                // inject transaction id into update/create payload (direct and nested)
                const { createdModels } = await injectTransactionId(
                    this.model,
                    args.data,
                    'update',
                    transactionId,
                    this.policy
                );

                // conduct the update
                this.logger.info(
                    `Conducting update: ${this.model}:\n${superjson.stringify(
                        args
                    )}`
                );

                await updateAction(tx[this.model]);

                // verify that nested creates pass policy check

                if (createdModels.length > 0) {
                    this.logger.info(
                        `Checking all created models: [${createdModels.join(
                            ','
                        )}]`
                    );

                    await this.checkPolicyForCreatedModels(
                        createdModels,
                        transactionId,
                        tx
                    );
                }
            }
        );

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args };
        delete readArgs.data;

        return this.checkReadback(readArgs, operation);
    }

    async update(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError(
                'where field is required in query argument'
            );
        }
        if (!args.data) {
            throw new PrismaClientValidationError(
                'data field is required in query argument'
            );
        }
        return this.doUpdate(args, (db) => db.update(args), 'update');
    }

    async updateMany(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError(
                'data field is required in query argument'
            );
        }
        return this.doUpdate(args, (db) => db.updateMany(args), 'updateMany');
    }

    async upsert(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError(
                'where field is required in query argument'
            );
        }
        if (!args.create) {
            throw new PrismaClientValidationError(
                'create field is required in query argument'
            );
        }
        if (!args.update) {
            throw new PrismaClientValidationError(
                'update field is required in query argument'
            );
        }

        await validateModelPayload(this.model, 'create', args.create);
        await validateModelPayload(this.model, 'update', args.update);

        // preprocess payload to modify fields as required by attribute like @password
        await preprocessWritePayload(this.policy, this.model, args.create);
        await preprocessWritePayload(this.policy, this.model, args.update);

        const transactionId = cuid();

        await this.prisma.$transaction(
            async (tx: Record<string, DbOperations>) => {
                // make sure the entity (including ones involved in nested write) pass policy check
                await preUpdateCheck(
                    this.model,
                    args,
                    this.user,
                    tx,
                    this.policy,
                    this.logger
                );

                // inject transaction id into update/create payload (direct and nested)
                const { createdModels: createdFromCreate } =
                    await injectTransactionId(
                        this.model,
                        args.create,
                        'create',
                        transactionId,
                        this.policy
                    );

                const { createdModels: createdFromUpdate } =
                    await injectTransactionId(
                        this.model,
                        args.update,
                        'update',
                        transactionId,
                        this.policy
                    );

                const createdModels = [
                    ...new Set([...createdFromCreate, ...createdFromUpdate]),
                ];

                // conduct the update
                this.logger.info(
                    `Conducting update: ${this.model}:\n${superjson.stringify(
                        args
                    )}`
                );

                await tx[this.model].upsert(args);

                // verify that nested creates pass policy check

                await this.checkPolicyForCreatedModels(
                    createdModels,
                    transactionId,
                    tx
                );
            }
        );

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args };
        delete readArgs.create;
        delete readArgs.update;

        return this.checkReadback(readArgs, 'upsert');
    }

    async delete(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError(
                'where field is required in query argument'
            );
        }

        // ensures the item under deletion passes policy check
        await checkPolicyForFilter(
            this.model,
            args.where,
            'delete',
            this.user,
            this.prisma,
            this.policy,
            this.logger
        );

        let readResult: any;
        try {
            const items = await readWithCheck(
                this.model,
                args,
                this.user,
                this.prisma,
                this.policy,
                this.logger
            );
            readResult = items[0];
        } catch (err) {
            // not readable
            readResult = undefined;
        }

        // conduct the deletion
        this.logger.info(
            `Conducting delete ${this.model}:\n${superjson.stringify(args)}`
        );
        await this.prisma[this.model].delete(args);

        return readResult;
    }

    async deleteMany(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError(
                'where field is required in query argument'
            );
        }

        // ensures the item under deletion passes policy check
        await checkPolicyForFilter(
            this.model,
            args.where,
            'delete',
            this.user,
            this.prisma,
            this.policy,
            this.logger
        );

        // conduct the deletion
        this.logger.info(
            `Conducting delete ${this.model}:\n${superjson.stringify(args)}`
        );
        return this.prisma[this.model].deleteMany(args);
    }

    async aggregate(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        const aggArgs = await ensureAuthGuard(
            args,
            this.model,
            'read',
            this.user,
            this.policy
        );

        return this.prisma[this.model].aggregate(aggArgs);
    }

    async groupBy(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        const aggArgs = await ensureAuthGuard(
            args,
            this.model,
            'read',
            this.user,
            this.policy
        );

        return this.prisma[this.model].groupBy(aggArgs);
    }

    async count(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        const aggArgs = await ensureAuthGuard(
            args,
            this.model,
            'read',
            this.user,
            this.policy
        );

        return this.prisma[this.model].count(aggArgs);
    }
}
