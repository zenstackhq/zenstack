/**
 * Contract for Prisma db operations
 */
export interface DbOperations {
    findMany(...args: unknown[]): Promise<unknown[]>;
    findFirst(...args: unknown[]): Promise<unknown>;
    findUnique(...args: unknown[]): Promise<unknown>;
    create(...args: unknown[]): Promise<unknown>;
    createMany(...args: unknown[]): Promise<unknown>;
    update(...args: unknown[]): Promise<unknown>;
    updateMany(...args: unknown[]): Promise<unknown>;
    upsert(...args: unknown[]): Promise<unknown>;
    delete(...args: unknown[]): Promise<unknown>;
    deleteMany(...args: unknown[]): Promise<unknown>;
    aggregate(...args: unknown[]): Promise<unknown>;
    groupBy(...args: unknown[]): Promise<unknown>;
    count(...args: unknown[]): Promise<number>;
}

/**
 * Prisma operation names
 */
export type DbOperationName = keyof DbOperations;

/**
 * Prisma contract
 */
export type PrismaContract = Record<string, DbOperations>;
