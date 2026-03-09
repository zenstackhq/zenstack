import {
    createInfiniteQuery,
    createMutation,
    createQuery,
    useQueryClient,
    type Accessor,
    type CreateInfiniteQueryOptions,
    type CreateInfiniteQueryResult,
    type CreateMutationOptions,
    type CreateMutationResult,
    type CreateQueryOptions,
    type CreateQueryResult,
    type DefaultError,
    type InfiniteData,
    type QueryFunction,
    type QueryKey,
} from '@tanstack/svelte-query';
import {
    createInvalidator,
    createOptimisticUpdater,
    DEFAULT_QUERY_ENDPOINT,
    type InvalidationPredicate,
} from '@zenstackhq/client-helpers';
import { fetcher, makeUrl, marshal } from '@zenstackhq/client-helpers/fetch';
import { lowerCaseFirst } from '@zenstackhq/common-helpers';
import type {
    AggregateArgs,
    AggregateResult,
    BatchResult,
    CountArgs,
    CountResult,
    CreateArgs,
    CreateManyAndReturnArgs,
    CreateManyArgs,
    DeleteArgs,
    DeleteManyArgs,
    ExistsArgs,
    FindFirstArgs,
    FindManyArgs,
    FindUniqueArgs,
    GetProcedure,
    GetProcedureNames,
    GetSlicedModels,
    GetSlicedProcedures,
    GroupByArgs,
    GroupByResult,
    ProcedureEnvelope,
    QueryOptions,
    SelectSubset,
    SimplifiedPlainResult,
    SimplifiedResult,
    Subset,
    UpdateArgs,
    UpdateManyAndReturnArgs,
    UpdateManyArgs,
    UpsertArgs,
} from '@zenstackhq/orm';
import type { GetModels, SchemaDef } from '@zenstackhq/schema';
import { getContext, setContext } from 'svelte';
import { getAllQueries, invalidateQueriesMatchingPredicate } from '../common/client.js';
import { CUSTOM_PROC_ROUTE_NAME } from '../common/constants.js';
import { getQueryKey } from '../common/query-key.js';
import type {
    ExtraMutationOptions,
    ExtraQueryOptions,
    ProcedureReturn,
    QueryContext,
    TrimSlicedOperations,
    WithOptimistic,
} from '../common/types.js';
export type { FetchFn } from '@zenstackhq/client-helpers/fetch';

type ProcedureHookFn<
    Schema extends SchemaDef,
    ProcName extends GetProcedureNames<Schema>,
    Options,
    Result,
    Input = ProcedureEnvelope<Schema, ProcName>,
> = { args: undefined } extends Input
    ? (args?: Accessor<Input>, options?: Accessor<Options>) => Result
    : (args: Accessor<Input>, options?: Accessor<Options>) => Result;

/**
 * Key for setting and getting the global query context.
 */
export const SvelteQueryContextKey = 'zenstack-svelte-query-context';

/**
 * Set context for query settings.
 *
 * @deprecated use {@link setQuerySettingsContext} instead.
 */
export function setHooksContext(context: QueryContext) {
    setContext(SvelteQueryContextKey, context);
}

/**
 * Set context for query settings.
 */
export function setQuerySettingsContext(context: QueryContext) {
    setContext(SvelteQueryContextKey, context);
}

function useQuerySettings() {
    const { endpoint, ...rest } = getContext<QueryContext>(SvelteQueryContextKey) ?? {};
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
}

function merge(rootOpt: unknown, opt: unknown): Accessor<any> {
    return () => {
        const rootOptVal = typeof rootOpt === 'function' ? (rootOpt as any)() : rootOpt;
        const optVal = typeof opt === 'function' ? (opt as any)() : opt;
        return { ...rootOptVal, ...optVal };
    };
}

export type ModelQueryOptions<T> = Omit<CreateQueryOptions<T, DefaultError>, 'queryKey'> & ExtraQueryOptions;

export type ModelQueryResult<T> = CreateQueryResult<WithOptimistic<T>, DefaultError> & { queryKey: QueryKey };

export type ModelInfiniteQueryOptions<T> = Omit<
    CreateInfiniteQueryOptions<T, DefaultError, InfiniteData<T>>,
    'queryKey' | 'initialPageParam'
> &
    QueryContext;

export type ModelInfiniteQueryResult<T> = CreateInfiniteQueryResult<T, DefaultError> & {
    queryKey: QueryKey;
};

