import { getDbErrorCode } from './executor/error-processor';

/**
 * Reason code for ORM errors.
 */
export enum ORMErrorReason {
    /**
     * ORM client configuration error.
     */
    CONFIG_ERROR = 'config-error',

    /**
     * Invalid input error.
     */
    INVALID_INPUT = 'invalid-input',

    /**
     * The specified record was not found.
     */
    NOT_FOUND = 'not-found',

    /**
     * Operation is rejected by access policy.
     */
    REJECTED_BY_POLICY = 'rejected-by-policy',

    /**
     * Error was thrown by the underlying database driver.
     */
    DB_QUERY_ERROR = 'db-query-error',

    /**
     * The requested operation is not supported.
     */
    NOT_SUPPORTED = 'not-supported',

    /**
     * An internal error occurred.
     */
    INTERNAL_ERROR = 'internal-error',
}

/**
 * Reason code for policy rejection.
 */
export enum RejectedByPolicyReason {
    /**
     * Rejected because the operation is not allowed by policy.
     */
    NO_ACCESS = 'no-access',

    /**
     * Rejected because the result cannot be read back after mutation due to policy.
     */
    CANNOT_READ_BACK = 'cannot-read-back',

    /**
     * Other reasons.
     */
    OTHER = 'other',
}

/**
 * ZenStack ORM error.
 */
export class ORMError extends Error {
    constructor(
        public reason: ORMErrorReason,
        message?: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }

    /**
     * The name of the model that the error pertains to.
     */
    public model?: string;

    /**
     * The error code given by the underlying database driver.
     */
    public dbErrorCode?: unknown;

    /**
     * The error message given by the underlying database driver.
     */
    public dbErrorMessage?: string;

    /**
     * The reason code for policy rejection. Only available when `reason` is `REJECTED_BY_POLICY`.
     */
    public rejectedByPolicyReason?: RejectedByPolicyReason;

    /**
     * Custom error codes from every policy rule that contributed to this rejection.
     * Set via the optional third argument of `@@allow` / `@@deny`. Only available when
     * `reason` is `REJECTED_BY_POLICY` and at least one matching rule carries a code.
     * Note: surfaced for `create`, `post-update`, `update`, `delete`, and single-row `read`
     * violations. For `read`, only `findFirst`/`findUnique`-equivalent queries (LIMIT 1)
     * where a denied row exists will throw; `findMany` uses filter-based enforcement.
     */
    public policyCodes?: string[];

    /**
     * The SQL query that was executed. Only available when `reason` is `DB_QUERY_ERROR`.
     */
    public sql?: string;

    /**
     * The parameters used in the SQL query. Only available when `reason` is `DB_QUERY_ERROR`.
     */
    public sqlParams?: readonly unknown[];
}

export function createConfigError(message: string, options?: ErrorOptions) {
    return new ORMError(ORMErrorReason.CONFIG_ERROR, message, options);
}

export function createNotFoundError(model: string, message?: string, options?: ErrorOptions) {
    const error = new ORMError(ORMErrorReason.NOT_FOUND, message ?? 'Record not found', options);
    error.model = model;
    return error;
}

export function createInvalidInputError(message: string, model?: string, options?: ErrorOptions) {
    const error = new ORMError(ORMErrorReason.INVALID_INPUT, message, options);
    error.model = model;
    return error;
}

export function createDBQueryError(message: string, dbError: unknown, sql: string, parameters: readonly unknown[]) {
    const error = new ORMError(ORMErrorReason.DB_QUERY_ERROR, message, { cause: dbError });
    error.dbErrorCode = getDbErrorCode(dbError);
    error.dbErrorMessage = dbError instanceof Error ? dbError.message : undefined;
    error.sql = sql;
    error.sqlParams = parameters;
    return error;
}

export function createRejectedByPolicyError(
    model: string,
    reason: RejectedByPolicyReason,
    message: string,
    options?: ErrorOptions,
) {
    const error = new ORMError(ORMErrorReason.REJECTED_BY_POLICY, message, options);
    error.model = model;
    error.rejectedByPolicyReason = reason;
    return error;
}

export function createNotSupportedError(message: string, options?: ErrorOptions) {
    return new ORMError(ORMErrorReason.NOT_SUPPORTED, message, options);
}

export function createInternalError(message: string, model?: string, options?: ErrorOptions) {
    const error = new ORMError(ORMErrorReason.INTERNAL_ERROR, message, options);
    error.model = model;
    return error;
}
