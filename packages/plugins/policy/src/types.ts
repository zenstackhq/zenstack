import type { CRUD_EXT } from '@zenstackhq/orm';
import type { Expression } from '@zenstackhq/orm/schema';

/**
 * Access policy kind.
 */
export type PolicyKind = 'allow' | 'deny';

/**
 * Access policy operation.
 */
export type PolicyOperation = CRUD_EXT | 'all';

/**
 * Access policy definition.
 */
export type Policy = {
    kind: PolicyKind;
    operations: readonly PolicyOperation[];
    condition: Expression;
    code?: string;
};

/**
 * Operators allowed for collection predicate expressions.
 */
export const CollectionPredicateOperator = ['?', '!', '^'] as const;

/**
 * Operators allowed for collection predicate expressions.
 */
export type CollectionPredicateOperator = (typeof CollectionPredicateOperator)[number];
