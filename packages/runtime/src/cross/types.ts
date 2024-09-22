/**
 * Prisma write operation kinds
 */
export const PrismaWriteActions = [
    'create',
    'createMany',
    'createManyAndReturn',
    'connectOrCreate',
    'update',
    'updateMany',
    'upsert',
    'connect',
    'disconnect',
    'set',
    'delete',
    'deleteMany',
] as const;

/**
 * Prisma write operation kinds
 */
export type PrismaWriteActionType = (typeof PrismaWriteActions)[number];

/**
 * Maybe promise
 */
export type MaybePromise<T> = T | Promise<T> | PromiseLike<T>;
