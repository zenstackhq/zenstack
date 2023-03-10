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

export enum IssueCodes {
    MissingOppositeRelation = 'miss-opposite-relation',
}
