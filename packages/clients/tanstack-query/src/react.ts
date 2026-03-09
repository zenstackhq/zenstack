import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    useSuspenseInfiniteQuery,
    useSuspenseQuery,
    type DefaultError,
    type InfiniteData,
    type QueryKey,
    type UseInfiniteQueryOptions,
    type UseInfiniteQueryResult,
    type UseMutationOptions,
    type UseMutationResult,
    type UseQueryOptions,
    type UseQueryResult,
    type UseSuspenseInfiniteQueryOptions,
    type UseSuspenseInfiniteQueryResult,
    type UseSuspenseQueryOptions,
    type UseSuspenseQueryResult,
} from '@tanstack/react-query';
import { createInvalidator, createOptimisticUpdater, DEFAULT_QUERY_ENDPOINT } from '@zenstackhq/client-helpers';
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
import { createContext, useContext } from 'react';
import { getAllQueries, invalidateQueriesMatchingPredicate } from './common/client.js';
import { CUSTOM_PROC_ROUTE_NAME } from './common/constants.js';
import { getQueryKey } from './common/query-key.js';
import type {
    ExtraMutationOptions,
    ExtraQueryOptions,
    ProcedureReturn,
    QueryContext,
    TrimSlicedOperations,
    WithOptimistic,
} from './common/types.js';
export type { FetchFn } from '@zenstackhq/client-helpers/fetch';

type ProcedureHookFn<
    Schema extends SchemaDef,
    ProcName extends GetProcedureNames<Schema>,
    Options,
    Result,
    Input = ProcedureEnvelope<Schema, ProcName>,
> = { args: undefined } extends Input
    ? (input?: Input, options?: Options) => Result
    : (input: Input, options?: Options) => Result;

/**
 * React context for query settings.
 */
export const QuerySettingsContext = createContext<QueryContext>({
    endpoint: DEFAULT_QUERY_ENDPOINT,
    fetch: undefined,
});

/**
 * React context provider for configuring query settings.
 */
export const QuerySettingsProvider = QuerySettingsContext.Provider;

/**
 * React context provider for configuring query settings.
 *
 * @deprecated Use {@link QuerySettingsProvider} instead.
 */
export const Provider = QuerySettingsProvider;

function useHooksContext() {
    const { endpoint, ...rest } = useContext(QuerySettingsContext);
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
}

export type ModelQueryOptions<T> = Omit<UseQueryOptions<T, DefaultError>, 'queryKey'> & ExtraQueryOptions;

export type ModelQueryResult<T> = UseQueryResult<WithOptimistic<T>, DefaultError> & { queryKey: QueryKey };

export type ModelSuspenseQueryOptions<T> = Omit<UseSuspenseQueryOptions<T, DefaultError>, 'queryKey'> &
    ExtraQueryOptions;

export type ModelSuspenseQueryResult<T> = UseSuspenseQueryResult<WithOptimistic<T>, DefaultError> & {
    queryKey: QueryKey;
};

export type ModelInfiniteQueryOptions<T> = Omit<
    UseInfiniteQueryOptions<T, DefaultError, InfiniteData<T>>,
    'queryKey' | 'initialPageParam'
>;

export type ModelInfiniteQueryResult<T> = UseInfiniteQueryResult<T, DefaultError> & { queryKey: QueryKey };

export type ModelSuspenseInfiniteQueryOptions<T> = Omit<
    UseSuspenseInfiniteQueryOptions<T, DefaultError, InfiniteData<T>>,
    'queryKey' | 'initialPageParam'
>;

export type ModelSuspenseInfiniteQueryResult<T> = UseSuspenseInfiniteQueryResult<T, DefaultError> & {
    queryKey: QueryKey;
};

export type ModelMutationOptions<T, TArgs> = Omit<UseMutationOptions<T, DefaultError, TArgs>, 'mutationFn'> &
    ExtraMutationOptions;

