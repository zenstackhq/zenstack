/**
 * Default length of password hash salt (used by bcryptjs to hash password)
 */
export const DEFAULT_PASSWORD_SALT_LENGTH = 12;

/**
 * Reasons for a CRUD operation to fail
 */
export enum CrudFailureReason {
    /**
     * CRUD failed because of access policy violation.
     */
    ACCESS_POLICY_VIOLATION = 'ACCESS_POLICY_VIOLATION',

    /**
     * CRUD succeeded but the result was not readable.
     */
    RESULT_NOT_READABLE = 'RESULT_NOT_READABLE',

    /**
     * CRUD failed because of a data validation rule violation.
     */
    DATA_VALIDATION_VIOLATION = 'DATA_VALIDATION_VIOLATION',
}

/**
 * Prisma error codes used
 */
export enum PrismaErrorCode {
    /**
     * Unique constraint failed
     */
    UNIQUE_CONSTRAINT_FAILED = 'P2002',

    /**
     * A constraint failed on the database
     */
    CONSTRAINED_FAILED = 'P2004',

    /**
     * The required connected records were not found
     */
    REQUIRED_CONNECTED_RECORD_NOT_FOUND = 'P2018',

    /**
     * An operation failed because it depends on one or more records that were required but not found
     */
    DEPEND_ON_RECORD_NOT_FOUND = 'P2025',
}

/**
 * Field name for storing in-transaction flag
 */
export const PRISMA_TX_FLAG = '$__zenstack_tx';

/**
 * Field name for getting current enhancer
 */
export const PRISMA_PROXY_ENHANCER = '$__zenstack_enhancer';

/**
 * Minimum Prisma version supported
 */
export const PRISMA_MINIMUM_VERSION = '4.8.0';

/**
 * Selector function name for fetching pre-update entity values.
 */
export const PRE_UPDATE_VALUE_SELECTOR = 'preValueSelect';

/**
 * Prefix for field-level read checker function name
 */
export const FIELD_LEVEL_READ_CHECKER_PREFIX = 'readFieldCheck$';

/**
 * Field-level access control evaluation selector function name
 */
export const FIELD_LEVEL_READ_CHECKER_SELECTOR = 'readFieldSelect';

/**
 * Prefix for field-level update guard function name
 */
export const FIELD_LEVEL_UPDATE_GUARD_PREFIX = 'updateFieldCheck$';

/**
 * Flag that indicates if the model has field-level access control
 */
export const HAS_FIELD_LEVEL_POLICY_FLAG = 'hasFieldLevelPolicy';
