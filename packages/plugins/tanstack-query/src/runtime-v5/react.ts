/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type InfiniteData,
    type UseInfiniteQueryOptions,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query-v5';
import type { ModelMeta } from '@zenstackhq/runtime/cross';
import { createContext, useContext } from 'react';
import {
    DEFAULT_QUERY_ENDPOINT,
    FetchFn,
    fetcher,
    getQueryKey,
    makeUrl,
    marshal,
    setupInvalidation,
    setupOptimisticUpdate,
    type APIContext,
} from '../runtime/common';

/**
 * Context for configuring react hooks.
 */
export const RequestHandlerContext = createContext<APIContext>({
    endpoint: DEFAULT_QUERY_ENDPOINT,
    fetch: undefined,
});

/**
 * Hooks context.
 */
export function getHooksContext() {
    const { endpoint, ...rest } = useContext(RequestHandlerContext);
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
}

/**
 * Context provider.
 */
export const Provider = RequestHandlerContext.Provider;

/**
 * Creates a react-query query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The request args object, URL-encoded and appended as "?q=" parameter
 * @param options The react-query options object
 * @param fetch The fetch function to use for sending the HTTP request
 * @param optimisticUpdate Whether to enable automatic optimistic update
 * @returns useQuery hook
 */
export function useModelQuery<R>(
    model: string,
    url: string,
    args?: unknown,
    options?: Omit<UseQueryOptions<R>, 'queryKey'>,
    fetch?: FetchFn,
    optimisticUpdate = false
) {
    const reqUrl = makeUrl(url, args);
    return useQuery({
        queryKey: getQueryKey(model, url, args, false, optimisticUpdate),
        queryFn: () => fetcher<R, false>(reqUrl, undefined, fetch, false),
        ...options,
    });
}

/**
 * Creates a react-query infinite query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The initial request args object, URL-encoded and appended as "?q=" parameter
 * @param options The react-query infinite query options object
 * @param fetch The fetch function to use for sending the HTTP request
 * @returns useInfiniteQuery hook
 */
export function useInfiniteModelQuery<R>(
    model: string,
    url: string,
    args: unknown,
    options: Omit<UseInfiniteQueryOptions<R, unknown, InfiniteData<R>>, 'queryKey'>,
    fetch?: FetchFn
) {
    return useInfiniteQuery({
        queryKey: getQueryKey(model, url, args, true),
        queryFn: ({ pageParam }) => {
            return fetcher<R, false>(makeUrl(url, pageParam ?? args), undefined, fetch, false);
        },
        ...options,
    });
}

/**
 * Creates a react-query mutation
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param url The request URL.
 * @param modelMeta The model metadata.
 * @param options The react-query options.
 * @param fetch The fetch function to use for sending the HTTP request
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @param checkReadBack Whether to check for read back errors and return undefined if found.
 * @param optimisticUpdate Whether to enable automatic optimistic update
 */
export function useModelMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    modelMeta: ModelMeta,
    options?: Omit<UseMutationOptions<Result, unknown, T>, 'mutationFn'>,
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

    const finalOptions = { ...options, mutationFn };
    const operation = url.split('/').pop();

    if (operation) {
        const { logging } = useContext(RequestHandlerContext);
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

    return useMutation(finalOptions);
}