export type ModelMutationResult<T, TArgs> = UseMutationResult<T, DefaultError, TArgs>;

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
                      UseMutationOptions<ProcedureReturn<Schema, Name>, DefaultError, ProcedureEnvelope<Schema, Name>>,
                      'mutationFn'
                  > &
                      QueryContext,
              ): UseMutationResult<ProcedureReturn<Schema, Name>, DefaultError, ProcedureEnvelope<Schema, Name>>;
          }
        : {
              useQuery: ProcedureHookFn<
                  Schema,
                  Name,
                  Omit<ModelQueryOptions<ProcedureReturn<Schema, Name>>, 'optimisticUpdate'>,
                  UseQueryResult<ProcedureReturn<Schema, Name>, DefaultError> & { queryKey: QueryKey }
              >;

              useSuspenseQuery: ProcedureHookFn<
                  Schema,
                  Name,
                  Omit<ModelSuspenseQueryOptions<ProcedureReturn<Schema, Name>>, 'optimisticUpdate'>,
                  UseSuspenseQueryResult<ProcedureReturn<Schema, Name>, DefaultError> & { queryKey: QueryKey }
              >;

              //   Infinite queries for procedures are currently disabled, will add back later if needed
              //
              //   useInfiniteQuery: ProcedureHookFn<
              //       Schema,
              //       Name,
              //       ModelInfiniteQueryOptions<ProcedureReturn<Schema, Name>>,
              //       ModelInfiniteQueryResult<InfiniteData<ProcedureReturn<Schema, Name>>>
              //   >;

              //   useSuspenseInfiniteQuery: ProcedureHookFn<
              //       Schema,
              //       Name,
              //       ModelSuspenseInfiniteQueryOptions<ProcedureReturn<Schema, Name>>,
              //       ModelSuspenseInfiniteQueryResult<InfiniteData<ProcedureReturn<Schema, Name>>>
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
            args: SelectSubset<T, FindUniqueArgs<Schema, Model, Options>>,
            options?: ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options> | null>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options> | null>;

        useSuspenseFindUnique<T extends FindUniqueArgs<Schema, Model, Options>>(
            args: SelectSubset<T, FindUniqueArgs<Schema, Model, Options>>,
            options?: ModelSuspenseQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options> | null>,
        ): ModelSuspenseQueryResult<SimplifiedPlainResult<Schema, Model, T, Options> | null>;

        useFindFirst<T extends FindFirstArgs<Schema, Model, Options>>(
            args?: SelectSubset<T, FindFirstArgs<Schema, Model, Options>>,
            options?: ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options> | null>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options> | null>;

        useSuspenseFindFirst<T extends FindFirstArgs<Schema, Model, Options>>(
            args?: SelectSubset<T, FindFirstArgs<Schema, Model, Options>>,
            options?: ModelSuspenseQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options> | null>,
        ): ModelSuspenseQueryResult<SimplifiedPlainResult<Schema, Model, T, Options> | null>;

        useExists<T extends ExistsArgs<Schema, Model, Options>>(
            args?: Subset<T, ExistsArgs<Schema, Model, Options>>,
            options?: ModelQueryOptions<boolean>,
        ): ModelQueryResult<boolean>;

        useFindMany<T extends FindManyArgs<Schema, Model, Options>>(
            args?: SelectSubset<T, FindManyArgs<Schema, Model, Options>>,
            options?: ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options>[]>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options>[]>;

        useSuspenseFindMany<T extends FindManyArgs<Schema, Model, Options>>(
            args?: SelectSubset<T, FindManyArgs<Schema, Model, Options>>,
            options?: ModelSuspenseQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options>[]>,
        ): ModelSuspenseQueryResult<SimplifiedPlainResult<Schema, Model, T, Options>[]>;

        useInfiniteFindMany<T extends FindManyArgs<Schema, Model, Options>>(
            args?: SelectSubset<T, FindManyArgs<Schema, Model, Options>>,
            options?: ModelInfiniteQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options>[]>,
        ): ModelInfiniteQueryResult<InfiniteData<SimplifiedPlainResult<Schema, Model, T, Options>[]>>;

        useSuspenseInfiniteFindMany<T extends FindManyArgs<Schema, Model, Options>>(
            args?: SelectSubset<T, FindManyArgs<Schema, Model, Options>>,
            options?: ModelSuspenseInfiniteQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options>[]>,
        ): ModelSuspenseInfiniteQueryResult<InfiniteData<SimplifiedPlainResult<Schema, Model, T, Options>[]>>;

        useCreate<T extends CreateArgs<Schema, Model, Options>>(
            options?: ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useCreateMany<T extends CreateManyArgs<Schema, Model>>(
            options?: ModelMutationOptions<BatchResult, T>,
        ): ModelMutationResult<BatchResult, T>;

        useCreateManyAndReturn<T extends CreateManyAndReturnArgs<Schema, Model, Options>>(
            options?: ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>[], T>,
        ): ModelMutationModelResult<Schema, Model, T, true, Options>;

        useUpdate<T extends UpdateArgs<Schema, Model, Options>>(
            options?: ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useUpdateMany<T extends UpdateManyArgs<Schema, Model, Options>>(
            options?: ModelMutationOptions<BatchResult, T>,
        ): ModelMutationResult<BatchResult, T>;

        useUpdateManyAndReturn<T extends UpdateManyAndReturnArgs<Schema, Model, Options>>(
            options?: ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>[], T>,
        ): ModelMutationModelResult<Schema, Model, T, true, Options>;

        useUpsert<T extends UpsertArgs<Schema, Model, Options>>(
            options?: ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useDelete<T extends DeleteArgs<Schema, Model, Options>>(
            options?: ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useDeleteMany<T extends DeleteManyArgs<Schema, Model, Options>>(
            options?: ModelMutationOptions<BatchResult, T>,
        ): ModelMutationResult<BatchResult, T>;

        useCount<T extends CountArgs<Schema, Model, Options>>(
            args?: Subset<T, CountArgs<Schema, Model, Options>>,
            options?: ModelQueryOptions<CountResult<Schema, Model, T>>,
        ): ModelQueryResult<CountResult<Schema, Model, T>>;

        useSuspenseCount<T extends CountArgs<Schema, Model, Options>>(
            args?: Subset<T, CountArgs<Schema, Model, Options>>,
            options?: ModelSuspenseQueryOptions<CountResult<Schema, Model, T>>,
        ): ModelSuspenseQueryResult<CountResult<Schema, Model, T>>;

        useAggregate<T extends AggregateArgs<Schema, Model, Options>>(
            args: Subset<T, AggregateArgs<Schema, Model, Options>>,
            options?: ModelQueryOptions<AggregateResult<Schema, Model, T>>,
        ): ModelQueryResult<AggregateResult<Schema, Model, T>>;

        useSuspenseAggregate<T extends AggregateArgs<Schema, Model, Options>>(
            args: Subset<T, AggregateArgs<Schema, Model, Options>>,
            options?: ModelSuspenseQueryOptions<AggregateResult<Schema, Model, T>>,
        ): ModelSuspenseQueryResult<AggregateResult<Schema, Model, T>>;

        useGroupBy<T extends GroupByArgs<Schema, Model, Options>>(
            args: Subset<T, GroupByArgs<Schema, Model, Options>>,
            options?: ModelQueryOptions<GroupByResult<Schema, Model, T>>,
        ): ModelQueryResult<GroupByResult<Schema, Model, T>>;

        useSuspenseGroupBy<T extends GroupByArgs<Schema, Model, Options>>(
            args: Subset<T, GroupByArgs<Schema, Model, Options>>,
            options?: ModelSuspenseQueryOptions<GroupByResult<Schema, Model, T>>,
        ): ModelSuspenseQueryResult<GroupByResult<Schema, Model, T>>;
    }
>;

/**
 * Gets data query hooks for all models in the schema.
 *
 * @param schema The schema.
 * @param options Options for all queries originated from this hook.
 */
export function useClientQueries<Schema extends SchemaDef, Options extends QueryOptions<Schema> = QueryOptions<Schema>>(
    schema: Schema,
    options?: QueryContext,
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
                            useInternalMutation(schema, CUSTOM_PROC_ROUTE_NAME, 'POST', name, {
                                ...options,
                                ...hookOptions,
                            }),
                    };
                } else {
                    acc[name] = {
                        useQuery: (args?: any, hookOptions?: any) =>
                            useInternalQuery(schema, CUSTOM_PROC_ROUTE_NAME, name, args, {
                                ...options,
                                ...hookOptions,
                            }),
                        useSuspenseQuery: (args?: any, hookOptions?: any) =>
                            useInternalSuspenseQuery(schema, CUSTOM_PROC_ROUTE_NAME, name, args, {
                                ...options,
                                ...hookOptions,
                            }),
                        useInfiniteQuery: (args?: any, hookOptions?: any) =>
                            useInternalInfiniteQuery(schema, CUSTOM_PROC_ROUTE_NAME, name, args, {
                                ...options,
                                ...hookOptions,
                            }),
                        useSuspenseInfiniteQuery: (args?: any, hookOptions?: any) =>
                            useInternalSuspenseInfiniteQuery(schema, CUSTOM_PROC_ROUTE_NAME, name, args, {
                                ...options,
                                ...hookOptions,
                            }),
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
>(schema: Schema, model: Model, rootOptions?: QueryContext): ModelQueryHooks<Schema, Model, Options> {
    const modelDef = Object.values(schema.models).find((m) => m.name.toLowerCase() === model.toLowerCase());
    if (!modelDef) {
        throw new Error(`Model "${model}" not found in schema`);
    }

    const modelName = modelDef.name;

    return {
        useFindUnique: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'findUnique', args, { ...rootOptions, ...options });
        },

        useSuspenseFindUnique: (args: any, options?: any) => {
            return useInternalSuspenseQuery(schema, modelName, 'findUnique', args, { ...rootOptions, ...options });
        },

        useFindFirst: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'findFirst', args, { ...rootOptions, ...options });
        },

        useSuspenseFindFirst: (args: any, options?: any) => {
            return useInternalSuspenseQuery(schema, modelName, 'findFirst', args, { ...rootOptions, ...options });
        },

        useExists: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'exists', args, { ...rootOptions, ...options });
        },

        useFindMany: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'findMany', args, { ...rootOptions, ...options });
        },

        useSuspenseFindMany: (args: any, options?: any) => {
            return useInternalSuspenseQuery(schema, modelName, 'findMany', args, { ...rootOptions, ...options });
        },

        useInfiniteFindMany: (args: any, options?: any) => {
            return useInternalInfiniteQuery(schema, modelName, 'findMany', args, { ...rootOptions, ...options });
        },

        useSuspenseInfiniteFindMany: (args: any, options?: any) => {
            return useInternalSuspenseInfiniteQuery(schema, modelName, 'findMany', args, {
                ...rootOptions,
                ...options,
            });
        },

        useCreate: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'create', { ...rootOptions, ...options });
        },

        useCreateMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'createMany', { ...rootOptions, ...options });
        },

        useCreateManyAndReturn: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'createManyAndReturn', {
                ...rootOptions,
                ...options,
            });
        },

        useUpdate: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'update', { ...rootOptions, ...options });
        },

        useUpdateMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'updateMany', { ...rootOptions, ...options });
        },

        useUpdateManyAndReturn: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'updateManyAndReturn', { ...rootOptions, ...options });
        },

        useUpsert: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'upsert', { ...rootOptions, ...options });
        },

        useDelete: (options?: any) => {
            return useInternalMutation(schema, modelName, 'DELETE', 'delete', { ...rootOptions, ...options });
        },

        useDeleteMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'DELETE', 'deleteMany', { ...rootOptions, ...options });
        },

        useCount: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'count', args, { ...rootOptions, ...options });
        },

        useSuspenseCount: (args: any, options?: any) => {
            return useInternalSuspenseQuery(schema, modelName, 'count', args, { ...rootOptions, ...options });
        },

        useAggregate: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'aggregate', args, { ...rootOptions, ...options });
        },

        useSuspenseAggregate: (args: any, options?: any) => {
            return useInternalSuspenseQuery(schema, modelName, 'aggregate', args, { ...rootOptions, ...options });
        },

        useGroupBy: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'groupBy', args, { ...rootOptions, ...options });
        },

        useSuspenseGroupBy: (args: any, options?: any) => {
            return useInternalSuspenseQuery(schema, modelName, 'groupBy', args, { ...rootOptions, ...options });
        },
    } as ModelQueryHooks<Schema, Model, Options>;
}

