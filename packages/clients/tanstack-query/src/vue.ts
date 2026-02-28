import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type DefaultError,
    type InfiniteData,
    type QueryKey,
    type UseInfiniteQueryOptions,
    type UseInfiniteQueryReturnType,
    type UseMutationOptions,
    type UseMutationReturnType,
    type UseQueryOptions,
    type UseQueryReturnType,
} from '@tanstack/vue-query';
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
import { computed, inject, provide, toValue, unref, type MaybeRefOrGetter, type Ref, type UnwrapRef } from 'vue';
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
export const VueQueryContextKey = 'zenstack-vue-query-context';

type ProcedureHookFn<
    Schema extends SchemaDef,
    ProcName extends GetProcedureNames<Schema>,
    Options,
    Result,
    Input = ProcedureEnvelope<Schema, ProcName>,
> = { args: undefined } extends Input
    ? (args?: MaybeRefOrGetter<Input>, options?: MaybeRefOrGetter<Options>) => Result
    : (args: MaybeRefOrGetter<Input>, options?: MaybeRefOrGetter<Options>) => Result;

/**
 * Provide context for query settings.
 *
 * @deprecated Use {@link provideQuerySettingsContext} instead.
 */
export function provideHooksContext(context: QueryContext) {
    provide<QueryContext>(VueQueryContextKey, context);
}

/**
 * Provide context for query settings.
 */
export function provideQuerySettingsContext(context: QueryContext) {
    provide<QueryContext>(VueQueryContextKey, context);
}

function useQuerySettings() {
    const { endpoint, ...rest } = inject<QueryContext>(VueQueryContextKey, {
        endpoint: DEFAULT_QUERY_ENDPOINT,
        fetch: undefined,
        logging: false,
    });
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
}

export type ModelQueryOptions<T> = MaybeRefOrGetter<
    Omit<UnwrapRef<UseQueryOptions<T, DefaultError>>, 'queryKey'> & ExtraQueryOptions
>;

export type ModelQueryResult<T> = UseQueryReturnType<WithOptimistic<T>, DefaultError> & { queryKey: Ref<QueryKey> };

export type ModelInfiniteQueryOptions<T> = MaybeRefOrGetter<
    Omit<UnwrapRef<UseInfiniteQueryOptions<T, DefaultError, InfiniteData<T>>>, 'queryKey' | 'initialPageParam'> &
        QueryContext
>;

export type ModelInfiniteQueryResult<T> = UseInfiniteQueryReturnType<T, DefaultError> & { queryKey: Ref<QueryKey> };

export type ModelMutationOptions<T, TArgs> = MaybeRefOrGetter<
    Omit<UnwrapRef<UseMutationOptions<T, DefaultError, TArgs>>, 'mutationFn'> & ExtraMutationOptions
>;

export type ModelMutationResult<T, TArgs> = UseMutationReturnType<T, DefaultError, TArgs, unknown>;

export type ModelMutationModelResult<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    TArgs,
    Array extends boolean = false,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
> = Omit<
    ModelMutationResult<SimplifiedResult<Schema, Model, TArgs, QueryOptions<Schema>, false, Array>, TArgs>,
    'mutateAsync'
