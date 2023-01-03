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