export type ModelMutationOptions<T, TArgs> = Omit<CreateMutationOptions<T, DefaultError, TArgs>, 'mutationFn'> &
    ExtraMutationOptions;

export type ModelMutationResult<T, TArgs> = CreateMutationResult<T, DefaultError, TArgs>;

export type ModelMutationModelResult<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    TArgs,
    Array extends boolean = false,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
> = Omit<ModelMutationResult<SimplifiedResult<Schema, Model, TArgs, Options, false, Array>, TArgs>, 'mutateAsync'> & {
    mutateAsync<T extends TArgs>(
        args: T,
        options?: ModelMutationOptions<SimplifiedResult<Schema, Model, T, Options, false, Array>, T>,
    ): Promise<SimplifiedResult<Schema, Model, T, Options, false, Array>>;
};

export type ClientHooks<Schema extends SchemaDef, Options extends QueryOptions<Schema> = QueryOptions<Schema>> = {
    [Model in GetSlicedModels<Schema, Options> as `${Uncapitalize<Model>}`]: ModelQueryHooks<Schema, Model, Options>;
} & ProcedureHooks<Schema, Options>;

type ProcedureHookGroup<Schema extends SchemaDef, Options extends QueryOptions<Schema>> = {
    [Name in GetSlicedProcedures<Schema, Options>]: GetProcedure<Schema, Name> extends { mutation: true }
        ? {
              useMutation(
                  options?: Omit<
                      CreateMutationOptions<
                          ProcedureReturn<Schema, Name>,
                          DefaultError,
                          ProcedureEnvelope<Schema, Name>
                      >,
                      'mutationFn'
                  > &
                      QueryContext,
              ): CreateMutationResult<ProcedureReturn<Schema, Name>, DefaultError, ProcedureEnvelope<Schema, Name>>;
          }
        : {
              useQuery: ProcedureHookFn<
                  Schema,
                  Name,
                  Omit<ModelQueryOptions<ProcedureReturn<Schema, Name>>, 'optimisticUpdate'>,
                  CreateQueryResult<ProcedureReturn<Schema, Name>, DefaultError> & { queryKey: QueryKey }
              >;

              //   Infinite queries for procedures are currently disabled, will add back later if needed
              //
              //   useInfiniteQuery: ProcedureHookFn<
              //       Schema,
              //       Name,
              //       ModelInfiniteQueryOptions<ProcedureReturn<Schema, Name>>,
              //       ModelInfiniteQueryResult<InfiniteData<ProcedureReturn<Schema, Name>>>
              //   >;
          };
};

export type ProcedureHooks<Schema extends SchemaDef, Options extends QueryOptions<Schema>> =
    Schema['procedures'] extends Record<string, any>
        ? {
              /**
               * Custom procedures.
               */
              $procs: ProcedureHookGroup<Schema, Options>;
          }
        : Record<never, never>;