> & {
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
                  options?: MaybeRefOrGetter<
                      Omit<
                          UnwrapRef<
                              UseMutationOptions<
                                  ProcedureReturn<Schema, Name>,
                                  DefaultError,
                                  ProcedureEnvelope<Schema, Name>
                              >
                          >,
                          'mutationFn'
                      > &
                          QueryContext
                  >,
              ): UseMutationReturnType<
                  ProcedureReturn<Schema, Name>,
                  DefaultError,
                  ProcedureEnvelope<Schema, Name>,
                  unknown
              >;
          }
        : {
              useQuery: ProcedureHookFn<
                  Schema,
                  Name,
                  Omit<ModelQueryOptions<ProcedureReturn<Schema, Name>>, 'optimisticUpdate'>,
                  UseQueryReturnType<ProcedureReturn<Schema, Name>, DefaultError> & { queryKey: Ref<QueryKey> }
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
            args: MaybeRefOrGetter<SelectSubset<T, FindUniqueArgs<Schema, Model, Options>>>,
            options?: MaybeRefOrGetter<ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options> | null>>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options> | null>;

        useFindFirst<T extends FindFirstArgs<Schema, Model, Options>>(
            args?: MaybeRefOrGetter<SelectSubset<T, FindFirstArgs<Schema, Model, Options>>>,
            options?: MaybeRefOrGetter<ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options> | null>>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options> | null>;

        useExists<T extends ExistsArgs<Schema, Model, Options>>(
            args?: MaybeRefOrGetter<Subset<T, ExistsArgs<Schema, Model, Options>>>,
            options?: MaybeRefOrGetter<ModelQueryOptions<boolean>>,
        ): ModelQueryResult<boolean>;

        useFindMany<T extends FindManyArgs<Schema, Model, Options>>(
            args?: MaybeRefOrGetter<SelectSubset<T, FindManyArgs<Schema, Model, Options>>>,
            options?: MaybeRefOrGetter<ModelQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options>[]>>,
        ): ModelQueryResult<SimplifiedPlainResult<Schema, Model, T, Options>[]>;

        useInfiniteFindMany<T extends FindManyArgs<Schema, Model, Options>>(
            args?: MaybeRefOrGetter<SelectSubset<T, FindManyArgs<Schema, Model, Options>>>,
            options?: MaybeRefOrGetter<ModelInfiniteQueryOptions<SimplifiedPlainResult<Schema, Model, T, Options>[]>>,
        ): ModelInfiniteQueryResult<InfiniteData<SimplifiedPlainResult<Schema, Model, T, Options>[]>>;

        useCreate<T extends CreateArgs<Schema, Model, Options>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useCreateMany<T extends CreateManyArgs<Schema, Model>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<BatchResult, T>>,
        ): ModelMutationResult<BatchResult, T>;

        useCreateManyAndReturn<T extends CreateManyAndReturnArgs<Schema, Model, Options>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>[], T>>,
        ): ModelMutationModelResult<Schema, Model, T, true, Options>;

        useUpdate<T extends UpdateArgs<Schema, Model, Options>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useUpdateMany<T extends UpdateManyArgs<Schema, Model, Options>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<BatchResult, T>>,
        ): ModelMutationResult<BatchResult, T>;

        useUpdateManyAndReturn<T extends UpdateManyAndReturnArgs<Schema, Model, Options>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>[], T>>,
        ): ModelMutationModelResult<Schema, Model, T, true, Options>;

        useUpsert<T extends UpsertArgs<Schema, Model, Options>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useDelete<T extends DeleteArgs<Schema, Model, Options>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<SimplifiedPlainResult<Schema, Model, T, Options>, T>>,
        ): ModelMutationModelResult<Schema, Model, T, false, Options>;

        useDeleteMany<T extends DeleteManyArgs<Schema, Model, Options>>(
            options?: MaybeRefOrGetter<ModelMutationOptions<BatchResult, T>>,
        ): ModelMutationResult<BatchResult, T>;

        useCount<T extends CountArgs<Schema, Model, Options>>(
            args?: MaybeRefOrGetter<Subset<T, CountArgs<Schema, Model, Options>>>,
            options?: MaybeRefOrGetter<ModelQueryOptions<CountResult<Schema, Model, T>>>,
        ): ModelQueryResult<CountResult<Schema, Model, T>>;

        useAggregate<T extends AggregateArgs<Schema, Model, Options>>(
            args: MaybeRefOrGetter<Subset<T, AggregateArgs<Schema, Model, Options>>>,
            options?: MaybeRefOrGetter<ModelQueryOptions<AggregateResult<Schema, Model, T>>>,
        ): ModelQueryResult<AggregateResult<Schema, Model, T>>;

        useGroupBy<T extends GroupByArgs<Schema, Model, Options>>(
            args: MaybeRefOrGetter<Subset<T, GroupByArgs<Schema, Model, Options>>>,
            options?: MaybeRefOrGetter<ModelQueryOptions<GroupByResult<Schema, Model, T>>>,
        ): ModelQueryResult<GroupByResult<Schema, Model, T>>;
    }
>;

/**
 * Gets data query hooks for all models in the schema.
 */
