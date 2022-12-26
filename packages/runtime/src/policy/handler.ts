/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClientValidationError } from '@prisma/client/runtime';
import cuid from 'cuid';
import deepcopy from 'deepcopy';
import superjson from 'superjson';
import { PolicyDef } from '.';
import { TRANSACTION_FIELD_NAME } from '../constants';
import { AuthUser, DbClientContract, DbOperations, PolicyOperationKind } from '../types';
import { Logger } from './logger';
import {
    checkPolicyForFilter,
    deniedByPolicy,
    ensureArray,
    ensureAuthGuard,
    getAuthGuard,
    injectTransactionId,
    notFound,
    preUpdateCheck,
    preprocessWritePayload,
    readWithCheck,
} from './policy-utils';

type PrismaClientOperations =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'findMany'
    | 'create'
    | 'createMany'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'aggregate'
    | 'groupBy'
    | 'count';

export function prismaClientProxyHandler(prisma: any, policy: PolicyDef, user?: AuthUser) {
    return {
        get: (target: any, prop: string | symbol, receiver: any) => {
            if (typeof prop !== 'string' || prop.startsWith('$') || prop.startsWith('_engine')) {
                return Reflect.get(target, prop, receiver);
            }

            const propVal = Reflect.get(target, prop, receiver);
            if (!propVal) {
                return undefined;
            }

            return new PrismaModelHandler(prisma as DbClientContract, policy, prop, user);
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

    private get modelClient() {
        return this.prisma[this.model];
    }

    async findUnique(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError('where field is required in query argument');
        }
        args = deepcopy(args);

        const entities = await readWithCheck(this.model, args, this.user, this.prisma, this.policy, this.logger);
        return entities[0] ?? null;
    }

    async findUniqueOrThrow(args: any) {
        const entity = await this.findUnique(args);
        if (!entity) {
            throw notFound(this.model);
        }
        return entity;
    }

    async findFirst(args: any) {
        args = args ? deepcopy(args) : args;
        const entities = await readWithCheck(this.model, args, this.user, this.prisma, this.policy, this.logger);
        return entities[0] ?? null;
    }

    async findFirstOrThrow(args: any) {
        const entity = await this.findFirst(args);
        if (!entity) {
            throw notFound(this.model);
        }
        return entity;
    }

    async findMany(args: any) {
        args = args ? deepcopy(args) : args;
        return readWithCheck(this.model, args, this.user, this.prisma, this.policy, this.logger);
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

    private async checkReadback(readArgs: any, action: string, operation: PolicyOperationKind) {
        const result = await readWithCheck(this.model, readArgs, this.user, this.prisma, this.policy, this.logger);
        if (result.length === 0) {
            this.logger.warn(`${action} result cannot be read back`);
            throw deniedByPolicy(this.model, operation);
        }
        return result[0];
    }

    async create(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError('data field is required in query argument');
        }

        args = deepcopy(args);

        await this.tryReject('create');

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
        const createResult = await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            // inject transaction id into update/create payload (direct and nested)
            // conduct the create
            this.logger.info(`Conducting create: ${this.model}:\n${superjson.stringify(args)}`);
            const createResult = (await tx[this.model].create(args)) as {
                id: string;
            };

            // verify that nested creates pass policy check
            this.logger.info(`Checking all created models: [${createdModels.join(',')}]`);

            await this.checkPolicyForCreatedModels(createdModels, transactionId, tx);

            return createResult;
        });

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args, where: { id: createResult.id } };
        delete readArgs.data;

        return this.checkReadback(readArgs, 'create', 'create');
    }

    async createMany(args: any, skipDuplicates?: boolean) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError('data field is required and must be an array');
        }

        args = deepcopy(args);

        await this.tryReject('create');

        const transactionId = cuid();

        let createdModels: string[] = [];
        for (const data of ensureArray(args.data)) {
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
        const createResult = await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            // conduct the create
            this.logger.info(`Conducting createMany: ${this.model}:\n${superjson.stringify(args)}`);
            const createResult = await tx[this.model].createMany(args, skipDuplicates);

            // verify that nested creates pass policy check
            this.logger.info(`Checking all created models: [${createdModels.join(',')}]`);

            await this.checkPolicyForCreatedModels(createdModels, transactionId, tx);

            return createResult;
        });

        return createResult;
    }

    async doUpdate(args: any, updateAction: (db: DbOperations) => Promise<unknown>, action: 'update' | 'updateMany') {
        // preprocess payload to modify fields as required by attribute like @password
        await preprocessWritePayload(this.policy, this.model, args.data);

        const transactionId = cuid();

        const result = await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            // make sure the entity (including ones involved in nested write) pass policy check
            await preUpdateCheck(this.model, args, this.user, tx, this.policy, this.logger);

            // inject transaction id into update/create payload (direct and nested)
            const { createdModels } = await injectTransactionId(
                this.model,
                args.data,
                'update',
                transactionId,
                this.policy
            );

            // conduct the update
            this.logger.info(`Conducting update: ${this.model}:\n${superjson.stringify(args)}`);

            const result = await updateAction(tx[this.model]);

            // verify that nested creates pass policy check

            if (createdModels.length > 0) {
                this.logger.info(`Checking all created models: [${createdModels.join(',')}]`);

                await this.checkPolicyForCreatedModels(createdModels, transactionId, tx);
            }

            return result;
        });

        if (action === 'updateMany') {
            return result;
        }

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args };
        delete readArgs.data;

        return this.checkReadback(readArgs, 'update', 'update');
    }

    async update(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError('where field is required in query argument');
        }
        if (!args.data) {
            throw new PrismaClientValidationError('data field is required in query argument');
        }

        args = deepcopy(args);

        await this.tryReject('update');

        return this.doUpdate(args, (db) => db.update(args), 'update');
    }

    async updateMany(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError('data field is required in query argument');
        }

        args = deepcopy(args);

        await this.tryReject('update');

        return this.doUpdate(args, (db) => db.updateMany(args), 'updateMany');
    }

    async upsert(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError('where field is required in query argument');
        }
        if (!args.create) {
            throw new PrismaClientValidationError('create field is required in query argument');
        }
        if (!args.update) {
            throw new PrismaClientValidationError('update field is required in query argument');
        }

        args = deepcopy(args);

        await this.tryReject('create');
        await this.tryReject('update');

        // preprocess payload to modify fields as required by attribute like @password
        await preprocessWritePayload(this.policy, this.model, args.create);
        await preprocessWritePayload(this.policy, this.model, args.update);

        const transactionId = cuid();

        await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            // make sure the entity (including ones involved in nested write) pass policy check
            await preUpdateCheck(this.model, args, this.user, tx, this.policy, this.logger);

            // inject transaction id into update/create payload (direct and nested)
            const { createdModels: createdFromCreate } = await injectTransactionId(
                this.model,
                args.create,
                'create',
                transactionId,
                this.policy
            );

            const { createdModels: createdFromUpdate } = await injectTransactionId(
                this.model,
                args.update,
                'update',
                transactionId,
                this.policy
            );

            const createdModels = [...new Set([...createdFromCreate, ...createdFromUpdate])];

            // conduct the upsert
            this.logger.info(`Conducting upsert: ${this.model}:\n${superjson.stringify(args)}`);

            await tx[this.model].upsert(args);

            // verify that nested creates pass policy check

            await this.checkPolicyForCreatedModels(createdModels, transactionId, tx);
        });

        // verify that the upserted data requested by query args pass policy check
        // note that there's no direct way to know if create or update happened,
        // but since only one can happen, we can use transaction id to filter distinctively
        const readArgs = {
            ...args,
            where: {
                [TRANSACTION_FIELD_NAME]: {
                    in: [`${transactionId}:create`, `${transactionId}:update`],
                },
            },
        };
        delete readArgs.create;
        delete readArgs.update;

        return this.checkReadback(readArgs, 'upsert', 'update');
    }

    async delete(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError('where field is required in query argument');
        }

        args = deepcopy(args);

        await this.tryReject('delete');

        // ensures the item under deletion passes policy check
        await checkPolicyForFilter(this.model, args.where, 'delete', this.user, this.prisma, this.policy, this.logger);

        let readResult: any;
        try {
            const items = await readWithCheck(this.model, args, this.user, this.prisma, this.policy, this.logger);
            readResult = items[0];
        } catch (err) {
            // not readable
            readResult = undefined;
        }

        // conduct the deletion
        this.logger.info(`Conducting delete ${this.model}:\n${superjson.stringify(args)}`);
        await this.modelClient.delete(args);

        if (!readResult) {
            throw deniedByPolicy(this.model, 'delete');
        } else {
            return readResult;
        }
    }

    async deleteMany(args: any) {
        await this.tryReject('delete');

        args = await ensureAuthGuard(args, this.model, 'delete', this.user, this.policy);

        // conduct the deletion
        this.logger.info(`Conducting deleteMany ${this.model}:\n${superjson.stringify(args)}`);
        return this.modelClient.deleteMany(args);
    }

    async aggregate(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        args = deepcopy(args);

        await this.tryReject('read');

        const aggArgs = await ensureAuthGuard(args, this.model, 'read', this.user, this.policy);

        return this.modelClient.aggregate(aggArgs);
    }

    async groupBy(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        args = deepcopy(args);

        await this.tryReject('read');

        const aggArgs = await ensureAuthGuard(args, this.model, 'read', this.user, this.policy);

        return this.modelClient.groupBy(aggArgs);
    }

    async count(args: any) {
        args = args ? deepcopy(args) : args;

        await this.tryReject('read');

        const aggArgs = await ensureAuthGuard(args, this.model, 'read', this.user, this.policy);

        return this.modelClient.count(aggArgs);
    }

    async tryReject(operation: PolicyOperationKind) {
        const guard = await getAuthGuard(this.policy, this.model, operation, this.user);
        if (guard === false) {
            throw deniedByPolicy(this.model, operation);
        }
    }
}
