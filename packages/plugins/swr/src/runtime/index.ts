/* eslint-disable @typescript-eslint/no-explicit-any */
import { deserialize, serialize } from '@zenstackhq/runtime/browser';
import {
    applyMutation,
    getMutatedModels,
    getReadModels,
    type ModelMeta,
    type PrismaWriteActionType,
} from '@zenstackhq/runtime/cross';
import { lowerCaseFirst } from 'lower-case-first';
import { createContext, useContext } from 'react';
import type { Cache, Fetcher, SWRConfiguration, SWRResponse } from 'swr';
import useSWR, { useSWRConfig } from 'swr';
import { ScopedMutator } from 'swr/_internal';
import useSWRInfinite, {
    unstable_serialize,
    type SWRInfiniteConfiguration,
    type SWRInfiniteFetcher,
    type SWRInfiniteResponse,
} from 'swr/infinite';
import useSWRMutation, { type SWRMutationConfiguration } from 'swr/mutation';
export * from './prisma-types';

/**
 * Function signature for `fetch`.
 */
export type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

/**
 * Context type for configuring react hooks.
 */
export type RequestHandlerContext = {
    /**
     * The endpoint to use for the queries.
     */
    endpoint?: string;

    /**
     * A custom fetch function for sending the HTTP requests.
     */
    fetch?: FetchFn;

    /**
     * If logging is enabled.
     */
    logging?: boolean;
};

const DEFAULT_QUERY_ENDPOINT = '/api/model';

/**
 * Context for configuring react hooks.
 */
export const RequestHandlerContext = createContext<RequestHandlerContext>({
    endpoint: DEFAULT_QUERY_ENDPOINT,
    fetch: undefined,
});

/**
 * Context provider.
 */
export const Provider = RequestHandlerContext.Provider;

/**
 * Hooks context.
 */
export function useHooksContext() {
    const { endpoint, ...rest } = useContext(RequestHandlerContext);
    return { endpoint: endpoint ?? DEFAULT_QUERY_ENDPOINT, ...rest };
}

/**
 * Regular query options.
 */
export type QueryOptions<Result, Error = unknown> = {
    /**
     * Disable data fetching
     */
    disabled?: boolean;

    /**
     * Whether to enable automatic optimistic update. Defaults to `true`.
     */
    optimisticUpdate?: boolean;
} & Omit<SWRConfiguration<Result, Error, Fetcher<Result>>, 'fetcher'>;

/**
 * Infinite query options.
 */
export type InfiniteQueryOptions<Result, Error = unknown> = {
    /**
     * Disable data fetching
     */
    disabled?: boolean;
} & Omit<SWRInfiniteConfiguration<Result, Error, SWRInfiniteFetcher<Result>>, 'fetcher'>;

const QUERY_KEY_PREFIX = 'zenstack:query';
const MUTATION_KEY_PREFIX = 'zenstack:mutation';

type QueryKey = {
    prefix: typeof QUERY_KEY_PREFIX;
    model: string;
    operation: string;
    args?: unknown;
    infinite?: boolean;
    optimisticUpdate?: boolean;
};

/**
 * Result of optimistic data provider.
 */
export type OptimisticDataProviderResult = {
    /**
     * Kind of the result.
     *   - Update: use the `data` field to update the query cache.
     *   - Skip: skip the optimistic update for this query.
     *   - ProceedDefault: proceed with the default optimistic update.
     */
    kind: 'Update' | 'Skip' | 'ProceedDefault';

    /**
     * Data to update the query cache. Only applicable if `kind` is 'Update'.
     *
     * If the data is an object with fields updated, it should have a `$optimistic`
     * field set to `true`. If it's an array and an element object is created or updated,
     * the element should have a `$optimistic` field set to `true`.
     */
    data?: any;
};

/**
 * Optimistic data provider.
 *
 * @param args Arguments.
 * @param args.queryModel The model of the query.
 * @param args.queryOperation The operation of the query, `findMany`, `count`, etc.
 * @param args.queryArgs The arguments of the query.
 * @param args.currentData The current cache data for the query.
 * @param args.mutationArgs The arguments of the mutation.
 */
