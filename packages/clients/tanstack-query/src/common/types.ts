import type { Logger, OptimisticDataProvider } from '@zenstackhq/client-helpers';
import type { FetchFn } from '@zenstackhq/client-helpers/fetch';
import type {
    GetProcedureNames,
    GetSlicedOperations,
    OperationsIneligibleForDelegateModels,
    ProcedureFunc,
    QueryOptions,
} from '@zenstackhq/orm';
import type { GetModels, IsDelegateModel, SchemaDef } from '@zenstackhq/schema';

/**
 * Context type for configuring the hooks.
 */
export type QueryContext = {
    /**
     * The endpoint to use for the queries.
     */
    endpoint?: string;

    /**
     * A custom fetch function for sending the HTTP requests.
     */
    fetch?: FetchFn;

    /**
     * If logging is enabled.
     */
    logging?: Logger;
};

/**
 * Extra query options.
 */
export type ExtraQueryOptions = {
    /**
     * Whether to opt-in to optimistic updates for this query. Defaults to `true`.
     */
    optimisticUpdate?: boolean;
} & QueryContext;

/**
 * Extra mutation options.
 */
export type ExtraMutationOptions = {
    /**
     * Whether to automatically invalidate queries potentially affected by the mutation. Defaults to `true`.
     */
    invalidateQueries?: boolean;

    /**
     * Whether to optimistically update queries potentially affected by the mutation. Defaults to `false`.
     */
    optimisticUpdate?: boolean;

    /**
     * A callback for computing optimistic update data for each query cache entry.
     */
    optimisticDataProvider?: OptimisticDataProvider;
} & QueryContext;

type HooksOperationsIneligibleForDelegateModels = OperationsIneligibleForDelegateModels extends any
    ? `use${Capitalize<OperationsIneligibleForDelegateModels>}`
    : never;

/**
 * Trim operations that are ineligible for delegate models from the given model operations type.
 */
export type TrimDelegateModelOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    T extends Record<string, unknown>,
> = IsDelegateModel<Schema, Model> extends true ? Omit<T, HooksOperationsIneligibleForDelegateModels> : T;

type Modifiers = '' | 'Suspense' | 'Infinite' | `SuspenseInfinite`;

/**
 * Trim hooks based on slicing configuration.
 */
export type TrimSlicedHooks<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    T extends Record<string, unknown>,
> = {
    [Key in keyof T as Key extends `use${Modifiers}${Capitalize<GetSlicedOperations<Schema, Model, Options>>}`
        ? Key
        : never]: T[Key];
};

type WithOptimisticFlag<T> = T extends object
    ? T & {
          /**
           * Indicates if the item is in an optimistic update state
           */
          $optimistic?: boolean;
      }
    : T;

export type WithOptimistic<T> = T extends Array<infer U> ? Array<WithOptimisticFlag<U>> : WithOptimisticFlag<T>;

export type ProcedureReturn<Schema extends SchemaDef, Name extends GetProcedureNames<Schema>> = Awaited<
    ReturnType<ProcedureFunc<Schema, Name>>
>;