// Note that we can potentially use TypeScript's mapped type to directly map from ORM contract, but that seems
// to significantly slow down tsc performance ...
export type ModelQueryHooks<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
> = TrimSlicedOperations<
    Schema,
    Model,
    Options,
    {
        useFindUnique<T extends FindUniqueArgs<Schema, Model, Options>>(
            args: Accessor<SelectSubset<T, FindUniqueArgs<Schema, Model, Options>>>,
            options?: Accessor<ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options> | null>>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options> | null>;

        useFindFirst<T extends FindFirstArgs<Schema, Model, Options>>(
            args?: Accessor<SelectSubset<T, FindFirstArgs<Schema, Model, Options>>>,
            options?: Accessor<ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options> | null>>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options> | null>;

        useExists<T extends ExistsArgs<Schema, Model, Options>>(
            args?: Accessor<Subset<T, ExistsArgs<Schema, Model, Options>>>,
            options?: Accessor<ModelQueryOptions<boolean>>,
        ): ModelQueryResult<boolean>;

        useFindMany<T extends FindManyArgs<Schema, Model, Options>>(
            args?: Accessor<SelectSubset<T, FindManyArgs<Schema, Model, Options>>>,
            options?: Accessor<ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options>[]>>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options>[]>;

        useInfiniteFindMany<T extends FindManyArgs<Schema, Model, Options>>(
            args?: Accessor<SelectSubset<T, FindManyArgs<Schema, Model, Options>>>,
            options?: Accessor<ModelInfiniteQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options>[]>>,
        ): ModelInfiniteQueryResult<InfiniteData<SimplifiedPlainResult<Schema, Model, T, Options>[]>>;

        useCreate<T extends CreateArgs<Schema, Model, Options>>(
            options?: Accessor<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useCreateMany<T extends CreateManyArgs<Schema, Model>>(
            options?: Accessor<ModelMutationOptions<BatchResult, T>>,
        ): ModelMutationResult<BatchResult, T>;

        useCreateManyAndReturn<T extends CreateManyAndReturnArgs<Schema, Model, Options>>(
            options?: Accessor<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>[], T>>,
        ): ModelMutationModelResult<Schema, Model, T, true, Options>;

        useUpdate<T extends UpdateArgs<Schema, Model, Options>>(
            options?: Accessor<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;
        useUpdateMany<T extends UpdateManyArgs<Schema, Model, Options>>(
            options?: Accessor<ModelMutationOptions<BatchResult, T>>,
        ): ModelMutationResult<BatchResult, T>;

        useUpdateManyAndReturn<T extends UpdateManyAndReturnArgs<Schema, Model, Options>>(
            options?: Accessor<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>[], T>>,
        ): ModelMutationModelResult<Schema, Model, T, true, Options>;

        useUpsert<T extends UpsertArgs<Schema, Model, Options>>(
            options?: Accessor<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;
        useDelete<T extends DeleteArgs<Schema, Model, Options>>(
            options?: Accessor<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useDeleteMany<T extends DeleteManyArgs<Schema, Model, Options>>(
            options?: Accessor<ModelMutationOptions<BatchResult, T>>,
        ): ModelMutationResult<BatchResult, T>;

        useCount<T extends CountArgs<Schema, Model, Options>>(
            args?: Accessor<Subset<T, CountArgs<Schema, Model, Options>>>,
            options?: Accessor<ModelQueryOptions<CountResult<Schema, Model, T>>>,
        ): ModelQueryResult<CountResult<Schema, Model, T>>;

        useAggregate<T extends AggregateArgs<Schema, Model, Options>>(
            args: Accessor<Subset<T, AggregateArgs<Schema, Model, Options>>>,
            options?: Accessor<ModelQueryOptions<AggregateResult<Schema, Model, T>>>,
        ): ModelQueryResult<AggregateResult<Schema, Model, T>>;

        useGroupBy<T extends GroupByArgs<Schema, Model, Options>>(
            args: Accessor<Subset<T, GroupByArgs<Schema, Model, Options>>>,
            options?: Accessor<ModelQueryOptions<GroupByResult<Schema, Model, T>>>,
        ): ModelQueryResult<GroupByResult<Schema, Model, T>>;
    }
>;

/**
 * Gets data query hooks for all models in the schema.
 */
export function useClientQueries<Schema extends SchemaDef, Options extends QueryOptions<Schema> = QueryOptions<Schema>>(
    schema: Schema,
    options?: Accessor<QueryContext>,
): ClientHooks<Schema, Options> {
    const result = Object.keys(schema.models).reduce(
        (acc, model) => {
            (acc as any)[lowerCaseFirst(model)] = useModelQueries<Schema, GetModels<Schema>, Options>(
                schema,
                model as GetModels<Schema>,
                options,
            );
            return acc;
        },
        {} as ClientHooks<Schema, Options>,
    );

    const procedures = (schema as any).procedures as Record<string, { mutation?: boolean }> | undefined;
    if (procedures) {
        const buildProcedureHooks = () => {
            return Object.keys(procedures).reduce((acc, name) => {
                const procDef = procedures[name];
                if (procDef?.mutation) {
                    acc[name] = {
                        useMutation: (hookOptions?: any) =>
                            useInternalMutation(
                                schema,
                                CUSTOM_PROC_ROUTE_NAME,
                                'POST',
                                name,
                                merge(options, hookOptions),
                            ),
                    };
                } else {
                    acc[name] = {
                        useQuery: (args?: any, hookOptions?: any) =>
                            useInternalQuery(schema, CUSTOM_PROC_ROUTE_NAME, name, args, merge(options, hookOptions)),
                        useInfiniteQuery: (args?: any, hookOptions?: any) =>
                            useInternalInfiniteQuery(
                                schema,
                                CUSTOM_PROC_ROUTE_NAME,
                                name,
                                args,
                                merge(options, hookOptions),
                            ),
                    };
                }
                return acc;
            }, {} as any);
        };

        (result as any).$procs = buildProcedureHooks();
    }

    return result;
}

/**
 * Gets data query hooks for a specific model in the schema.
 */
export function useModelQueries<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
>(schema: Schema, model: Model, rootOptions?: Accessor<QueryContext>): ModelQueryHooks<Schema, Model, Options> {
    const modelDef = Object.values(schema.models).find((m) => m.name.toLowerCase() === model.toLowerCase());
    if (!modelDef) {
        throw new Error(`Model "${model}" not found in schema`);
    }

    const modelName = modelDef.name;

    return {
        useFindUnique: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'findUnique', args, merge(rootOptions, options));
        },

        useFindFirst: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'findFirst', args, merge(rootOptions, options));
        },

        useExists: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'exists', args, merge(rootOptions, options));
        },

        useFindMany: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'findMany', args, merge(rootOptions, options));
        },

        useInfiniteFindMany: (args: any, options?: any) => {
            return useInternalInfiniteQuery(schema, modelName, 'findMany', args, options);
        },

        useCreate: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'create', options);
        },

        useCreateMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'createMany', options);
        },

        useCreateManyAndReturn: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'createManyAndReturn', options);
        },

        useUpdate: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'update', options);
        },

        useUpdateMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'updateMany', options);
        },

        useUpdateManyAndReturn: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'updateManyAndReturn', options);
        },

        useUpsert: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'upsert', options);
        },

        useDelete: (options?: any) => {
            return useInternalMutation(schema, modelName, 'DELETE', 'delete', options);
        },

        useDeleteMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'DELETE', 'deleteMany', options);
        },

        useCount: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'count', args, options);
        },

        useAggregate: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'aggregate', args, options);
        },

        useGroupBy: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'groupBy', args, options);
        },
    } as unknown as ModelQueryHooks<Schema, Model, Options>;
}

