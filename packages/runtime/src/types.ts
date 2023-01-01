/**
 * Weakly-typed database access methods
 */
export interface DbOperations {
    findMany(args?: unknown): Promise<unknown[]>;
    findFirst(args: unknown): Promise<unknown>;
    findFirstOrThrow(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    findUniqueOrThrow(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    createMany(args: unknown, skipDuplicates?: boolean): Promise<{ count: number }>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
    upsert(args: unknown): Promise<unknown>;
    delete(args: unknown): Promise<unknown>;
    deleteMany(args?: unknown): Promise<{ count: number }>;
    aggregate(args: unknown): Promise<unknown>;
    groupBy(args: unknown): Promise<unknown>;
    count(args?: unknown): Promise<unknown>;
}

/**
 * Kinds of access policy
 */
export type PolicyKind = 'allow' | 'deny';

/**
 * Kinds of operations controlled by access policies
 */
export type PolicyOperationKind = 'create' | 'update' | 'read' | 'delete';

/**
 * Current login user info
 *
 * @todo Support for non-string "id" field
 */
export type AuthUser = { id: string } & Record<string, unknown>;

/**
 * Context for database query
 */
export type QueryContext = {
    /**
     * Current login user (provided by @see RequestHandlerOptions)
     */
    user?: AuthUser;
};

export type RuntimeAttribute = {
    name: string;
    args: Array<{ name?: string; value: unknown }>;
};

/**
 * Runtime information of a data model field
 */
export type FieldInfo = {
    name: string;
    type: string;
    isDataModel: boolean;
    isArray: boolean;
    isOptional: boolean;
    attributes: RuntimeAttribute[];
    backLink?: string;
};

export type DbClientContract = Record<string, DbOperations> & {
    $transaction: <T>(action: (tx: Record<string, DbOperations>) => Promise<T>) => Promise<T>;
};

/**
 * Client request options
 */
export type RequestOptions<T> = {
    // disable data fetching
    disabled?: boolean;
    initialData?: T;
};

/**
 * Hooks invocation error
 */
export type HooksError = {
    status: number;
    info: {
        message: string;
    };
};

export const PrismaWriteActions = [
    'create',
    'createMany',
    'connectOrCreate',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
] as const;

export type PrismaWriteActionType = typeof PrismaWriteActions[number];
