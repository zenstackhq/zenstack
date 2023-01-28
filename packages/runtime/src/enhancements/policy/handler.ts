/* eslint-disable @typescript-eslint/no-explicit-any */

import { PrismaClientValidationError } from '@prisma/client/runtime';
import { format } from 'util';
import { AuthUser, DbClientContract, PolicyOperationKind } from '../../types';
import { BatchResult, PrismaProxyHandler } from '../proxy';
import { ModelMeta, PolicyDef } from '../types';
import { Logger } from './logger';
import { PolicyUtil } from './policy-utils';

/**
 * Prisma proxy handler for injecting access policy check.
 */
export class PolicyProxyHandler<DbClient extends DbClientContract> implements PrismaProxyHandler {
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

        // use a transaction to wrap the write so it can be reverted if the created
        // entity fails access policies
        const result: any = await this.utils.processWrite(this.model, 'create', args, (dbOps, writeArgs) =>
            dbOps.create(writeArgs)
        );

        if (!this.utils.getEntityId(this.model, result)) {
            throw this.utils.unknownError(`unexpected error: create didn't return an id`);
        }

        return this.checkReadback(origArgs, this.utils.getEntityId(this.model, result), 'create', 'create');
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

        // use a transaction to wrap the write so it can be reverted if any created
        // entity fails access policies
        const result = await this.utils.processWrite(this.model, 'create', args, (dbOps, writeArgs) =>
            dbOps.createMany(writeArgs, skipDuplicates)
        );

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

        // use a transaction to wrap the write so it can be reverted if any nested
        // create fails access policies
        const result: any = await this.utils.processWrite(this.model, 'update', args, (dbOps, writeArgs) =>
            dbOps.update(writeArgs)
        );

        if (!this.utils.getEntityId(this.model, result)) {
            throw this.utils.unknownError(`unexpected error: update didn't return an id`);
        }
        return this.checkReadback(origArgs, this.utils.getEntityId(this.model, result), 'update', 'update');
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

        // use a transaction to wrap the write so it can be reverted if any nested
        // create fails access policies
        const result = await this.utils.processWrite(this.model, 'updateMany', args, (dbOps, writeArgs) =>
            dbOps.updateMany(writeArgs)
        );

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

        const origArgs = args;
        args = this.utils.clone(args);

        await this.tryReject('create');
        await this.tryReject('update');

        // use a transaction to wrap the write so it can be reverted if any nested
        // create fails access policies
        const result: any = await this.utils.processWrite(this.model, 'upsert', args, (dbOps, writeArgs) =>
            dbOps.upsert(writeArgs)
        );

        if (!this.utils.getEntityId(this.model, result)) {
            throw this.utils.unknownError(`unexpected error: upsert didn't return an id`);
        }

        return this.checkReadback(origArgs, this.utils.getEntityId(this.model, result), 'upsert', 'update');
    }

    async delete(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }
        if (!args.where) {
            throw new PrismaClientValidationError('where field is required in query argument');
        }

        await this.tryReject('delete');

        // ensures the item under deletion passes policy check
        await this.utils.checkPolicyForFilter(this.model, args.where, 'delete', this.prisma);

        // read the entity under deletion with respect to read policies
        let readResult: any;
        try {
            const items = await this.utils.readWithCheck(this.model, args);
            readResult = items[0];
        } catch (err) {
            // not readable
            readResult = undefined;
        }

        // conduct the deletion
        this.logger.info(`Conducting delete ${this.model}:\n${format(args)}`);
        await this.modelClient.delete(args);

        if (!readResult) {
            throw this.utils.deniedByPolicy(this.model, 'delete', 'result not readable');
        } else {
            return readResult;
        }
    }

    async deleteMany(args: any) {
        await this.tryReject('delete');

        // inject policy conditions
        args = args ?? {};
        await this.utils.injectAuthGuard(args, this.model, 'delete');

        // conduct the deletion
        this.logger.info(`Conducting deleteMany ${this.model}:\n${format(args)}`);
        return this.modelClient.deleteMany(args);
    }

    async aggregate(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        await this.tryReject('read');

        // inject policy conditions
        await this.utils.injectAuthGuard(args, this.model, 'read');
        return this.modelClient.aggregate(args);
    }

    async groupBy(args: any) {
        if (!args) {
            throw new PrismaClientValidationError('query argument is required');
        }

        await this.tryReject('read');

        // inject policy conditions
        await this.utils.injectAuthGuard(args, this.model, 'read');

        return this.modelClient.groupBy(args);
    }

    async count(args: any) {
        await this.tryReject('read');

        // inject policy conditions
        args = args ?? {};
        await this.utils.injectAuthGuard(args, this.model, 'read');
        return this.modelClient.count(args);
    }

    async tryReject(operation: PolicyOperationKind) {
        const guard = await this.utils.getAuthGuard(this.model, operation);
        if (guard === false) {
            throw this.utils.deniedByPolicy(this.model, operation);
        }
    }

    private async checkReadback(origArgs: any, id: any, action: string, operation: PolicyOperationKind) {
        const idField = this.utils.getIdField(this.model);
        const readArgs = { select: origArgs.select, include: origArgs.include, where: { [idField.name]: id } };
        const result = await this.utils.readWithCheck(this.model, readArgs);
        if (result.length === 0) {
            this.logger.warn(`${action} result cannot be read back`);
            throw this.utils.deniedByPolicy(this.model, operation, 'result not readable');
        } else if (result.length > 1) {
            throw this.utils.unknownError('write unexpected resulted in multiple readback entities');
        }
        return result[0];
    }
}
