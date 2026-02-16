/**
 * The comment prefix for annotation generated Kysely queries with context information.
 */
export const CONTEXT_COMMENT_PREFIX = '-- $$context:';

/**
 * The types of fields that are numeric.
 */
export const NUMERIC_FIELD_TYPES = ['Int', 'Float', 'BigInt', 'Decimal'];

/**
 * Client API methods that are not supported in transactions.
 */
export const TRANSACTION_UNSUPPORTED_METHODS = ['$transaction', '$connect', '$disconnect', '$use'] as const;

/**
 * Prefix for JSON field used to store joined delegate rows.
 */
export const DELEGATE_JOINED_FIELD_PREFIX = '$delegate$';

/**
 * Logical combinators used in filters.
 */
export const LOGICAL_COMBINATORS = ['AND', 'OR', 'NOT'] as const;

/**
 * Aggregation operators.
 */
export const AggregateOperators = ['_count', '_sum', '_avg', '_min', '_max'] as const;
export type AggregateOperators = (typeof AggregateOperators)[number];

/**
 * Mapping of filter operators to their corresponding filter kind categories.
 */
export const FILTER_PROPERTY_TO_KIND = {
    // Equality operators
    equals: 'Equality',
    not: 'Equality',
    in: 'Equality',
    notIn: 'Equality',

    // Range operators
    lt: 'Range',
    lte: 'Range',
    gt: 'Range',
    gte: 'Range',
    between: 'Range',

    // Like operators
    contains: 'Like',
    startsWith: 'Like',
    endsWith: 'Like',
    mode: 'Like',

    // Relation operators
    is: 'Relation',
    isNot: 'Relation',
    some: 'Relation',
    every: 'Relation',
    none: 'Relation',

    // Json operators
    path: 'Json',
    string_contains: 'Json',
    string_starts_with: 'Json',
    string_ends_with: 'Json',
    array_contains: 'Json',
    array_starts_with: 'Json',
    array_ends_with: 'Json',

    // List operators
    has: 'List',
    hasEvery: 'List',
    hasSome: 'List',
    isEmpty: 'List',
} as const;

/**
 * Mapping of filter operators to their corresponding filter kind categories.
 */
export type FilterPropertyToKind = typeof FILTER_PROPERTY_TO_KIND;
