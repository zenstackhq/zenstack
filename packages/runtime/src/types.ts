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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preValue?: any;
};

export type RuntimeAttribute = {
    name: string;
    args: Array<{ name?: string; value: unknown }>;
};

/**
 * Runtime information of a data model field
 */
export type FieldInfo = {
    /**
     * Field name
     */
    name: string;

    /**
     * Field type name
     */
    type: string;

    /**
     * If the field is an ID field or part of a multi-field ID
     */
    isId: boolean;

    /**
     * If the field type is a data model (or an optional/array of data model)
     */
    isDataModel: boolean;

    /**
     * If the field is an array
     */
    isArray: boolean;

    /**
     * If the field is optional
     */
    isOptional: boolean;

    /**
     * Attributes on the field
     */
    attributes: RuntimeAttribute[];

    /**
     * If the field is a relation field, the field name of the reverse side of the relation
     */
    backLink?: string;

    /**
     * If the field is the owner side of a relation
     */
    isRelationOwner: boolean;
};

export type DbClientContract = Record<string, DbOperations> & {
    $transaction: <T>(action: (tx: Record<string, DbOperations>) => Promise<T>) => Promise<T>;
};

export const PrismaWriteActions = [
    'create',
    'createMany',
    'connectOrCreate',
    'update',
    'updateMany',
    'upsert',
    'connect',
    'disconnect',
    'delete',
    'deleteMany',
] as const;

export type PrismaWriteActionType = (typeof PrismaWriteActions)[number];
