/**
 * Auxiliary database field for supporting policy check for nested writes
 */
export const TRANSACTION_FIELD_NAME = 'zenstack_transaction';

/**
 * Auxiliary database field for building up policy check queries
 */
export const GUARD_FIELD_NAME = 'zenstack_guard';

/**
 * Default length of password hash salt (used by bcryptjs to hash password)
 */
export const DEFAULT_PASSWORD_SALT_LENGTH = 12;
