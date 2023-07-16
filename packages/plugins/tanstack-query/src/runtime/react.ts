/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    useMutation,
    useQuery,
    useQueryClient,
    type MutateFunction,
    type QueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { createContext } from 'react';
import {
    DEFAULT_QUERY_ENDPOINT,
    FetchFn,
    QUERY_KEY_PREFIX,
    fetcher,
    makeUrl,
    marshal,
    type APIContext,
} from './common';

/**
 * Context for configuring react hooks.
 */
export const RequestHandlerContext = createContext<APIContext>({
    endpoint: DEFAULT_QUERY_ENDPOINT,
    fetch: undefined,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function query<R>(model: string, url: string, args?: unknown, options?: UseQueryOptions<R>, fetch?: FetchFn) {
    const reqUrl = makeUrl(url, args);
    return useQuery<R>({
        queryKey: [QUERY_KEY_PREFIX + model, url, args],
        queryFn: () => fetcher<R, false>(reqUrl, undefined, fetch, false),
        ...options,
    });
}

/**
 * Creates a POST mutation with react-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The react-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function postMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    url: string,
    options?: Omit<UseMutationOptions<Result, unknown, T>, 'mutationFn'>,
    fetch?: FetchFn,
    invalidateQueries = true,
    checkReadBack?: C
) {
    const queryClient = useQueryClient();
    const mutationFn = (data: any) =>
        fetcher<R, C>(
            url,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            },
            fetch,
            checkReadBack
        ) as Promise<Result>;

    const finalOptions = mergeOptions<T, Result>(model, options, invalidateQueries, mutationFn, queryClient);
    const mutation = useMutation<Result, unknown, T>(finalOptions);
    return mutation;
}

/**
 * Creates a PUT mutation with react-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The react-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function putMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    url: string,
    options?: Omit<UseMutationOptions<Result, unknown, T>, 'mutationFn'>,
    fetch?: FetchFn,
    invalidateQueries = true,
    checkReadBack?: C
) {
    const queryClient = useQueryClient();
    const mutationFn = (data: any) =>
        fetcher<R, C>(
            url,
            {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: marshal(data),
            },
            fetch,
            checkReadBack
        ) as Promise<Result>;

    const finalOptions = mergeOptions<T, Result>(model, options, invalidateQueries, mutationFn, queryClient);
    const mutation = useMutation<Result, unknown, T>(finalOptions);
    return mutation;
}

/**
 * Creates a DELETE mutation with react-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The react-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function deleteMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    url: string,
    options?: Omit<UseMutationOptions<Result, unknown, T>, 'mutationFn'>,
    fetch?: FetchFn,
    invalidateQueries = true,
    checkReadBack?: C
) {
    const queryClient = useQueryClient();
    const mutationFn = (data: any) =>
        fetcher<R, C>(
            makeUrl(url, data),
            {
                method: 'DELETE',
            },
            fetch,
            checkReadBack
        ) as Promise<Result>;

    const finalOptions = mergeOptions<T, Result>(model, options, invalidateQueries, mutationFn, queryClient);
    const mutation = useMutation<Result, unknown, T>(finalOptions);
    return mutation;
}

function mergeOptions<T, R = any>(
    model: string,
    options: Omit<UseMutationOptions<R, unknown, T, unknown>, 'mutationFn'> | undefined,
    invalidateQueries: boolean,
    mutationFn: MutateFunction<R, unknown, T>,
    queryClient: QueryClient
): UseMutationOptions<R, unknown, T, unknown> {
    const result = { ...options, mutationFn };
    if (options?.onSuccess || invalidateQueries) {
        result.onSuccess = (...args) => {
            if (invalidateQueries) {
                queryClient.invalidateQueries([QUERY_KEY_PREFIX + model]);
            }
            return options?.onSuccess?.(...args);
        };
    }
    return result;
}
