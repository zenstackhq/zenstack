/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    createInfiniteQuery,
    createMutation,
    createQuery,
    useQueryClient,
    type CreateInfiniteQueryOptions,
    type InfiniteData,
    type MutationOptions,
    type StoreOrVal,
} from '@tanstack/svelte-query-v5';
import { QueryOptions } from '@tanstack/vue-query';
import { ModelMeta } from '@zenstackhq/runtime/cross';
import { getContext, setContext } from 'svelte';
import { Readable, derived } from 'svelte/store';
import {
    APIContext,
    DEFAULT_QUERY_ENDPOINT,
    FetchFn,
    fetcher,
    getQueryKey,
    makeUrl,
    marshal,
    setupInvalidation,
} from '../runtime/common';

export { APIContext as RequestHandlerContext } from '../runtime/common';

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
 * Hooks context.
 */
export function getHooksContext() {
    const { endpoint, ...rest } = getContext<APIContext>(SvelteQueryContextKey);
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
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
export function useModelQuery<R>(
    model: string,
    url: string,
    args?: unknown,
    options?: StoreOrVal<Omit<QueryOptions<R>, 'queryKey'>>,
    fetch?: FetchFn
) {
    const reqUrl = makeUrl(url, args);
    const queryKey = getQueryKey(model, url, args);
    const queryFn = () => fetcher<R, false>(reqUrl, undefined, fetch, false);

    let mergedOpt: any;
    if (isStore(options)) {
        // options is store
        mergedOpt = derived([options], ([$opt]) => {
            return {
                queryKey,
                queryFn,
                ...($opt as object),
            };
        });
    } else {
        // options is value
        mergedOpt = {
            queryKey,
            queryFn,
            ...options,
        };
    }
    return createQuery(mergedOpt);
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
export function useInfiniteModelQuery<R>(
    model: string,
    url: string,
    args: unknown,
    options: StoreOrVal<Omit<CreateInfiniteQueryOptions<R, unknown, InfiniteData<R>>, 'queryKey'>>,
    fetch?: FetchFn
) {
    const queryKey = getQueryKey(model, url, args);
    const queryFn = ({ pageParam }: { pageParam: unknown }) =>
        fetcher<R, false>(makeUrl(url, pageParam ?? args), undefined, fetch, false);

    let mergedOpt: StoreOrVal<CreateInfiniteQueryOptions<R, unknown, InfiniteData<R>>>;
    if (isStore<CreateInfiniteQueryOptions<R, unknown, InfiniteData<R>>>(options)) {
        // options is store
        mergedOpt = derived([options], ([$opt]) => {
            return {
                queryKey,
                queryFn,
                ...$opt,
            };
        });
    } else {
        // options is value
        mergedOpt = {
            queryKey,
            queryFn,
            ...options,
        };
    }
    return createInfiniteQuery<R, unknown, InfiniteData<R>>(mergedOpt);
}

function isStore<T>(opt: unknown): opt is Readable<T> {
    return typeof (opt as any)?.subscribe === 'function';
}

/**
 * Creates a POST mutation with svelte-query.
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param modelMeta The model metadata.
 * @param url The request URL.
 * @param options The svelte-query options.
 * @param invalidateQueries Whether to invalidate queries after mutation.
 * @returns useMutation hooks
 */
export function useModelMutation<T, R = any, C extends boolean = boolean, Result = C extends true ? R | undefined : R>(
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    modelMeta: ModelMeta,
    options?: Omit<MutationOptions<Result, unknown, T>, 'mutationFn'>,
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
        const { logging } = getContext<APIContext>(SvelteQueryContextKey);
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

    return createMutation(finalOptions);
}
