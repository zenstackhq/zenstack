/* eslint-disable @typescript-eslint/no-explicit-any */

import { DbClientContract } from '../types';

export type BatchResult = { count: number };

export interface PrismaProxyHandler {
    findUnique(args: any): Promise<unknown | null>;

    findUniqueOrThrow(args: any): Promise<unknown>;

    findFirst(args: any): Promise<unknown | null>;

    findFirstOrThrow(args: any): Promise<unknown>;

    findMany(args: any): Promise<unknown[]>;

    create(args: any): Promise<unknown>;

    createMany(args: any, skipDuplicates?: boolean): Promise<BatchResult>;

    update(args: any): Promise<unknown>;

    updateMany(args: any): Promise<BatchResult>;

    upsert(args: any): Promise<unknown>;

    delete(args: any): Promise<unknown>;

    deleteMany(args: any): Promise<BatchResult>;

    aggregate(args: any): Promise<unknown>;

    groupBy(args: any): Promise<unknown>;

    count(args: any): Promise<unknown | number>;
}

export type PrismaProxyActions = keyof PrismaProxyHandler;

export class DefaultPrismaProxyHandler implements PrismaProxyHandler {
    constructor(protected readonly prisma: DbClientContract, protected readonly model: string) {}

    async findUnique(args: any): Promise<unknown> {
        args = await this.preprocessArgs('findUnique', args);
        const r = await this.prisma[this.model].findUnique(args);
        return this.processResultEntity(r);
    }

    async findUniqueOrThrow(args: any): Promise<unknown> {
        args = await this.preprocessArgs('findUniqueOrThrow', args);
        const r = await this.prisma[this.model].findUniqueOrThrow(args);
        return this.processResultEntity(r);
    }

    async findFirst(args: any): Promise<unknown> {
        args = await this.preprocessArgs('findFirst', args);
        const r = this.prisma[this.model].findFirst(args);
        return this.processResultEntity(r);
    }

    async findFirstOrThrow(args: any): Promise<unknown> {
        args = await this.preprocessArgs('findFirstOrThrow', args);
        const r = await this.prisma[this.model].findFirstOrThrow(args);
        return this.processResultEntity(r);
    }

    async findMany(args: any): Promise<unknown[]> {
        args = await this.preprocessArgs('findMany', args);
        const r = await this.prisma[this.model].findMany(args);
        return this.processResultEntity(r);
    }

    async create(args: any): Promise<unknown> {
        args = await this.preprocessArgs('create', args);
        const r = await this.prisma[this.model].create(args);
        return this.processResultEntity(r);
    }

    async createMany(args: any, skipDuplicates?: boolean | undefined): Promise<{ count: number }> {
        args = await this.preprocessArgs('createMany', args);
        return this.prisma[this.model].createMany(args, skipDuplicates);
    }

    async update(args: any): Promise<unknown> {
        args = await this.preprocessArgs('update', args);
        const r = this.prisma[this.model].update(args);
        return this.processResultEntity(r);
    }

    async updateMany(args: any): Promise<{ count: number }> {
        args = await this.preprocessArgs('updateMany', args);
        return this.prisma[this.model].updateMany(args);
    }

    async upsert(args: any): Promise<unknown> {
        args = await this.preprocessArgs('upsert', args);
        const r = this.prisma[this.model].upsert(args);
        return this.processResultEntity(r);
    }

    async delete(args: any): Promise<unknown> {
        args = await this.preprocessArgs('delete', args);
        const r = this.prisma[this.model].delete(args);
        return this.processResultEntity(r);
    }

    async deleteMany(args: any): Promise<{ count: number }> {
        args = await this.preprocessArgs('deleteMany', args);
        return this.prisma[this.model].deleteMany(args);
    }

    async aggregate(args: any): Promise<unknown> {
        args = await this.preprocessArgs('aggregate', args);
        return this.prisma[this.model].aggregate(args);
    }

    async groupBy(args: any): Promise<unknown> {
        args = await this.preprocessArgs('groupBy', args);
        return this.prisma[this.model].groupBy(args);
    }

    async count(args: any): Promise<unknown> {
        args = await this.preprocessArgs('count', args);
        return this.prisma[this.model].count(args);
    }

    protected async processResultEntity<T>(data: T): Promise<T> {
        return data;
    }

    protected async preprocessArgs(method: PrismaProxyActions, args: any) {
        return args;
    }
}

export function makeProxy<T extends PrismaProxyHandler>(
    prisma: any,
    makeHandler: (prisma: object, model: string) => T
) {
    return new Proxy(prisma, {
        get: (target: any, prop: string | symbol, receiver: any) => {
            if (typeof prop !== 'string' || prop.startsWith('$') || prop.startsWith('_engine')) {
                return Reflect.get(target, prop, receiver);
            }

            const propVal = Reflect.get(target, prop, receiver);
            if (!propVal) {
                return undefined;
            }

            return makeHandler(prisma, prop);
        },
    });
}