export function useInternalQuery<TQueryFnData, TData>(
    _schema: SchemaDef,
    model: string,
    operation: string,
    args?: unknown,
    options?: Omit<UseQueryOptions<TQueryFnData, DefaultError, TData>, 'queryKey'> & ExtraQueryOptions,
) {
    const { endpoint, fetch } = useFetchOptions(options);
    const reqUrl = makeUrl(endpoint, model, operation, args);
    const queryKey = getQueryKey(model, operation, args, {
        infinite: false,
        optimisticUpdate: options?.optimisticUpdate !== false,
    });
    return {
        queryKey,
        ...useQuery({
            queryKey,
            queryFn: ({ signal }) => fetcher<TQueryFnData>(reqUrl, { signal }, fetch),
            ...options,
        }),
    };
}

export function useInternalSuspenseQuery<TQueryFnData, TData>(
    _schema: SchemaDef,
    model: string,
    operation: string,
    args?: unknown,
    options?: Omit<UseSuspenseQueryOptions<TQueryFnData, DefaultError, TData>, 'queryKey'> & ExtraQueryOptions,
) {
    const { endpoint, fetch } = useFetchOptions(options);
    const reqUrl = makeUrl(endpoint, model, operation, args);
    const queryKey = getQueryKey(model, operation, args, {
        infinite: false,
        optimisticUpdate: options?.optimisticUpdate !== false,
    });
    return {
        queryKey,
        ...useSuspenseQuery({
            queryKey,
            queryFn: ({ signal }) => fetcher<TQueryFnData>(reqUrl, { signal }, fetch),
            ...options,
        }),
    };
}

