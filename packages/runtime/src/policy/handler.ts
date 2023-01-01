/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClientValidationError } from '@prisma/client/runtime';
import cuid from 'cuid';
import superjson from 'superjson';
import { BatchResult, PrismaProxyHandler } from '../enhancements/proxy';
import { ModelMeta, PolicyDef } from '../enhancements/types';
import { AuthUser, DbClientContract, DbOperations, PolicyOperationKind } from '../types';
import { Logger } from './logger';
import { PolicyUtil } from './policy-utils';

/**
 * Request handler for /data endpoint which processes data CRUD requests.
 */
export class PrismaModelHandler<DbClient extends DbClientContract> implements PrismaProxyHandler {
    private readonly logger: Logger;
    private readonly utils: PolicyUtil;

    constructor(
        private readonly prisma: DbClient,
        private readonly policy: PolicyDef,
        private readonly modelMeta: ModelMeta,
        private readonly model: string,
        private readonly user?: AuthUser
    ) {
        this.logger = new Logger(prisma);
        this.utils = new PolicyUtil(this.prisma, this.modelMeta, this.policy, this.user);
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
        args = this.utils.clone(args);

        const entities = await this.utils.readWithCheck(this.model, args);
        return entities[0] ?? null;
    }

    async findUniqueOrThrow(args: any) {
        const entity = await this.findUnique(args);
        if (!entity) {
            throw this.utils.notFound(this.model);
        }
        return entity;
    }

    async findFirst(args: any) {
        args = this.utils.clone(args);
        const entities = await this.utils.readWithCheck(this.model, args);
        return entities[0] ?? null;
    }

    async findFirstOrThrow(args: any) {
        const entity = await this.findFirst(args);
        if (!entity) {
            throw this.utils.notFound(this.model);
        }
        return entity;
    }

    async findMany(args: any) {
        args = this.utils.clone(args);
        return this.utils.readWithCheck(this.model, args);
    }

    async create(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError('data field is required in query argument');
        }

        await this.tryReject('create');

        const origArgs = args;
        args = this.utils.clone(args);
        const transactionId = cuid();

        const result: any = await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            return this.utils.processWritePayload(this.model, 'create', args, tx, transactionId, () =>
                tx[this.model].create(args)
            );
        });

        if (!result.id) {
            throw new Error(`unexpected error: create didn't return an id`);
        }

        // verify that return data requested by query args pass policy check

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { data, ...restArgs } = origArgs;
        const readArgs = { ...restArgs, where: { id: result.id } };

        return this.checkReadback(readArgs, 'create', 'create');
    }

    async createMany(args: any, skipDuplicates?: boolean) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError('data field is required and must be an array');
        }

        await this.tryReject('create');

        args = this.utils.clone(args);
        const transactionId = cuid();

        const result = await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            return await this.utils.processWritePayload(this.model, 'create', args, tx, transactionId, () =>
                tx[this.model].createMany(args, skipDuplicates)
            );
        });

        return result as BatchResult;
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

        await this.tryReject('update');

        const origArgs = args;
        args = this.utils.clone(args);
        const transactionId = cuid();

        const result: any = await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            return this.utils.processWritePayload(this.model, 'update', args, tx, transactionId, async () =>
                tx[this.model].update(args)
            );
        });

        if (!result.id) {
            throw new Error(`unexpected error: update didn't return an id`);
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { data, ...restArgs } = origArgs;
        const readArgs = { ...restArgs, where: { id: result.id } };
        return this.checkReadback(readArgs, 'update', 'update');
    }

    async updateMany(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.data) {
            throw new PrismaClientValidationError('data field is required in query argument');
        }

        await this.tryReject('update');

        args = this.utils.clone(args);
        const transactionId = cuid();

        const result = await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            return this.utils.processWritePayload(this.model, 'updateMany', args, tx, transactionId, () =>
                tx[this.model].updateMany(args)
            );
        });

        return result as BatchResult;
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

        args = this.utils.clone(args);

        await this.tryReject('create');
        await this.tryReject('update');

        const transactionId = cuid();

        const result: any = await this.prisma.$transaction(async (tx: Record<string, DbOperations>) => {
            return this.utils.processWritePayload(this.model, 'upsert', args, tx, transactionId, () =>
                tx[this.model].upsert(args)
            );
        });

        if (!result.id) {
            throw new Error(`unexpected error: upsert didn't return an id`);
        }

        // verify that the upserted data requested by query args pass policy check
        // note that there's no direct way to know if create or update happened,
        // but since only one can happen, we can use transaction id to filter distinctively

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { create, update, ...restArgs } = args;
        const readArgs = { ...restArgs, where: { id: result.id } };
        return this.checkReadback(readArgs, 'upsert', 'update');
    }

    async delete(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError('where field is required in query argument');
        }

        await this.tryReject('delete');

        args = this.utils.clone(args);

        // ensures the item under deletion passes policy check
        await this.utils.checkPolicyForFilter(this.model, args.where, 'delete', this.prisma);

        let readResult: any;
        try {
            const items = await this.utils.readWithCheck(this.model, args);
            readResult = items[0];
        } catch (err) {
            // not readable
            readResult = undefined;
        }

        // conduct the deletion
        this.logger.info(`Conducting delete ${this.model}:\n${superjson.stringify(args)}`);
        await this.modelClient.delete(args);

        if (!readResult) {
            throw this.utils.deniedByPolicy(this.model, 'delete');
        } else {
            return readResult;
        }
    }

    async deleteMany(args: any) {
        await this.tryReject('delete');

        args = this.utils.clone(args);
        await this.utils.injectAuthGuard(args, this.model, 'delete');

        // conduct the deletion
        this.logger.info(`Conducting deleteMany ${this.model}:\n${superjson.stringify(args)}`);
        return this.modelClient.deleteMany(args);
    }

    async aggregate(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        args = this.utils.clone(args);

        await this.tryReject('read');
        await this.utils.injectAuthGuard(args, this.model, 'read');

        return this.modelClient.aggregate(args);
    }

    async groupBy(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        args = this.utils.clone(args);

        await this.tryReject('read');
        await this.utils.injectAuthGuard(args, this.model, 'read');

        return this.modelClient.groupBy(args);
    }

    async count(args: any) {
        args = args ? this.utils.clone(args) : args;

        await this.tryReject('read');
        await this.utils.injectAuthGuard(args, this.model, 'read');

        return this.modelClient.count(args);
    }

    async tryReject(operation: PolicyOperationKind) {
        const guard = await this.utils.getAuthGuard(this.model, operation);
        if (guard === false) {
            throw this.utils.deniedByPolicy(this.model, operation);
        }
    }

    private async checkReadback(readArgs: any, action: string, operation: PolicyOperationKind) {
        const result = await this.utils.readWithCheck(this.model, readArgs);
        if (result.length === 0) {
            this.logger.warn(`${action} result cannot be read back`);
            throw this.utils.deniedByPolicy(this.model, operation);
        } else if (result.length > 1) {
            throw new Error('update unexpected resulted in multiple readback entities');
        }
        return result[0];
    }
}
