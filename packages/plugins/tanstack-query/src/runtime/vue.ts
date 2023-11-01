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
 * @returns useQuery hook
 */
export function useModelQuery<R>(
    model: string,
    url: string,
    args?: unknown,
    options?: UseQueryOptions<R>,
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
 * Creates a vue-query infinite query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The initial request args object, URL-encoded and appended as "?q=" parameter
 * @param options The vue-query infinite query options object
 * @returns useInfiniteQuery hook
 */
export function useInfiniteModelQuery<R>(
    model: string,
    url: string,
    args?: unknown,
    options?: UseInfiniteQueryOptions<R>,
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
 * Creates a mutation with vue-query.
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param modelMeta The model metadata.
 * @param url The request URL.
 * @param options The vue-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
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

    // TODO: figure out the typing problem
    const finalOptions: any = { ...options, mutationFn };
    if (invalidateQueries) {
        const { logging } = getHooksContext();
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
    return useMutation<Result, unknown, T>(finalOptions);
}
