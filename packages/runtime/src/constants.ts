/**
 * Default length of password hash salt (used by bcryptjs to hash password)
 */
export const DEFAULT_PASSWORD_SALT_LENGTH = 12;

/**
 * Auxiliary database field for supporting policy check for nested writes
 */
export const TRANSACTION_FIELD_NAME = 'zenstack_transaction';

/**
 * Auxiliary database field for building up policy check queries
 */
export const GUARD_FIELD_NAME = 'zenstack_guard';

/**
 * All Auxiliary fields.
 */
export const AUXILIARY_FIELDS = [TRANSACTION_FIELD_NAME, GUARD_FIELD_NAME];

/**
 * Reasons for a CRUD operation to fail
 */
export enum CrudFailureReason {
    /**
     * CRUD suceeded but the result was not readable.
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
