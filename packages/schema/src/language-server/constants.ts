/**
 * Supported Prisma db providers
 */
export const SUPPORTED_PROVIDERS = ['sqlite', 'postgresql', 'mysql', 'sqlserver', 'cockroachdb'];

/**
 * All scalar types
 */
export const SCALAR_TYPES = ['String', 'Int', 'Float', 'Decimal', 'BigInt', 'Boolean', 'Bytes', 'DateTime'];

/**
 * Name of standard library module
 */
export const STD_LIB_MODULE_NAME = 'stdlib.zmodel';

/**
 * Name of module contributed by plugins
 */
export const PLUGIN_MODULE_NAME = 'plugin.zmodel';

/**
 * Validation issues
 */
export enum IssueCodes {
    MissingOppositeRelation = 'miss-opposite-relation',
}

/**
 * Filter operation function names (mapped to Prisma filter operators)
 */
export const FILTER_OPERATOR_FUNCTIONS = [
    'contains',
    'search',
    'startsWith',
    'endsWith',
    'has',
    'hasEvery',
    'hasSome',
    'isEmpty',
];
