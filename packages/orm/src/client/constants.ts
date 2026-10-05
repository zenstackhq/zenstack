// /**
//  * The comment prefix for annotation generated Kysely queries with context information.
//  */
// export const CONTEXT_COMMENT_PREFIX = '-- $$context:';

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

    // Fuzzy search operators
    fuzzy: 'Fuzzy',

    // Full-text search operators
    fts: 'FullText',

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

/**
 * List of core CRUD operations. It excludes the 'orThrow' variants.
 */
export const CoreCrudOperations = [
    'findMany',
    'findUnique',
    'findFirst',
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'upsert',
    'delete',
    'deleteMany',
    'count',
    'aggregate',
    'groupBy',
    'exists',
] as const;

/**
 * List of core CRUD operations. It excludes the 'orThrow' variants.
 */
export type CoreCrudOperations = (typeof CoreCrudOperations)[number];

/**
 * List of core read operations. It excludes the 'orThrow' variants.
 */
export const CoreReadOperations = [
    'findMany',
    'findUnique',
    'findFirst',
    'count',
    'aggregate',
    'groupBy',
    'exists',
] as const;

/**
 * List of core read operations. It excludes the 'orThrow' variants.
 */
export type CoreReadOperations = (typeof CoreReadOperations)[number];

/**
 * List of core write operations.
 */
export const CoreWriteOperations = [
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'upsert',
    'delete',
    'deleteMany',
] as const;

/**
 * List of core write operations.
 */
export type CoreWriteOperations = (typeof CoreWriteOperations)[number];

/**
 * List of core create operations.
 */
export const CoreCreateOperations = ['create', 'createMany', 'createManyAndReturn', 'upsert'] as const;

/**
 * List of core create operations.
 */
export type CoreCreateOperations = (typeof CoreCreateOperations)[number];

/**
 * List of core update operations.
 */
export const CoreUpdateOperations = ['update', 'updateMany', 'updateManyAndReturn', 'upsert'] as const;

/**
 * List of core update operations.
 */
export type CoreUpdateOperations = (typeof CoreUpdateOperations)[number];

/**
 * List of core delete operations.
 */
export const CoreDeleteOperations = ['delete', 'deleteMany'] as const;

/**
 * List of core delete operations.
 */
export type CoreDeleteOperations = (typeof CoreDeleteOperations)[number];

/**
 * List of all CRUD operations, including 'orThrow' variants.
 */
export const AllCrudOperations = [...CoreCrudOperations, 'findUniqueOrThrow', 'findFirstOrThrow'] as const;

/**
 * List of all CRUD operations, including 'orThrow' variants.
 */
export type AllCrudOperations = (typeof AllCrudOperations)[number];

/**
 * List of all read operations, including 'orThrow' variants.
 */
export const AllReadOperations = [...CoreReadOperations, 'findUniqueOrThrow', 'findFirstOrThrow'] as const;

/**
 * List of all read operations, including 'orThrow' variants.
 */
export type AllReadOperations = (typeof AllReadOperations)[number];

/**
 * List of all write operations - simply an alias of CoreWriteOperations.
 */
export const AllWriteOperations = CoreWriteOperations;

/**
 * List of all write operations - simply an alias of CoreWriteOperations.
 */
export type AllWriteOperations = CoreWriteOperations;
