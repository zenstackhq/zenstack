/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type QueryKey,
    type UseInfiniteQueryOptions,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/vue-query';
import type { ModelMeta } from '@zenstackhq/runtime/cross';
import { computed, inject, provide, toValue, type MaybeRef } from 'vue';
import {
    APIContext,
    DEFAULT_QUERY_ENDPOINT,
    fetcher,
    getQueryKey,
    makeUrl,
    marshal,
    setupInvalidation,
    setupOptimisticUpdate,
    type FetchFn,
} from './common';

export { APIContext as RequestHandlerContext } from './common';

export const VueQueryContextKey = 'zenstack-vue-query-context';

/**
 * Provide context for the generated TanStack Query hooks.
 */
export function provideHooksContext(context: APIContext) {
    provide<APIContext>(VueQueryContextKey, context);
}

/**
 * Hooks context.
 */
export function getHooksContext() {
    const { endpoint, ...rest } = inject<APIContext>(VueQueryContextKey, {
        endpoint: DEFAULT_QUERY_ENDPOINT,
        fetch: undefined,
        logging: false,
    });
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
}

/**
 * Creates a vue-query query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The request args object, URL-encoded and appended as "?q=" parameter
 * @param options The vue-query options object
 * @param fetch The fetch function to use for sending the HTTP request
 * @param optimisticUpdate Whether to enable automatic optimistic update
 * @returns useQuery hook
 */
export function useModelQuery<TQueryFnData, TData, TError>(
    model: string,
    url: string,
    args?: MaybeRef<unknown>,
    options?: MaybeRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>,
    fetch?: FetchFn,
    optimisticUpdate = false
) {
    const queryOptions = computed(() => {
        return {
            queryKey: getQueryKey(model, url, toValue(args), false, optimisticUpdate),
            queryFn: ({ queryKey }: { queryKey: QueryKey }) => {
                const [_prefix, _model, _op, args] = queryKey;
                const reqUrl = makeUrl(url, toValue(args));
                return fetcher<TQueryFnData, false>(reqUrl, undefined, fetch, false);
            },
            ...toValue(options),
        };
    });
    return useQuery<TQueryFnData, TError, TData>(queryOptions);
}

/**
 * Creates a vue-query infinite query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The initial request args object, URL-encoded and appended as "?q=" parameter
 * @param options The vue-query infinite query options object
 * @param fetch The fetch function to use for sending the HTTP request
 * @returns useInfiniteQuery hook
 */
export function useInfiniteModelQuery<TQueryFnData, TData, TError>(
    model: string,
    url: string,
    args?: MaybeRef<unknown>,
    options?: MaybeRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>,
    fetch?: FetchFn
) {
    // CHECKME: vue-query's `useInfiniteQuery`'s input typing seems wrong
    const queryOptions: any = computed(() => ({
        queryKey: getQueryKey(model, url, toValue(args), true),
        queryFn: ({ queryKey, pageParam }: { queryKey: QueryKey; pageParam?: unknown }) => {
            const [_prefix, _model, _op, args] = queryKey;
            const reqUrl = makeUrl(url, pageParam ?? toValue(args));
            return fetcher<TQueryFnData, false>(reqUrl, undefined, fetch, false);
        },
        ...toValue(options),
    }));

    return useInfiniteQuery<TQueryFnData, TError, TData>(queryOptions);
}

/**
 * Creates a mutation with vue-query.
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param modelMeta The model metadata.
 * @param url The request URL.
 * @param options The vue-query options.
 * @param fetch The fetch function to use for sending the HTTP request
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @param checkReadBack Whether to check for read back errors and return undefined if found.
 * @param optimisticUpdate Whether to enable automatic optimistic update
 * @returns useMutation hooks
 */
export function useModelMutation<
    TArgs,
    TError,
    R = any,
    C extends boolean = boolean,
    Result = C extends true ? R | undefined : R
>(
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    modelMeta: ModelMeta,
    options?: MaybeRef<Omit<UseMutationOptions<Result, TError, TArgs, unknown>, 'mutationFn'>>,
    fetch?: FetchFn,
    invalidateQueries = true,
    checkReadBack?: C,
    optimisticUpdate = false
) {
    const queryClient = useQueryClient();
    const mutationFn = (data: any) => {
        const reqUrl = method === 'DELETE' ? makeUrl(url, data) : url;
        const fetchInit: RequestInit = {
            method,
            ...(method !== 'DELETE' && {
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            }),
        };
        return fetcher<R, C>(reqUrl, fetchInit, fetch, checkReadBack) as Promise<Result>;
    };

    // TODO: figure out the typing problem
    const finalOptions: any = computed(() => ({ ...toValue(options), mutationFn }));
    const operation = url.split('/').pop();
    if (operation) {
        const { logging } = getHooksContext();
        if (invalidateQueries) {
            setupInvalidation(
                model,
                operation,
                modelMeta,
                toValue(finalOptions),
                (predicate) => queryClient.invalidateQueries({ predicate }),
                logging
            );
        }

        if (optimisticUpdate) {
            setupOptimisticUpdate(
                model,
                operation,
                modelMeta,
                toValue(finalOptions),
                queryClient.getQueryCache().getAll(),
                (queryKey, data) => queryClient.setQueryData<unknown>(queryKey, data),
                invalidateQueries ? (predicate) => queryClient.invalidateQueries({ predicate }) : undefined,
                logging
            );
        }
    }
    return useMutation<Result, TError, TArgs>(finalOptions);
}
