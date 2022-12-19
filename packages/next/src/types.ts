/* eslint-disable @typescript-eslint/no-explicit-any */
export type AuthUser = { id: string } & Record<string, unknown>;

/**
 * Contract for Prisma db operations
 */
export interface DbOperations {
    findMany(...args: any): Promise<unknown[]>;
    findFirst(...args: any): Promise<unknown>;
    findUnique(...args: any): Promise<unknown>;
    create(...args: any): Promise<unknown>;
    createMany(...args: any): Promise<unknown>;
    update(...args: any): Promise<unknown>;
    updateMany(...args: any): Promise<unknown>;
    upsert(...args: any): Promise<unknown>;
    delete(...args: any): Promise<unknown>;
    deleteMany(...args: any): Promise<unknown>;
    aggregate(...args: any): Promise<unknown>;
    groupBy(...args: any): Promise<unknown>;
    count(...args: any): Promise<number>;
}

/**
 * Prisma operation names
 */
export type DbOperationName = keyof DbOperations;

/**
 * Prisma contract
 */
export type PrismaContract = Record<string, DbOperations>;
