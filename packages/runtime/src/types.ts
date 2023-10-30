/* eslint-disable @typescript-eslint/no-explicit-any */

export type PrismaPromise<T> = Promise<T> & Record<string, (args?: any) => PrismaPromise<any>>;

/**
 * Weakly-typed database access methods
 */
export interface DbOperations {
    findMany(args?: unknown): Promise<any[]>;
    findFirst(args?: unknown): PrismaPromise<any>;
    findFirstOrThrow(args?: unknown): PrismaPromise<any>;
    findUnique(args: unknown): PrismaPromise<any>;
    findUniqueOrThrow(args: unknown): PrismaPromise<any>;
    create(args: unknown): Promise<any>;
    createMany(args: unknown, skipDuplicates?: boolean): Promise<{ count: number }>;
    update(args: unknown): Promise<any>;
    updateMany(args: unknown): Promise<{ count: number }>;
    upsert(args: unknown): Promise<any>;
    delete(args: unknown): Promise<any>;
    deleteMany(args?: unknown): Promise<{ count: number }>;
    aggregate(args: unknown): Promise<any>;
    groupBy(args: unknown): Promise<any>;
    count(args?: unknown): Promise<any>;
    subscribe(args?: unknown): Promise<any>;
    fields: Record<string, any>;
}

/**
 * Kinds of access policy
 */
export type PolicyKind = 'allow' | 'deny';

/**
 * Kinds of operations controlled by access policies
 */
export type PolicyOperationKind = 'create' | 'update' | 'postUpdate' | 'read' | 'delete';

/**
 * Current login user info
 */
export type AuthUser = Record<string, unknown>;

/**
 * Context for database query
 */
export type QueryContext = {
    /**
     * Current login user (provided by @see RequestHandlerOptions)
     */
    user?: AuthUser;

    /**
     * Pre-update value of the entity
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preValue?: any;
};

export type DbClientContract = Record<string, DbOperations> & {
    $transaction: <T>(action: (tx: Record<string, DbOperations>) => Promise<T>, options?: unknown) => Promise<T>;
};
