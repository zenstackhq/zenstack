import type { ClientContract, QueryOptions } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/schema';

/**
 * A type that represents either a value of type T or a Promise that resolves to type T.
 */
export type MaybePromise<T> = T | Promise<T> | PromiseLike<T>;

/**
 * Infers the schema definition from a client contract type, or passes through a raw SchemaDef.
 */
export type InferSchema<T> = T extends { $schema: infer S extends SchemaDef } ? S : T extends SchemaDef ? T : never;

/**
 * Extracts the ExtResult type from a client contract, or defaults to `{}`.
 */
export type InferExtResult<T> = T extends ClientContract<any, any, any, any, infer E> ? E : {};

/**
 * Infers query options from a client contract type, or defaults to `QueryOptions<Schema>`.
 */
export type InferOptions<T, Schema extends SchemaDef> = T extends { $options: infer O extends QueryOptions<Schema> }
    ? O
    : QueryOptions<Schema>;

/**
 * List of ORM write actions.
 */
export const ORMWriteActions = [
    'create',
    'createMany',
    'createManyAndReturn',
    'connectOrCreate',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'upsert',
    'connect',
    'disconnect',
    'set',
    'delete',
    'deleteMany',
] as const;

/**
 * Type representing ORM write action types.
 */
export type ORMWriteActionType = (typeof ORMWriteActions)[number];

/**
 * Type for query and mutation errors.
 */
export type QueryError = Error & {
    /**
     * Additional error information.
     */
    info?: unknown;

    /**
     * HTTP status code.
     */
    status?: number;
};

/**
 * Information about a cached query.
 */
export type QueryInfo = {
    /**
     * Model of the query.
     */
    model: string;

    /**
     * Query operation, e.g., `findUnique`
     */
    operation: string;

    /**
     * Query arguments.
     */
    args: unknown;

    /**
     * Current data cached for this query.
     */
    data: unknown;

    /**
     * Whether optimistic update is enabled for this query.
     */
    optimisticUpdate: boolean;

    /**
     * Function to update the cached data.
     *
     * @param data New data to set.
     * @param cancelOnTheFlyQueries Whether to cancel on-the-fly queries to avoid accidentally
     * overwriting the optimistic update.
     */
    updateData: (data: unknown, cancelOnTheFlyQueries: boolean) => void;
};