export function useInternalInfiniteQuery<TQueryFnData, TData>(
    _schema: SchemaDef,
    model: string,
    operation: string,
    args: unknown,
    options:
        | (Omit<
              UseInfiniteQueryOptions<TQueryFnData, DefaultError, InfiniteData<TData>>,
              'queryKey' | 'initialPageParam'
          > &
              QueryContext)
        | undefined,
) {
    options = options ?? { getNextPageParam: () => undefined };
    const { endpoint, fetch } = useFetchOptions(options);
    const queryKey = getQueryKey(model, operation, args, { infinite: true, optimisticUpdate: false });
    return {
        queryKey,
        ...useInfiniteQuery({
            queryKey,
            queryFn: ({ pageParam, signal }) => {
                return fetcher<TQueryFnData>(makeUrl(endpoint, model, operation, pageParam ?? args), { signal }, fetch);
            },
            initialPageParam: args,
            ...options,
        }),
    };
}

export function useInternalSuspenseInfiniteQuery<TQueryFnData, TData>(
    _schema: SchemaDef,
    model: string,
    operation: string,
    args: unknown,
    options: Omit<
        UseSuspenseInfiniteQueryOptions<TQueryFnData, DefaultError, InfiniteData<TData>> & QueryContext,
        'queryKey' | 'initialPageParam'
    >,
) {
    const { endpoint, fetch } = useFetchOptions(options);
    const queryKey = getQueryKey(model, operation, args, { infinite: true, optimisticUpdate: false });
    return {
        queryKey,
        ...useSuspenseInfiniteQuery({
            queryKey,
            queryFn: ({ pageParam, signal }) => {
                return fetcher<TQueryFnData>(makeUrl(endpoint, model, operation, pageParam ?? args), { signal }, fetch);
            },
            initialPageParam: args,
            ...options,
        }),
    };
}

