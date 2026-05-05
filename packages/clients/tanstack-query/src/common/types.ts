import type { Logger, OptimisticDataProvider } from '@zenstackhq/client-helpers';
import type { FetchFn } from '@zenstackhq/client-helpers/fetch';
import type {
    CoreCrudOperations,
    CrudArgsMap,
    CrudReturnMap,
    ExtQueryArgsBase,
    ExtResultBase,
    GetProcedureNames,
    GetSlicedOperations,
    ModelAllowsCreate,
    OperationsRequiringCreate,
    ProcedureFunc,
    QueryOptions,
} from '@zenstackhq/orm';
import type { GetModels, SchemaDef } from '@zenstackhq/schema';

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

type HooksOperationsRequiringCreate = OperationsRequiringCreate extends any
    ? `use${Capitalize<OperationsRequiringCreate>}`
    : never;

type Modifiers = '' | 'Suspense' | 'Infinite' | 'SuspenseInfinite';

/**
 * Trim CRUD operation hooks to include only eligible operations.
 */
export type TrimSlicedOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    T extends Record<string, unknown>,
> = {
    // trim operations based on slicing options
    [Key in keyof T as Key extends `use${Modifiers}${Capitalize<GetSlicedOperations<Schema, Model, Options>>}`
        ? ModelAllowsCreate<Schema, Model> extends true
            ? Key
            : // trim create operations for models that don't allow create
              Key extends HooksOperationsRequiringCreate
              ? never
              : Key
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

/**
 * Operations available in a sequential transaction.
 */
type AllowedTransactionOps<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
> =
    ModelAllowsCreate<Schema, Model> extends true
        ? GetSlicedOperations<Schema, Model, Options> & CoreCrudOperations
        : Exclude<GetSlicedOperations<Schema, Model, Options> & CoreCrudOperations, OperationsRequiringCreate>;

/**
 * Represents a single operation to execute within a sequential transaction.
 *
 * The `model`, `op`, and `args` fields are correlated: `op` is constrained to
 * the CRUD operations available on `model` (respecting `Options['slicing']`), and
 * `args` is typed accordingly.
 */
export type TransactionOperation<
    Schema extends SchemaDef,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
    ExtResult extends ExtResultBase<Schema> = {},
> = {
    [Model in GetModels<Schema>]: {
        [Op in AllowedTransactionOps<Schema, Model, Options>]: {} extends CrudArgsMap<
            Schema,
            Model,
            Options,
            ExtQueryArgs,
            ExtResult
        >[Op]
            ? { model: Model; op: Op; args?: CrudArgsMap<Schema, Model, Options, ExtQueryArgs, ExtResult>[Op] }
            : { model: Model; op: Op; args: CrudArgsMap<Schema, Model, Options, ExtQueryArgs, ExtResult>[Op] };
    }[AllowedTransactionOps<Schema, Model, Options>];
}[GetModels<Schema>];

/**
 * Maps each operation in a transaction tuple to its precise result type, preserving
 * per-position typing.
 */
export type TransactionResults<
    Schema extends SchemaDef,
    Ops extends readonly TransactionOperation<Schema, any, any, any>[],
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtResult extends ExtResultBase<Schema> = {},
> = {
    [K in keyof Ops]: Ops[K] extends { model: infer M; op: infer O; args?: infer A }
        ? M extends GetModels<Schema>
            ? O extends keyof CrudReturnMap<Schema, M, A, Options, ExtResult>
                ? CrudReturnMap<Schema, M, A, Options, ExtResult>[O]
                : never
            : never
        : never;
};