export function useInternalQuery<TQueryFnData, TData>(
    _schema: SchemaDef,
    model: string,
    operation: string,
    args?: Accessor<unknown>,
    options?: Accessor<Omit<CreateQueryOptions<TQueryFnData, DefaultError, TData>, 'queryKey'> & ExtraQueryOptions>,
) {
    const { endpoint, fetch } = useFetchOptions(options);

    const queryKey = $derived(
        getQueryKey(model, operation, args?.(), {
            infinite: false,
            optimisticUpdate: options?.().optimisticUpdate !== false,
        }),
    );

    const finalOptions = () => {
        const reqUrl = makeUrl(endpoint, model, operation, args?.());
        const queryFn: QueryFunction<TQueryFnData, QueryKey, unknown> = ({ signal }) =>
            fetcher<TQueryFnData>(reqUrl, { signal }, fetch);
        return {
            queryKey,
            queryFn,
            ...options?.(),
        };
    };

    const query = createQuery<TQueryFnData, DefaultError, TData>(finalOptions);
    // svelte-ignore state_referenced_locally
    return createQueryResult(query, queryKey);
}

export function useInternalInfiniteQuery<TQueryFnData, TData>(
    _schema: SchemaDef,
    model: string,
    operation: string,
    args: Accessor<unknown>,
    options?: Accessor<
        Omit<
            CreateInfiniteQueryOptions<TQueryFnData, DefaultError, InfiniteData<TData>>,
            'queryKey' | 'initialPageParam'
        > &
            QueryContext
    >,
) {
    const { endpoint, fetch } = useFetchOptions(options);

    const queryKey = $derived(getQueryKey(model, operation, args(), { infinite: true, optimisticUpdate: false }));

    const finalOptions = () => {
        const queryFn: QueryFunction<TQueryFnData, QueryKey, unknown> = ({ pageParam, signal }) =>
            fetcher<TQueryFnData>(makeUrl(endpoint, model, operation, pageParam ?? args()), { signal }, fetch);
        const optionsValue = options?.() ?? { getNextPageParam: () => undefined };
        return {
            queryKey,
            queryFn,
            initialPageParam: args(),
            ...optionsValue,
        };
    };

    const query = createInfiniteQuery<TQueryFnData, DefaultError, InfiniteData<TData>>(finalOptions);
    // svelte-ignore state_referenced_locally
    return createQueryResult(query, queryKey);
}