/**
 * Creates a react-query mutation
 *
 * @private
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param operation The mutation operation (e.g. `create`).
 * @param options The react-query options.
 * @param checkReadBack Whether to check for read back errors and return undefined if found.
 */
export function useInternalMutation<TArgs, R = any>(
    schema: SchemaDef,
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    operation: string,
    options?: Omit<UseMutationOptions<R, DefaultError, TArgs>, 'mutationFn'> & ExtraMutationOptions,
) {
    const { endpoint, fetch, logging } = useFetchOptions(options);
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

    const finalOptions = { ...options, mutationFn };
    if (model !== CUSTOM_PROC_ROUTE_NAME) {
        // not a custom procedure, set up optimistic update and invalidation

        const invalidateQueries = options?.invalidateQueries !== false;
        const optimisticUpdate = !!options?.optimisticUpdate;

        if (!optimisticUpdate) {
            // if optimistic update is not enabled, invalidate related queries on success
            if (invalidateQueries) {
                const invalidator = createInvalidator(
                    model,
                    operation,
                    schema,
                    (predicate) => invalidateQueriesMatchingPredicate(queryClient, predicate),
                    logging,
                );
                const origOnSuccess = finalOptions.onSuccess;
                finalOptions.onSuccess = async (...args) => {
                    // execute invalidator prior to user-provided onSuccess
                    await invalidator(...args);

                    // call user-provided onSuccess
                    await origOnSuccess?.(...args);
                };
            }
        } else {
            // schedule optimistic update on mutate
            const optimisticUpdater = createOptimisticUpdater(
                model,
                operation,
                schema,
                { optimisticDataProvider: finalOptions.optimisticDataProvider },
                () => getAllQueries(queryClient),
                logging,
            );
            const origOnMutate = finalOptions.onMutate;
            finalOptions.onMutate = async (...args) => {
                // execute optimistic update
                await optimisticUpdater(...args);

                // call user-provided onMutate
                return origOnMutate?.(...args);
            };

            if (invalidateQueries) {
                // invalidate related queries on settled (success or error)
                const invalidator = createInvalidator(
                    model,
                    operation,
                    schema,
                    (predicate) => invalidateQueriesMatchingPredicate(queryClient, predicate),
                    logging,
                );
                const origOnSettled = finalOptions.onSettled;
                finalOptions.onSettled = async (...args) => {
                    // execute invalidator prior to user-provided onSettled
                    await invalidator(...args);

                    // call user-provided onSettled
                    return origOnSettled?.(...args);
                };
            }
        }
    }

    return useMutation(finalOptions);
}

function useFetchOptions(options: QueryContext | undefined) {
    const { endpoint, fetch, logging } = useHooksContext();
    // options take precedence over context
    return {
        endpoint: options?.endpoint ?? endpoint,
        fetch: options?.fetch ?? fetch,
        logging: options?.logging ?? logging,
    };
}
