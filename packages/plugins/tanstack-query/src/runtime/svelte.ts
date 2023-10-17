/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    createInfiniteQuery,
    createMutation,
    createQuery,
    useQueryClient,
    type CreateInfiniteQueryOptions,
    type MutateFunction,
    type MutationOptions,
    type QueryClient,
    type QueryOptions,
} from '@tanstack/svelte-query';
import { setContext } from 'svelte';
import { APIContext, FetchFn, QUERY_KEY_PREFIX, fetcher, makeUrl, marshal } from './common';

export { APIContext as RequestHandlerContext } from './common';

/**
 * Key for setting and getting the global query context.
 */
export const SvelteQueryContextKey = 'zenstack-svelte-query-context';

/**
 * Set context for the generated TanStack Query hooks.
 */
export function setHooksContext(context: APIContext) {
    setContext(SvelteQueryContextKey, context);
}

/**
 * Creates a svelte-query query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The request args object, URL-encoded and appended as "?q=" parameter
 * @param options The svelte-query options object
 * @returns useQuery hook
 */
export function query<R>(model: string, url: string, args?: unknown, options?: QueryOptions<R>, fetch?: FetchFn) {
    const reqUrl = makeUrl(url, args);
    return createQuery<R>({
        queryKey: [QUERY_KEY_PREFIX + model, url, args],
        queryFn: () => fetcher<R, false>(reqUrl, undefined, fetch, false),
        ...options,
    });
}

/**
 * Creates a svelte-query infinite query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The initial request args object, URL-encoded and appended as "?q=" parameter
 * @param options The svelte-query infinite query options object
 * @returns useQuery hook
 */
export function infiniteQuery<R>(
    model: string,
    url: string,
    args?: unknown,
    options?: CreateInfiniteQueryOptions<R>,
    fetch?: FetchFn
) {
    return createInfiniteQuery<R>({
        queryKey: [QUERY_KEY_PREFIX + model, url, args],
        queryFn: ({ pageParam }) => fetcher<R, false>(makeUrl(url, pageParam ?? args), undefined, fetch, false),
        ...options,
    });
}

/**
 * Creates a POST mutation with svelte-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The svelte-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function postMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    url: string,
    options?: Omit<MutationOptions<Result, unknown, T>, 'mutationFn'>,
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
    const mutation = createMutation<Result, unknown, T>(finalOptions);
    return mutation;
}

/**
 * Creates a PUT mutation with svelte-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The svelte-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function putMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    url: string,
    options?: Omit<MutationOptions<Result, unknown, T>, 'mutationFn'>,
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
    const mutation = createMutation<Result, unknown, T>(finalOptions);
    return mutation;
}

/**
 * Creates a DELETE mutation with svelte-query.
 *
 * @param model The name of the model under mutation.
 * @param url The request URL.
 * @param options The svelte-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function deleteMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    url: string,
    options?: Omit<MutationOptions<Result, unknown, T>, 'mutationFn'>,
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
    const mutation = createMutation<Result, unknown, T>(finalOptions);
    return mutation;
}

function mergeOptions<T, R = any>(
    model: string,
    options: Omit<MutationOptions<R, unknown, T, unknown>, 'mutationFn'> | undefined,
    invalidateQueries: boolean,
    mutationFn: MutateFunction<R, unknown, T>,
    queryClient: QueryClient
): MutationOptions<R, unknown, T, unknown> {
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