function createQueryResult<T>(query: T, queryKey: QueryKey): T & { queryKey: QueryKey } {
    // CHECKME: is there a better way to do this?
    // create a proxy object that properly forwards all properties while adding queryKey,
    // this preserves svelte-query reactivity by using getters
    return new Proxy(query as any, {
        get(target, prop) {
            if (prop === 'queryKey') {
                return queryKey;
            }
            return target[prop];
        },
    });
}

/**
 * Creates a svelte-query mutation
 *
 * @private
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param operation The mutation operation (e.g. `create`).
 * @param options The svelte-query options.
 * @param checkReadBack Whether to check for read back errors and return undefined if found.
 */
export function useInternalMutation<TArgs, R = any>(
    schema: SchemaDef,
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    operation: string,
    options?: Accessor<Omit<CreateMutationOptions<R, DefaultError, TArgs>, 'mutationFn'> & ExtraMutationOptions>,
) {
    const { endpoint, fetch, logging } = useQuerySettings();
    const queryClient = useQueryClient();
    const mutationFn = (data: any) => {
        const reqUrl =
            method === 'DELETE' ? makeUrl(endpoint, model, operation, data) : makeUrl(endpoint, model, operation);
        const fetchInit: RequestInit = {
            method,
            ...(method !== 'DELETE' && {
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            }),
        };
        return fetcher<R>(reqUrl, fetchInit, fetch) as Promise<R>;
    };

    const finalOptions = () => {
        const optionsValue = options?.();
        const invalidateQueries = optionsValue?.invalidateQueries !== false;
        const optimisticUpdate = !!optionsValue?.optimisticUpdate;
        const result = {
            ...optionsValue,
            mutationFn,
        };

        if (model !== CUSTOM_PROC_ROUTE_NAME) {
            // not a custom procedure, set up optimistic update and invalidation

            if (!optimisticUpdate) {
                // if optimistic update is not enabled, invalidate related queries on success
                if (invalidateQueries) {
                    const invalidator = createInvalidator(
                        model,
                        operation,
                        schema,
                        (predicate: InvalidationPredicate) =>
                            // @ts-ignore
                            invalidateQueriesMatchingPredicate(queryClient, predicate),
                        logging,
                    );

                    // execute invalidator prior to user-provided onSuccess
                    const origOnSuccess = optionsValue?.onSuccess;
                    const wrappedOnSuccess: typeof origOnSuccess = async (...args) => {
                        await invalidator(...args);
                        await origOnSuccess?.(...args);
                    };
                    result.onSuccess = wrappedOnSuccess;
                }
            } else {
                const optimisticUpdater = createOptimisticUpdater(
                    model,
                    operation,
                    schema,
                    { optimisticDataProvider: optionsValue?.optimisticDataProvider },
                    // @ts-ignore
                    () => getAllQueries(queryClient),
                    logging,
                );

                const origOnMutate = optionsValue.onMutate;
                const wrappedOnMutate: typeof origOnMutate = async (...args) => {
                    // execute optimistic updater prior to user-provided onMutate
                    await optimisticUpdater(...args);

                    // call user-provided onMutate
                    return origOnMutate?.(...args);
                };

                result.onMutate = wrappedOnMutate;

                if (invalidateQueries) {
                    const invalidator = createInvalidator(
                        model,
                        operation,
                        schema,
                        (predicate: InvalidationPredicate) =>
                            // @ts-ignore
                            invalidateQueriesMatchingPredicate(queryClient, predicate),
                        logging,
                    );
                    const origOnSettled = optionsValue.onSettled;
                    const wrappedOnSettled: typeof origOnSettled = async (...args) => {
                        // execute invalidator prior to user-provided onSettled
                        await invalidator(...args);

                        // call user-provided onSettled
                        await origOnSettled?.(...args);
                    };

                    // replace onSettled in mergedOpt
                    result.onSettled = wrappedOnSettled;
                }
            }
        }

        return result;
    };
    return createMutation(finalOptions);
}

function useFetchOptions(options: Accessor<QueryContext> | undefined) {
    const { endpoint, fetch, logging } = useQuerySettings();
    const optionsValue = options?.();
    // options take precedence over context
    return {
        endpoint: optionsValue?.endpoint ?? endpoint,
        fetch: optionsValue?.fetch ?? fetch,
        logging: optionsValue?.logging ?? logging,
    };
}