export type OptimisticDataProvider = (args: {
    queryModel: string;
    queryOperation: string;
    queryArgs: any;
    currentData: any;
    mutationArgs: any;
}) => OptimisticDataProviderResult | Promise<OptimisticDataProviderResult>;

/**
 * Mutation options.
 */
export type MutationOptions<Result, Error, Args> = {
    /**
     * Whether to automatically optimistic-update queries potentially impacted. Defaults to `false`.
     */
    optimisticUpdate?: boolean;

    /**
     * A callback for computing optimistic update data for each query cache entry.
     */
    optimisticDataProvider?: OptimisticDataProvider;
} & Omit<SWRMutationConfiguration<Result, Error, string, Args>, 'fetcher'>;

/**
 * Computes query key for the given model, operation, query args, and options.
 */
export function getQueryKey(
    model: string,
    operation: string,
    args?: unknown,
    infinite?: boolean,
    optimisticUpdate?: boolean
) {
    return JSON.stringify({
        prefix: QUERY_KEY_PREFIX,
        model,
        operation,
        args,
        infinite: infinite === true,
        optimisticUpdate: optimisticUpdate !== false,
    });
}

function getMutationKey(model: string, operation: string) {
    // use a random key since we don't have 1:1 mapping between mutation and query
    // https://github.com/vercel/swr/discussions/2461#discussioncomment-5281784
    return JSON.stringify({ prefix: MUTATION_KEY_PREFIX, model, operation, r: Date.now() });
}

function parseQueryKey(key: unknown): QueryKey | undefined {
    let keyValue: any = key;
    if (typeof key === 'string') {
        try {
            keyValue = JSON.parse(key);
        } catch {
            return undefined;
        }
    }
    return keyValue?.prefix === QUERY_KEY_PREFIX ? (keyValue as QueryKey) : undefined;
}

/**
 * Makes a model query with SWR.
 *
 * @param model Model name
 * @param operation Prisma operation (e.g, `findMany`)
 * @param args The request args object, which will be superjson-stringified and appended as "?q=" parameter
 * @param options Query options
 * @returns SWR response
 */
export function useModelQuery<Result, Error = unknown>(
    model: string,
    operation: string,
    args?: unknown,
    options?: QueryOptions<Result, Error>
): SWRResponse<Result, Error> {
    const { endpoint, fetch } = useHooksContext();
    const key = options?.disabled
        ? null
        : getQueryKey(model, operation, args, false, options?.optimisticUpdate !== false);
    const url = makeUrl(`${endpoint}/${lowerCaseFirst(model)}/${operation}`, args);
    return useSWR<Result, Error>(key, () => fetcher<Result, false>(url, undefined, fetch, false), options);
}

/**
 * Function for computing the query args for fetching a page during an infinite query.
 */
export type GetNextArgs<Args, Result> = (pageIndex: number, previousPageData: Result | null) => Args | null;

/**
 * Makes an infinite GET request with SWR.
 *
 * @param model Model name
 * @param operation Prisma operation (e.g, `findMany`)
 * @param getNextArgs Function for computing the query args for a page
 * @param options Query options
 * @returns SWR infinite query response
 */
export function useInfiniteModelQuery<Args, Result, Error = unknown>(
    model: string,
    operation: string,
    getNextArgs: GetNextArgs<Args, any>,
    options?: InfiniteQueryOptions<Result, Error>
): SWRInfiniteResponse<Result, Error> {
    const { endpoint, fetch } = useHooksContext();

    const getKey = (pageIndex: number, previousPageData: Result | null) => {
        if (options?.disabled) {
            return null;
        }
        const nextArgs = getNextArgs(pageIndex, previousPageData);
        return nextArgs !== null // null means reached the end
            ? getQueryKey(model, operation, nextArgs, true, false)
            : null;
    };

    return useSWRInfinite<Result, Error>(
        getKey,
        (key: unknown) => {
            const parsedKey = parseQueryKey(key);
            if (parsedKey) {
                const { model, operation, args } = parsedKey;
                const url = makeUrl(`${endpoint}/${lowerCaseFirst(model)}/${operation}`, args);
                return fetcher<Result, false>(url, undefined, fetch, false);
            } else {
                throw new Error('Invalid query key: ' + key);
            }
        },
        options
    );
}