export function useClientQueries<Schema extends SchemaDef, Options extends QueryOptions<Schema> = QueryOptions<Schema>>(
    schema: Schema,
    options?: MaybeRefOrGetter<QueryContext>,
): ClientHooks<Schema, Options> {
    const merge = (rootOpt: MaybeRefOrGetter<unknown> | undefined, opt: MaybeRefOrGetter<unknown> | undefined): any => {
        return computed(() => {
            const rootVal = toValue(rootOpt) ?? {};
            const optVal = toValue(opt) ?? {};
            return { ...(rootVal as object), ...(optVal as object) };
        });
    };

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
>(schema: Schema, model: Model, rootOptions?: MaybeRefOrGetter<QueryContext>): ModelQueryHooks<Schema, Model, Options> {
    const modelDef = Object.values(schema.models).find((m) => m.name.toLowerCase() === model.toLowerCase());
    if (!modelDef) {
        throw new Error(`Model "${model}" not found in schema`);
    }

    const modelName = modelDef.name;

    const merge = (rootOpt: MaybeRefOrGetter<unknown> | undefined, opt: MaybeRefOrGetter<unknown> | undefined): any => {
        return computed(() => {
            return { ...(toValue(rootOpt) as object), ...(toValue(opt) as object) };
        });
    };

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
            return useInternalInfiniteQuery(schema, modelName, 'findMany', args, merge(rootOptions, options));
        },

        useCreate: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'create', merge(rootOptions, options));
        },

        useCreateMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'createMany', merge(rootOptions, options));
        },

        useCreateManyAndReturn: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'createManyAndReturn', merge(rootOptions, options));
        },

        useUpdate: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'update', merge(rootOptions, options));
        },

        useUpdateMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'updateMany', merge(rootOptions, options));
        },

        useUpdateManyAndReturn: (options?: any) => {
            return useInternalMutation(schema, modelName, 'PUT', 'updateManyAndReturn', merge(rootOptions, options));
        },

        useUpsert: (options?: any) => {
            return useInternalMutation(schema, modelName, 'POST', 'upsert', merge(rootOptions, options));
        },

        useDelete: (options?: any) => {
            return useInternalMutation(schema, modelName, 'DELETE', 'delete', merge(rootOptions, options));
        },

        useDeleteMany: (options?: any) => {
            return useInternalMutation(schema, modelName, 'DELETE', 'deleteMany', merge(rootOptions, options));
        },

        useCount: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'count', args, merge(rootOptions, options));
        },

        useAggregate: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'aggregate', args, merge(rootOptions, options));
        },

        useGroupBy: (args: any, options?: any) => {
            return useInternalQuery(schema, modelName, 'groupBy', args, merge(rootOptions, options));
        },
    } as ModelQueryHooks<Schema, Model, Options>;
}

export function useInternalQuery<TQueryFnData, TData>(
    _schema: SchemaDef,
    model: string,
    operation: string,
    args?: MaybeRefOrGetter<unknown>,
    options?: MaybeRefOrGetter<
        Omit<UnwrapRef<UseQueryOptions<TQueryFnData, DefaultError, TData>>, 'queryKey'> & ExtraQueryOptions
    >,
) {
    // reactive query key
    const queryKey = computed(() => {
        const argsValue = toValue(args);
        const { optimisticUpdate } = toValue(options) ?? {};
        return getQueryKey(model, operation, argsValue, {
            infinite: false,
            optimisticUpdate: optimisticUpdate !== false,
        });
    });

    const { endpoint, fetch } = useFetchOptions(options);

    // reactive query options
    const finalOptions: any = computed(() => {
        const { optimisticUpdate: _, ...restOptions } = toValue(options) ?? {};
        return {
            queryKey: queryKey.value,
            queryFn: ({ signal }: any) => {
                const reqUrl = makeUrl(endpoint, model, operation, toValue(args));
                return fetcher<TQueryFnData>(reqUrl, { signal }, fetch);
            },
            ...restOptions,
        };
    });
    return { queryKey, ...useQuery<TQueryFnData, DefaultError, TData>(finalOptions) };
}

