/**
 * Weakly-typed database access methods
 */
export interface DbOperations {
    findMany(args: unknown): Promise<unknown[]>;
    findFirst(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
    delete(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
    count(args: unknown): Promise<number>;
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
};

export type DbClientContract = Record<string, DbOperations> & {
    $transaction: <T>(
        action: (tx: Record<string, DbOperations>) => Promise<T>
    ) => Promise<T>;
};

/**
 * The main service of ZenStack. Implementation of this interface is automatically generated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Service<DbClient = any> {
    /**
     * Returns the wrapped Prisma db client
     */
    get db(): DbClient;

    /**
     * Resolves information of a data model field.
     *
     * @param model Model name
     * @param field Field name
     */
    resolveField(model: string, field: string): Promise<FieldInfo | undefined>;

    /**
     * Builds policy check guard object for an operation over a model, which will be injected to
     * the query body sent to Prisma client.
     *
     * @param model Model name
     * @param operation Operation kind
     * @param context Query context
     */
    buildQueryGuard(
        model: string,
        operation: PolicyOperationKind,
        context: QueryContext
    ): Promise<unknown>;
}

/**
 * Error codes for errors on server side
 */
export enum ServerErrorCode {
    /**
     * The specified entity cannot be found
     */
    ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',

    /**
     * The request parameter is invalid, either containing invalid fields or missing required fields
     */
    INVALID_REQUEST_PARAMS = 'INVALID_REQUEST_PARAMS',

    /**
     * The request is rejected by policy checks
     */
    DENIED_BY_POLICY = 'DENIED_BY_POLICY',

    /**
     * Violation of database unique constraints
     */
    UNIQUE_CONSTRAINT_VIOLATION = 'UNIQUE_CONSTRAINT_VIOLATION',

    /**
     * Violation of database reference constraint (aka. foreign key constraints)
     */
    REFERENCE_CONSTRAINT_VIOLATION = 'REFERENCE_CONSTRAINT_VIOLATION',

    /**
     * A write operation succeeded but the result cannot be read back due to policy control
     */
    READ_BACK_AFTER_WRITE_DENIED = 'READ_BACK_AFTER_WRITE_DENIED',

    /**
     * Unknown error
     */
    UNKNOWN = 'UNKNOWN',
}
