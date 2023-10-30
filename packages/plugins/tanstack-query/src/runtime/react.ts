/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type UseInfiniteQueryOptions,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
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
    type APIContext,
} from './common';

/**
 * Context for configuring react hooks.
 */
export const RequestHandlerContext = createContext<APIContext>({
    endpoint: DEFAULT_QUERY_ENDPOINT,
    fetch: undefined,
    logging: false,
});

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
 * @returns useQuery hook
 */
export function query<R>(
    model: string,
    url: string,
    args?: unknown,
    options?: Omit<UseQueryOptions<R>, 'queryKey'>,
    fetch?: FetchFn
) {
    const reqUrl = makeUrl(url, args);
    return useQuery<R>({
        queryKey: getQueryKey(model, url, args),
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
 * @returns useInfiniteQuery hook
 */
export function infiniteQuery<R>(
    model: string,
    url: string,
    args?: unknown,
    options?: Omit<UseInfiniteQueryOptions<R>, 'queryKey'>,
    fetch?: FetchFn
) {
    return useInfiniteQuery<R>({
        queryKey: getQueryKey(model, url, args),
        queryFn: ({ pageParam }) => {
            return fetcher<R, false>(makeUrl(url, pageParam ?? args), undefined, fetch, false);
        },
        ...options,
    });
}

/**
 * Creates a mutation with react-query.
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param modelMeta The model metadata.
 * @param url The request URL.
 * @param options The react-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function mutate<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    modelMeta: ModelMeta,
    options?: Omit<UseMutationOptions<Result, unknown, T>, 'mutationFn'>,
    fetch?: FetchFn,
    invalidateQueries = true,
    checkReadBack?: C
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
    if (invalidateQueries) {
        const { logging } = useContext(RequestHandlerContext);
        const operation = url.split('/').pop();
        if (operation) {
            setupInvalidation(
                model,
                operation,
                modelMeta,
                finalOptions,
                (predicate) => queryClient.invalidateQueries({ predicate }),
                logging
            );
        }
    }

    return useMutation(finalOptions);
}
