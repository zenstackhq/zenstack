/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    createInfiniteQuery,
    createMutation,
    createQuery,
    useQueryClient,
    type CreateInfiniteQueryOptions,
    type CreateQueryOptions,
    type InfiniteData,
    type MutationOptions,
    type StoreOrVal,
} from '@tanstack/svelte-query-v5';
import { ModelMeta } from '@zenstackhq/runtime/cross';
import { getContext, setContext } from 'svelte';
import { Readable, derived } from 'svelte/store';
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
 * @param fetch The fetch function to use for sending the HTTP request
 * @param optimisticUpdate Whether to enable automatic optimistic update
 * @returns useQuery hook
 */
export function useModelQuery<TQueryFnData, TData, TError>(
    model: string,
    url: string,
    args?: unknown,
    options?: StoreOrVal<Omit<CreateQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>,
    fetch?: FetchFn,
    optimisticUpdate = false
) {
    const reqUrl = makeUrl(url, args);
    const queryKey = getQueryKey(model, url, args, false, optimisticUpdate);
    const queryFn = () => fetcher<TQueryFnData, false>(reqUrl, undefined, fetch, false);

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
export function useInfiniteModelQuery<TQueryFnData, TData, TError>(
    model: string,
    url: string,
    args: unknown,
    options: StoreOrVal<Omit<CreateInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TData>>, 'queryKey'>>,
    fetch?: FetchFn
) {
    const queryKey = getQueryKey(model, url, args, true);
    const queryFn = ({ pageParam }: { pageParam: unknown }) =>
        fetcher<TQueryFnData, false>(makeUrl(url, pageParam ?? args), undefined, fetch, false);

    let mergedOpt: StoreOrVal<CreateInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TData>>>;
    if (isStore<CreateInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TData>>>(options)) {
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
    return createInfiniteQuery<TQueryFnData, TError, InfiniteData<TData>>(mergedOpt);
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
    options?: Omit<MutationOptions<Result, TError, TArgs>, 'mutationFn'>,
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
        const { logging } = getContext<APIContext>(SvelteQueryContextKey);
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

    return createMutation(finalOptions);
}
