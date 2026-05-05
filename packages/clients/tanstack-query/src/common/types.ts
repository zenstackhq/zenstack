import type { Logger, OptimisticDataProvider } from '@zenstackhq/client-helpers';
import type { FetchFn } from '@zenstackhq/client-helpers/fetch';
import type {
    AggregateArgs,
    CountArgs,
    CreateArgs,
    CreateManyAndReturnArgs,
    CreateManyArgs,
    DeleteArgs,
    DeleteManyArgs,
    ExistsArgs,
    FindFirstArgs,
    FindManyArgs,
    FindUniqueArgs,
    GetProcedureNames,
    GetSlicedOperations,
    GroupByArgs,
    ModelAllowsCreate,
    OperationsRequiringCreate,
    ProcedureFunc,
    QueryOptions,
    StepExpr,
    UpdateArgs,
    UpdateManyAndReturnArgs,
    UpdateManyArgs,
    UpsertArgs,
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
 * Maps each core CRUD operation to its argument type for a given model.
 */
type CrudArgsMap<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    findMany: FindManyArgs<Schema, Model>;
    findUnique: FindUniqueArgs<Schema, Model>;
    findFirst: FindFirstArgs<Schema, Model>;
    create: CreateArgs<Schema, Model>;
    createMany: CreateManyArgs<Schema, Model>;
    createManyAndReturn: CreateManyAndReturnArgs<Schema, Model>;
    update: UpdateArgs<Schema, Model>;
    updateMany: UpdateManyArgs<Schema, Model>;
    updateManyAndReturn: UpdateManyAndReturnArgs<Schema, Model>;
    upsert: UpsertArgs<Schema, Model>;
    delete: DeleteArgs<Schema, Model>;
    deleteMany: DeleteManyArgs<Schema, Model>;
    count: CountArgs<Schema, Model>;
    aggregate: AggregateArgs<Schema, Model>;
    groupBy: GroupByArgs<Schema, Model>;
    exists: ExistsArgs<Schema, Model>;
};

type TransactionArgValue<T> =
    | T
    | StepExpr<T>
    | (T extends readonly (infer U)[]
          ? TransactionArgValue<U>[]
          : T extends object
            ? { [K in keyof T]: TransactionArgValue<T[K]> }
            : never);

type TransactionArgs<T> = T extends object ? { [K in keyof T]: TransactionArgValue<T[K]> } : TransactionArgValue<T>;

/**
 * Operations available for a given model, omitting create-style operations
 * for models that don't allow them (e.g. delegate models).
 */
type AllowedTransactionOps<Schema extends SchemaDef, Model extends GetModels<Schema>> =
    ModelAllowsCreate<Schema, Model> extends true
        ? keyof CrudArgsMap<Schema, Model>
        : Exclude<keyof CrudArgsMap<Schema, Model>, OperationsRequiringCreate>;

/**
 * Represents a single operation to execute within a sequential transaction.
 *
 * The `model`, `op`, and `args` fields are correlated: `op` is constrained to
 * the CRUD operations available on `model`, and `args` is typed accordingly.
 * Transaction step expressions are allowed anywhere inside `args`, so later
 * operations can reference values produced by earlier operations.
 */
export type TransactionOperation<Schema extends SchemaDef> = {
    [Model in GetModels<Schema>]: {
        [Op in AllowedTransactionOps<Schema, Model>]: {} extends CrudArgsMap<Schema, Model>[Op]
            ? { model: Model; op: Op; args?: TransactionArgs<CrudArgsMap<Schema, Model>[Op]> }
            : { model: Model; op: Op; args: TransactionArgs<CrudArgsMap<Schema, Model>[Op]> };
    }[AllowedTransactionOps<Schema, Model>];
}[GetModels<Schema>];
