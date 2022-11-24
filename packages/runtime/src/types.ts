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
 * Logging levels
 */
export type LogLevel = 'verbose' | 'info' | 'query' | 'warn' | 'error';

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

    validateModelPayload(
        model: string,
        mode: 'create' | 'update',
        payload: unknown
    ): Promise<void>;

    /**
     * Generates a log message with verbose level.
     */
    verbose(message: string): void;

    /**
     * Generates a log message with info level.
     */
    info(message: string): void;

    /**
     * Generates a log message with warn level.
     */
    warn(message: string): void;

    /**
     * Generates a log message with error level.
     */
    error(message: string): void;

    /**
     * Registers a listener to log events.
     */
    $on(level: LogLevel, callback: (event: LogEvent) => void): void;
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

export function getServerErrorMessage(code: ServerErrorCode): string {
    switch (code) {
        case ServerErrorCode.ENTITY_NOT_FOUND:
            return 'the requested entity is not found';

        case ServerErrorCode.INVALID_REQUEST_PARAMS:
            return 'request parameters are invalid';

        case ServerErrorCode.DENIED_BY_POLICY:
            return 'the request was denied due to access policy violation';

        case ServerErrorCode.UNIQUE_CONSTRAINT_VIOLATION:
            return 'the request failed because of database unique constraint violation';

        case ServerErrorCode.REFERENCE_CONSTRAINT_VIOLATION:
            return 'the request failed because of database foreign key constraint violation';

        case ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED:
            return 'the write operation succeeded, but the data cannot be read back due to access policy violation';

        case ServerErrorCode.UNKNOWN:
            return 'an unknown error occurred';

        default:
            return `generic error: ${code}`;
    }
}

export type LogEventHandler = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LogEvent: any,
    handler: (event: LogEvent) => void
) => void;

export type LogEvent = {
    timestamp: Date;
    query?: string;
    params?: string;
    duration?: number;
    target?: string;
    message?: string;
};

/**
 * Client request options
 */
export type RequestOptions = {
    // disable data fetching
    disabled: boolean;
};

/**
 * Hooks invocation error
 */
export type HooksError = {
    status: number;
    info: {
        code: ServerErrorCode;
        message: string;
    };
};
