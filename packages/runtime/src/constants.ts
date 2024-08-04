/**
 * Default path for loading CLI-generated code
 */
export const DEFAULT_RUNTIME_LOAD_PATH = '.zenstack';

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
 * Field name for getting current enhancer
 */
export const PRISMA_PROXY_ENHANCER = '$__zenstack_enhancer';

/**
 * Minimum Prisma version supported
 */
export const PRISMA_MINIMUM_VERSION = '5.0.0';

/**
 * Prefix for auxiliary relation field generated for delegated models
 */
export const DELEGATE_AUX_RELATION_PREFIX = 'delegate_aux';
