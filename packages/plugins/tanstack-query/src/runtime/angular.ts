/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    injectQuery,
    injectInfiniteQuery,
    injectMutation,
    QueryClient,
    type CreateInfiniteQueryOptions,
    type CreateMutationOptions as TanStackCreateMutationOptions,
    type CreateQueryOptions,
} from '@tanstack/angular-query-experimental';
import type { ModelMeta } from '@zenstackhq/runtime/cross';
import { inject, InjectionToken } from '@angular/core';
import {
    DEFAULT_QUERY_ENDPOINT,
    fetcher,
    getQueryKey,
    makeUrl,
    marshal,
    setupInvalidation,
    setupOptimisticUpdate,
    type APIContext,
    type ExtraMutationOptions,
    type ExtraQueryOptions,
    type FetchFn,
} from './common';

/**
 * Injection token for configuring Angular TanStack Query hooks.
 */
export const AngularQueryContextToken = new InjectionToken<APIContext>('AngularQueryContext', {
    providedIn: 'root',
    factory: () => ({
        endpoint: DEFAULT_QUERY_ENDPOINT,
        fetch: undefined,
        logging: false,
    }),
});

/**
 * Provide context for the generated TanStack Query hooks.
 */
export function provideHooksContext(context: APIContext) {
    return {
        provide: AngularQueryContextToken,
        useValue: context,
    };
}

/**
 * Hooks context.
 */
export function getHooksContext() {
    const context = inject(AngularQueryContextToken);
    const { endpoint, ...rest } = context;
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
}

/**
 * Creates an Angular TanStack Query query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The request args object, URL-encoded and appended as "?q=" parameter
 * @param options The TanStack Query options object
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

    const query = injectQuery<TQueryFnData, TError, TData>(() => ({
        queryKey,
        queryFn: ({ signal }: { signal?: AbortSignal }) =>
            fetcher<TQueryFnData, false>(reqUrl, { signal }, fetch, false),
        ...options,
    }));

    return {
        queryKey,
        ...query,
    };
}

/**
 * Creates an Angular TanStack Query infinite query.
 *
 * @param model The name of the model under query.
 * @param url The request URL.
 * @param args The initial request args object, URL-encoded and appended as "?q=" parameter
 * @param options The TanStack Query infinite query options object
 * @param fetch The fetch function to use for sending the HTTP request
 * @returns injectInfiniteQuery hook
 */
export function useInfiniteModelQuery<TQueryFnData, TData, TError>(
    model: string,
    url: string,
    args: unknown,
    options: Omit<CreateInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey' | 'initialPageParam'>,
    fetch?: FetchFn
): any {
    const queryKey = getQueryKey(model, url, args, { infinite: true, optimisticUpdate: false });

    const query = injectInfiniteQuery<TQueryFnData, TError, TData>(() => ({
        queryKey,
        queryFn: ({ pageParam, signal }: { pageParam?: any; signal?: AbortSignal }) => {
            return fetcher<TQueryFnData, false>(makeUrl(url, pageParam ?? args), { signal }, fetch, false);
        },
        initialPageParam: args,
        ...options,
    }));

    return {
        queryKey,
        ...query,
    };
}

/**
 * Creates an Angular TanStack Query mutation.
 *
 * @param model The name of the model under mutation.
 * @param method The HTTP method.
 * @param url The request URL.
 * @param modelMeta The model metadata.
 * @param options The TanStack Query options.
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
    options?: Omit<TanStackCreateMutationOptions<Result, TError, TArgs>, 'mutationFn'> & ExtraMutationOptions,
    fetch?: FetchFn,
    checkReadBack?: C
): any {
    const queryClient = inject(QueryClient);
    const context = inject(AngularQueryContextToken);

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
    const invalidateQueries = options?.invalidateQueries !== false;
    const optimisticUpdate = !!options?.optimisticUpdate;

    if (operation) {
        const { logging } = context;
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

    return injectMutation(() => finalOptions);
}