export function useInternalInfiniteQuery<TQueryFnData, TData>(
    _schema: SchemaDef,
    model: string,
    operation: string,
    args: MaybeRefOrGetter<unknown>,
    options: MaybeRefOrGetter<
        | (Omit<
              UnwrapRef<UseInfiniteQueryOptions<TQueryFnData, DefaultError, InfiniteData<TData>>>,
              'queryKey' | 'initialPageParam'
          > &
              QueryContext)
        | undefined
    >,
) {
    options = options ?? { getNextPageParam: () => undefined };

    // reactive query key
    const queryKey = computed(() => {
        const argsValue = toValue(args);
        return getQueryKey(model, operation, argsValue, { infinite: true, optimisticUpdate: false });
    });

    const { endpoint, fetch } = useFetchOptions(options);

    // reactive query options
    const finalOptions: any = computed(() => {
        const argsValue = toValue(args);
        return {
            queryKey: queryKey.value,
            queryFn: ({ signal }: any) => {
                const reqUrl = makeUrl(endpoint, model, operation, argsValue);
                return fetcher<TQueryFnData>(reqUrl, { signal }, fetch);
            },
            initialPageParam: toValue(argsValue),
            ...toValue(options),
        };
    });
    return {
        queryKey,
        ...useInfiniteQuery(finalOptions),
    };
}

/**
 * Creates a vue-query mutation
 *
 * @private
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param operation The mutation operation (e.g. `create`).
 * @param options The vue-query options.
 * @param checkReadBack Whether to check for read back errors and return undefined if found.
 */
export function useInternalMutation<TArgs, R = any>(
    schema: SchemaDef,
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    operation: string,
    options?: MaybeRefOrGetter<
        Omit<UnwrapRef<UseMutationOptions<R, DefaultError, TArgs>>, 'mutationFn'> & ExtraMutationOptions
    >,
) {
    const queryClient = useQueryClient();

    const { endpoint, fetch, logging } = useFetchOptions(options);
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

    // reactive mutation options
    const finalOptions = computed(() => {
        const optionsValue = toValue(options);
        const result = {
            ...optionsValue,
            mutationFn,
        } as UnwrapRef<UseMutationOptions<R, DefaultError, TArgs>> & ExtraMutationOptions;

        if (model !== CUSTOM_PROC_ROUTE_NAME) {
            // not a custom procedure, set up optimistic update and invalidation

            const invalidateQueries = optionsValue?.invalidateQueries !== false;
            const optimisticUpdate = !!optionsValue?.optimisticUpdate;

            if (!optimisticUpdate) {
                if (invalidateQueries) {
                    const invalidator = createInvalidator(
                        model,
                        operation,
                        schema,
                        (predicate: InvalidationPredicate) =>
                            invalidateQueriesMatchingPredicate(queryClient, predicate),
                        logging,
                    );
                    // execute invalidator prior to user-provided onSuccess
                    result.onSuccess = async (...args) => {
                        await invalidator(...args);
                        const origOnSuccess: any = toValue(optionsValue?.onSuccess);
                        await origOnSuccess?.(...args);
                    };
                }
            } else {
                const optimisticUpdater = createOptimisticUpdater(
                    model,
                    operation,
                    schema,
                    { optimisticDataProvider: result.optimisticDataProvider },
                    () => getAllQueries(queryClient),
                    logging,
                );

                // optimistic update on mutate
                const origOnMutate = result.onMutate;
                result.onMutate = async (...args) => {
                    // execute optimistic updater prior to user-provided onMutate
                    await optimisticUpdater(...args);

                    // call user-provided onMutate
                    return unref(origOnMutate)?.(...args);
                };

                if (invalidateQueries) {
                    const invalidator = createInvalidator(
                        model,
                        operation,
                        schema,
                        (predicate: InvalidationPredicate) =>
                            invalidateQueriesMatchingPredicate(queryClient, predicate),
                        logging,
                    );
                    const origOnSettled = result.onSettled;
                    result.onSettled = async (...args) => {
                        // execute invalidator prior to user-provided onSettled
                        await invalidator(...args);

                        // call user-provided onSettled
                        return unref(origOnSettled)?.(...args);
                    };
                }
            }
        }

        return result;
    });

    return useMutation(finalOptions);
}

function useFetchOptions(options: MaybeRefOrGetter<QueryContext | undefined>) {
    const { endpoint, fetch, logging } = useQuerySettings();
    const optionsValue = toValue(options);
    // options take precedence over context
    return {
        endpoint: optionsValue?.endpoint ?? endpoint,
        fetch: optionsValue?.fetch ?? fetch,
        logging: optionsValue?.logging ?? logging,
    };
}