export function useModelMutation<Args, Result, CheckReadBack extends boolean = boolean>(
    model: string,
    method: 'POST' | 'PUT' | 'DELETE',
    operation: string,
    modelMeta: ModelMeta,
    options?: MutationOptions<CheckReadBack extends true ? Result | undefined : Result, unknown, Args>,
    checkReadBack?: CheckReadBack
) {
    const { endpoint, fetch, logging } = useHooksContext();
    const invalidate = options?.revalidate !== false ? useInvalidation(model, modelMeta) : undefined;
    const { cache, mutate } = useSWRConfig();

    return useSWRMutation(
        getMutationKey(model, operation),
        (_key, { arg }: { arg: any }) => {
            if (options?.optimisticUpdate) {
                optimisticUpdate(model, operation, arg, options, modelMeta, cache, mutate, logging);
            }
            const url = `${endpoint}/${lowerCaseFirst(model)}/${operation}`;
            return mutationRequest(method, url, arg, invalidate, fetch, checkReadBack);
        },
        options
    );
}

/**
 * Makes a mutation request.
 *
 * @param url The request URL
 * @param data The request data
 * @param invalidate Function for invalidating a query
 */
export async function mutationRequest<Result, C extends boolean = boolean>(
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    data: unknown,
    invalidate?: Invalidator,
    fetch?: FetchFn,
    checkReadBack?: C
): Promise<C extends true ? Result | undefined : Result> {
    const reqUrl = method === 'DELETE' ? makeUrl(url, data) : url;
    const r = await fetcher<Result, C>(
        reqUrl,
        {
            method,
            headers: {
                'content-type': 'application/json',
            },
            body: data ? marshal(data) : undefined,
        },
        fetch,
        checkReadBack
    );

    if (invalidate) {
        await invalidate(getOperationFromUrl(url), data);
    }
    return r;
}

// function for invalidating queries related to mutation represented by its operation and args
type Invalidator = (operation: string, args?: unknown) => ReturnType<ScopedMutator>;

export function useInvalidation(model: string, modelMeta: ModelMeta): Invalidator {
    // https://swr.vercel.app/docs/advanced/cache#mutate-multiple-keys-from-regex
    const { logging } = useHooksContext();
    const { cache, mutate } = useSWRConfig();
    return async (operation: string, args: unknown) => {
        if (!(cache instanceof Map)) {
            throw new Error('mutate requires the cache provider to be a Map instance');
        }

        const mutatedModels = await getMutatedModels(model, operation as PrismaWriteActionType, args, modelMeta);

        const keys = Array.from(cache.keys()).filter((key: unknown) => {
            const parsedKey = parseQueryKey(key);
            if (!parsedKey) {
                return false;
            }
            const modelsRead = getReadModels(parsedKey.model, modelMeta, parsedKey.args);
            return modelsRead.some((m) => mutatedModels.includes(m));
        });

        if (logging) {
            keys.forEach((key) => {
                console.log(`Invalidating query ${key} due to mutation "${model}.${operation}"`);
            });
        }

        const mutations = keys.map((key) => {
            const parsedKey = parseQueryKey(key);
            // FIX: special handling for infinite query keys, but still not working
            // https://github.com/vercel/swr/discussions/2843
            return mutate(parsedKey?.infinite ? unstable_serialize(() => key) : key);
        });
        return Promise.all(mutations);
    };
}

/**
 * Makes fetch request for queries and mutations.
 */
export async function fetcher<R, C extends boolean>(
    url: string,
    options?: RequestInit,
    customFetch?: FetchFn,
    checkReadBack?: C
): Promise<C extends true ? R | undefined : R> {
    // Note: 'cross-fetch' is supposed to handle fetch compatibility
    // but it doesn't work for cloudflare workers
    const _fetch =
        customFetch ??
        // check if fetch is available globally
        (typeof fetch === 'function'
            ? fetch
            : // fallback to 'cross-fetch' if otherwise
              (await import('cross-fetch')).default);

    const res = await _fetch(url, options);
    if (!res.ok) {
        const errData = unmarshal(await res.text());
        if (
            checkReadBack !== false &&
            errData.error?.prisma &&
            errData.error?.code === 'P2004' &&
            errData.error?.reason === 'RESULT_NOT_READABLE'
        ) {
            // policy doesn't allow mutation result to be read back, just return undefined
            return undefined as any;
        }
        const error: Error & { info?: unknown; status?: number } = new Error(
            'An error occurred while fetching the data.'
        );
        error.info = errData.error;
        error.status = res.status;
        throw error;
    }

    const textResult = await res.text();
    try {
        return unmarshal(textResult).data as R;
    } catch (err) {
        console.error(`Unable to deserialize data:`, textResult);
        throw err;
    }
}

