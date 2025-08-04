/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    injectQuery,
    injectMutation,
    injectInfiniteQuery,
    QueryClient,
    type CreateQueryOptions,
    type CreateMutationOptions,
    type CreateInfiniteQueryOptions,
    type InfiniteData,
    CreateInfiniteQueryResult,
    QueryKey,
} from '@tanstack/angular-query-v5';
import type { ModelMeta } from '@zenstackhq/runtime/cross';
import { inject, InjectionToken } from '@angular/core';
import {
    APIContext,
    DEFAULT_QUERY_ENDPOINT,
    fetcher,
    getQueryKey,
    makeUrl,
    marshal,
    setupInvalidation,
    setupOptimisticUpdate,
    type ExtraMutationOptions,
    type ExtraQueryOptions,
    type FetchFn,
} from '../runtime/common';

export { APIContext as RequestHandlerContext } from '../runtime/common';

export const AngularQueryContextKey = new InjectionToken<APIContext>('zenstack-angular-query-context');

/**
 * Provide context for the generated TanStack Query hooks.
 */
export function provideAngularQueryContext(context: APIContext) {
    return {
        provide: AngularQueryContextKey,
        useValue: context,
    };
}

/**
 * Hooks context.
 */
export function getHooksContext() {
    const context = inject(AngularQueryContextKey, {
        optional: true,
    }) || {
        endpoint: DEFAULT_QUERY_ENDPOINT,
        fetch: undefined,
        logging: false,
    };

    const { endpoint, ...rest } = context;
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
}

/**
 * Creates an Angular TanStack Query query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The request args object, URL-encoded and appended as "?q=" parameter
 * @param options The Angular query options object
 * @param fetch The fetch function to use for sending the HTTP request
 * @returns injectQuery hook
 */
export function useModelQuery<TQueryFnData, TData, TError>(
    model: string,
    url: string,
    args?: unknown,
    options?: Omit<CreateQueryOptions<TQueryFnData, TError, TData>, 'queryKey'> & ExtraQueryOptions,
    fetch?: FetchFn
) {
    const reqUrl = makeUrl(url, args);
    const queryKey = getQueryKey(model, url, args, {
        infinite: false,
        optimisticUpdate: options?.optimisticUpdate !== false,
    });
    return {
        queryKey,
        ...injectQuery(() => ({
            queryKey,
            queryFn: ({ signal }) => fetcher<TQueryFnData, false>(reqUrl, { signal }, fetch, false),
            ...options,
        })),
    };
}

/**
 * Creates an Angular TanStack Query infinite query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The initial request args object, URL-encoded and appended as "?q=" parameter
 * @param options The Angular infinite query options object
 * @param fetch The fetch function to use for sending the HTTP request
 * @returns injectInfiniteQuery hook
 */
export function useInfiniteModelQuery<TQueryFnData, TData, TError>(
    model: string,
    url: string,
    args: unknown,
    options: Omit<
        CreateInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TData>>,
        'queryKey' | 'initialPageParam'
    >,
    fetch?: FetchFn
): CreateInfiniteQueryResult<InfiniteData<TData>, TError> & { queryKey: QueryKey } {
    const queryKey = getQueryKey(model, url, args, { infinite: true, optimisticUpdate: false });
    return {
        queryKey,
        ...injectInfiniteQuery(() => ({
            queryKey,
            queryFn: ({ pageParam, signal }) => {
                return fetcher<TQueryFnData, false>(makeUrl(url, pageParam ?? args), { signal }, fetch, false);
            },
            initialPageParam: args,
            ...options,
        })),
    };
}

/**
 * Creates an Angular TanStack Query mutation.
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param url The request URL.
 * @param modelMeta The model metadata.
 * @param options The Angular mutation options.
 * @param fetch The fetch function to use for sending the HTTP request
 * @param checkReadBack Whether to check for read back errors and return undefined if found.
 * @returns injectMutation hook
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
    options?: Omit<CreateMutationOptions<Result, TError, TArgs>, 'mutationFn'> & ExtraMutationOptions,
    fetch?: FetchFn,
    checkReadBack?: C
) {
    const queryClient = inject(QueryClient);
    const mutationFn = (data: unknown) => {
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
    const invalidateQueries = options?.invalidateQueries !== false;
    const optimisticUpdate = !!options?.optimisticUpdate;

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
                (queryKey, data) => {
                    // update query cache
                    queryClient.setQueryData<unknown>(queryKey, data);
                    // cancel on-flight queries to avoid redundant cache updates,
                    // the settlement of the current mutation will trigger a new revalidation
                    queryClient.cancelQueries({ queryKey }, { revert: false, silent: true });
                },
                invalidateQueries ? (predicate) => queryClient.invalidateQueries({ predicate }) : undefined,
                logging
            );
        }
    }

    return injectMutation(() => finalOptions);
}
