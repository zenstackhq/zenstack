/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type UseInfiniteQueryOptions,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/vue-query';
import type { ModelMeta } from '@zenstackhq/runtime/cross';
import { inject, provide } from 'vue';
import {
    APIContext,
    DEFAULT_QUERY_ENDPOINT,
    FetchFn,
    fetcher,
    getQueryKey,
    makeUrl,
    marshal,
    setupInvalidation,
    setupOptimisticUpdate,
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
    args?: unknown,
    options?: UseQueryOptions<TQueryFnData, TError, TData>,
    fetch?: FetchFn,
    optimisticUpdate = false
) {
    const reqUrl = makeUrl(url, args);
    return useQuery<TQueryFnData, TError, TData>({
        queryKey: getQueryKey(model, url, args, false, optimisticUpdate),
        queryFn: () => fetcher<TQueryFnData, false>(reqUrl, undefined, fetch, false),
        ...options,
    });
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
    args?: unknown,
    options?: UseInfiniteQueryOptions<TQueryFnData, TError, TData>,
    fetch?: FetchFn
) {
    return useInfiniteQuery<TQueryFnData, TError, TData>({
        queryKey: getQueryKey(model, url, args, true),
        queryFn: ({ pageParam }) => {
            return fetcher<TQueryFnData, false>(makeUrl(url, pageParam ?? args), undefined, fetch, false);
        },
        ...options,
    });
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
export function useModelMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    modelMeta: ModelMeta,
    options?: Omit<UseMutationOptions<Result, unknown, T, unknown>, 'mutationFn'>,
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
    const finalOptions: any = { ...options, mutationFn };
    const operation = url.split('/').pop();
    if (operation) {
        const { logging } = getHooksContext();
        if (invalidateQueries) {
            setupInvalidation(
                model,
                operation,
                modelMeta,
                finalOptions,
                (predicate) => queryClient.invalidateQueries({ predicate }),
                logging
            );
        }

        if (optimisticUpdate) {
            setupOptimisticUpdate(
                model,
                operation,
                modelMeta,
                finalOptions,
                queryClient.getQueryCache().getAll(),
                (queryKey, data) => queryClient.setQueryData<unknown>(queryKey, data),
                invalidateQueries ? (predicate) => queryClient.invalidateQueries({ predicate }) : undefined,
                logging
            );
        }
    }
    return useMutation<Result, unknown, T>(finalOptions);
}