function marshal(value: unknown) {
    const { data, meta } = serialize(value);
    if (meta) {
        return JSON.stringify({ ...(data as any), meta: { serialization: meta } });
    } else {
        return JSON.stringify(data);
    }
}

function unmarshal(value: string) {
    const parsed = JSON.parse(value);
    if (parsed.data && parsed.meta?.serialization) {
        const deserializedData = deserialize(parsed.data, parsed.meta.serialization);
        return { ...parsed, data: deserializedData };
    } else {
        return parsed;
    }
}

function makeUrl(url: string, args: unknown) {
    if (!args) {
        return url;
    }

    const { data, meta } = serialize(args);
    let result = `${url}?q=${encodeURIComponent(JSON.stringify(data))}`;
    if (meta) {
        result += `&meta=${encodeURIComponent(JSON.stringify({ serialization: meta }))}`;
    }
    return result;
}

function getOperationFromUrl(url: string) {
    const parts = url.split('/');
    const r = parts.pop();
    if (!r) {
        throw new Error(`Invalid URL: ${url}`);
    } else {
        return r;
    }
}

async function optimisticUpdate(
    mutationModel: string,
    mutationOp: string,
    mutationArgs: any,
    options: MutationOptions<any, any, any> | undefined,
    modelMeta: ModelMeta,
    cache: Cache,
    mutator: ScopedMutator,
    logging = false
) {
    const optimisticPromises: Array<Promise<void>> = [];
    for (const key of cache.keys()) {
        const parsedKey = parseQueryKey(key);
        if (!parsedKey) {
            continue;
        }

        if (!parsedKey.optimisticUpdate) {
            if (logging) {
                console.log(`Skipping optimistic update for ${key} due to opt-out`);
            }
            continue;
        }

        const cacheValue = cache.get(key);
        if (cacheValue?.error) {
            if (logging) {
                console.warn(`Skipping optimistic update for ${key} due to error:`, cacheValue.error);
            }
            continue;
        }

        if (options?.optimisticDataProvider) {
            const providerResult = await options.optimisticDataProvider({
                queryModel: parsedKey.model,
                queryOperation: parsedKey.operation,
                queryArgs: parsedKey.args,
                currentData: cacheValue?.data,
                mutationArgs,
            });

            if (providerResult?.kind === 'Skip') {
                if (logging) {
                    console.log(`Skipping optimistic update for ${key} due to custom provider`);
                }
                continue;
            } else if (providerResult?.kind === 'Update') {
                if (logging) {
                    console.log(`Optimistically updating query ${JSON.stringify(key)} due to provider`);
                }
                optimisticPromises.push(mutator(key, providerResult.data, { revalidate: false }));
                continue;
            }
        }

        if (!cacheValue) {
            continue;
        }

        const mutatedData = await applyMutation(
            parsedKey.model,
            parsedKey.operation,
            cacheValue.data,
            mutationModel,
            mutationOp as PrismaWriteActionType,
            mutationArgs,
            modelMeta,
            logging
        );

        if (mutatedData !== undefined) {
            // mutation applicable to this query, update cache
            if (logging) {
                console.log(
                    `Optimistically updating query ${JSON.stringify(
                        key
                    )} due to mutation "${mutationModel}.${mutationOp}"`
                );
            }
            optimisticPromises.push(
                mutator(key, mutatedData, {
                    // don't trigger revalidation here since we will do it
                    // when the remote mutation succeeds
                    revalidate: false,
                })
            );
        }
    }

    return Promise.all(optimisticPromises);
}
