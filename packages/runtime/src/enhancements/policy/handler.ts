/* eslint-disable @typescript-eslint/no-explicit-any */

import { CrudFailureReason } from '../../constants';
import { AuthUser, DbClientContract, PolicyOperationKind } from '../../types';
import { BatchResult, PrismaProxyHandler } from '../proxy';
import { ModelMeta, PolicyDef } from '../types';
import { prismaClientValidationError } from '../utils';
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
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }

        const guard = await this.utils.getAuthGuard(this.model, 'read');
        if (guard === false) {
            return null;
        }

        const entities = await this.utils.readWithCheck(this.model, args);
        return entities[0] ?? null;
    }

    async findUniqueOrThrow(args: any) {
        const guard = await this.utils.getAuthGuard(this.model, 'read');
        if (guard === false) {
            throw this.utils.notFound(this.model);
        }

        const entity = await this.findUnique(args);
        if (!entity) {
            throw this.utils.notFound(this.model);
        }
        return entity;
    }

    async findFirst(args: any) {
        const guard = await this.utils.getAuthGuard(this.model, 'read');
        if (guard === false) {
            return null;
        }

        const entities = await this.utils.readWithCheck(this.model, args);
        return entities[0] ?? null;
    }

    async findFirstOrThrow(args: any) {
        const guard = await this.utils.getAuthGuard(this.model, 'read');
        if (guard === false) {
            throw this.utils.notFound(this.model);
        }

        const entity = await this.findFirst(args);
        if (!entity) {
            throw this.utils.notFound(this.model);
        }
        return entity;
    }

    async findMany(args: any) {
        const guard = await this.utils.getAuthGuard(this.model, 'read');
        if (guard === false) {
            return [];
        }

        return this.utils.readWithCheck(this.model, args);
    }

    async create(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required in query argument');
        }

        await this.tryReject('create');

        const origArgs = args;
        args = this.utils.clone(args);

        // use a transaction to wrap the write so it can be reverted if the created
        // entity fails access policies
        const result: any = await this.utils.processWrite(this.model, 'create', args, (dbOps, writeArgs) =>
            dbOps.create(writeArgs)
        );

        const ids = this.utils.getEntityIds(this.model, result);
        if (Object.keys(ids).length === 0) {
            throw this.utils.unknownError(`unexpected error: create didn't return an id`);
        }

        return this.checkReadback(origArgs, ids, 'create', 'create');
    }

    async createMany(args: any, skipDuplicates?: boolean) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required and must be an array');
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
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required in query argument');
        }

        await this.tryReject('update');

        const origArgs = args;
        args = this.utils.clone(args);

        // use a transaction to wrap the write so it can be reverted if any nested
        // create fails access policies
        const result: any = await this.utils.processWrite(this.model, 'update', args, (dbOps, writeArgs) =>
            dbOps.update(writeArgs)
        );

        const ids = this.utils.getEntityIds(this.model, result);
        if (Object.keys(ids).length === 0) {
            throw this.utils.unknownError(`unexpected error: update didn't return an id`);
        }
        return this.checkReadback(origArgs, ids, 'update', 'update');
    }

    async updateMany(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required in query argument');
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
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }
        if (!args.create) {
            throw prismaClientValidationError(this.prisma, 'create field is required in query argument');
        }
        if (!args.update) {
            throw prismaClientValidationError(this.prisma, 'update field is required in query argument');
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

        const ids = this.utils.getEntityIds(this.model, result);
        if (Object.keys(ids).length === 0) {
            throw this.utils.unknownError(`unexpected error: upsert didn't return an id`);
        }

        return this.checkReadback(origArgs, ids, 'upsert', 'update');
    }

    async delete(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
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
        await this.modelClient.delete(args);

        if (!readResult) {
            throw this.utils.deniedByPolicy(
                this.model,
                'delete',
                'result is not allowed to be read back',
                CrudFailureReason.RESULT_NOT_READABLE
            );
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
        return this.modelClient.deleteMany(args);
    }

    async aggregate(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }

        await this.tryReject('read');

        // inject policy conditions
        await this.utils.injectAuthGuard(args, this.model, 'read');
        return this.modelClient.aggregate(args);
    }

    async groupBy(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
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

    private async checkReadback(
        origArgs: any,
        ids: Record<string, unknown>,
        action: string,
        operation: PolicyOperationKind
    ) {
        const readArgs = { select: origArgs.select, include: origArgs.include, where: ids };
        const result = await this.utils.readWithCheck(this.model, readArgs);
        if (result.length === 0) {
            this.logger.warn(`${action} result cannot be read back`);
            throw this.utils.deniedByPolicy(
                this.model,
                operation,
                'result is not allowed to be read back',
                CrudFailureReason.RESULT_NOT_READABLE
            );
        } else if (result.length > 1) {
            throw this.utils.unknownError('write unexpected resulted in multiple readback entities');
        }
        return result[0];
    }
}
