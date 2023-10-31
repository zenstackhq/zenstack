/* eslint-disable @typescript-eslint/no-explicit-any */
import { deserialize, serialize } from '@zenstackhq/runtime/browser';
import { getMutatedModels, getReadModels, type ModelMeta, type PrismaWriteActionType } from '@zenstackhq/runtime/cross';
import * as crossFetch from 'cross-fetch';
import { lowerCaseFirst } from 'lower-case-first';
import { createContext } from 'react';
import type { Fetcher, MutatorCallback, MutatorOptions, SWRConfiguration, SWRResponse } from 'swr';
import useSWR, { useSWRConfig } from 'swr';
import useSWRInfinite, { SWRInfiniteConfiguration, SWRInfiniteFetcher, SWRInfiniteResponse } from 'swr/infinite';
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
    endpoint: string;

    /**
     * A custom fetch function for sending the HTTP requests.
     */
    fetch?: FetchFn;

    /**
     * If logging is enabled.
     */
    logging?: boolean;
};

/**
 * Context for configuring react hooks.
 */
export const RequestHandlerContext = createContext<RequestHandlerContext>({
    endpoint: '/api/model',
    fetch: undefined,
});

/**
 * Context provider.
 */
export const Provider = RequestHandlerContext.Provider;

/**
 * Client request options for regular query.
 */
export type RequestOptions<Result, Error = any> = {
    /**
     * Disable data fetching
     */
    disabled?: boolean;

    /**
     * Equivalent to @see SWRConfiguration.fallbackData
     */
    initialData?: Result;
} & SWRConfiguration<Result, Error, Fetcher<Result>>;

/**
 * Client request options for infinite query.
 */
export type InfiniteRequestOptions<Result, Error = any> = {
    /**
     * Disable data fetching
     */
    disabled?: boolean;

    /**
     * Equivalent to @see SWRInfiniteConfiguration.fallbackData
     */
    initialData?: Result[];
} & SWRInfiniteConfiguration<Result, Error, SWRInfiniteFetcher<Result>>;

export const QUERY_KEY_PREFIX = 'zenstack';

type QueryKey = { prefix: typeof QUERY_KEY_PREFIX; model: string; operation: string; args: unknown };

export function getQueryKey(model: string, operation: string, args?: unknown) {
    return JSON.stringify({ prefix: QUERY_KEY_PREFIX, model, operation, args });
}

export function parseQueryKey(key: unknown) {
    if (typeof key !== 'string') {
        return undefined;
    }
    try {
        const parsed = JSON.parse(key);
        if (!parsed || parsed.prefix !== QUERY_KEY_PREFIX) {
            return undefined;
        }
        return parsed as QueryKey;
    } catch {
        return undefined;
    }
}

/**
 * Makes a GET request with SWR.
 *
 * @param url The request URL.
 * @param args The request args object, which will be superjson-stringified and appended as "?q=" parameter
 * @param options Query options
 * @param fetch Custom fetch function
 * @returns SWR response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useGet<Result, Error = any>(
    model: string,
    operation: string,
    endpoint: string,
    args?: unknown,
    options?: RequestOptions<Result, Error>,
    fetch?: FetchFn
): SWRResponse<Result, Error> {
    const key = options?.disabled ? null : getQueryKey(model, operation, args);
    const url = makeUrl(`${endpoint}/${lowerCaseFirst(model)}/${operation}`, args);
    return useSWR<Result, Error>(key, () => fetcher<Result, false>(url, undefined, fetch, false), {
        ...options,
        fallbackData: options?.initialData ?? options?.fallbackData,
    });
}

/**
 * Function for computing the query args for fetching a page during an infinite query.
 */
export type GetNextArgs<Args, Result> = (pageIndex: number, previousPageData: Result | null) => Args | null;

/**
 * Makes an infinite GET request with SWR.
 *
 * @param url The request URL.
 * @param getNextArgs Function for computing the query args for a page.
 * @param options Query options
 * @param fetch Custom fetch function
 * @returns SWR infinite query response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useInfiniteGet<Args, Result, Error = any>(
    model: string,
    operation: string,
    endpoint: string,
    getNextArgs: GetNextArgs<Args, any>,
    options?: InfiniteRequestOptions<Result, Error>,
    fetch?: FetchFn
): SWRInfiniteResponse<Result, Error> {
    const getKey = (pageIndex: number, previousPageData: Result | null) => {
        if (options?.disabled) {
            return null;
        }
        const nextArgs = getNextArgs(pageIndex, previousPageData);
        return nextArgs !== null // null means reached the end
            ? getQueryKey(model, operation, nextArgs)
            : null;
    };

    return useSWRInfinite<Result, Error>(
        getKey,
        (key) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const parsedKey = parseQueryKey(key)!;
            const url = makeUrl(
                `${endpoint}/${lowerCaseFirst(parsedKey.model)}/${parsedKey.operation}`,
                parsedKey.args
            );
            return fetcher<Result, false>(url, undefined, fetch, false);
        },
        {
            ...options,
            fallbackData: options?.initialData ?? options?.fallbackData,
        }
    );
}

/**
 * Makes a POST request.
 *
 * @param url The request URL.
 * @param data The request data.
 * @param mutate Mutator for invalidating cache.
 */
export async function post<Result, C extends boolean = boolean>(
    url: string,
    data: unknown,
    mutate: Mutator,
    fetch?: FetchFn,
    checkReadBack?: C
): Promise<C extends true ? Result | undefined : Result> {
    const r = await fetcher<Result, C>(
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
    );
    mutate(data);
    return r;
}

/**
 * Makes a PUT request.
 *
 * @param url The request URL.
 * @param data The request data.
 * @param mutate Mutator for invalidating cache.
 */
export async function put<Result, C extends boolean = boolean>(
    url: string,
    data: unknown,
    mutate: Mutator,
    fetch?: FetchFn,
    checkReadBack?: C
): Promise<C extends true ? Result | undefined : Result> {
    const r = await fetcher<Result, C>(
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
    );
    mutate(data);
    return r;
}

/**
 * Makes a DELETE request.
 *
 * @param url The request URL.
 * @param args The request args object, which will be superjson-stringified and appended as "?q=" parameter
 * @param mutate Mutator for invalidating cache.
 */
export async function del<Result, C extends boolean = boolean>(
    url: string,
    args: unknown,
    mutate: Mutator,
    fetch?: FetchFn,
    checkReadBack?: C
): Promise<C extends true ? Result | undefined : Result> {
    const reqUrl = makeUrl(url, args);
    const r = await fetcher<Result, C>(
        reqUrl,
        {
            method: 'DELETE',
        },
        fetch,
        checkReadBack
    );
    const path = url.split('/');
    path.pop();
    mutate(args);
    return r;
}

type Mutator = (
    data?: unknown | Promise<unknown> | MutatorCallback,
    opts?: boolean | MutatorOptions
) => Promise<unknown[]>;

export function useMutate(model: string, operation: string, modelMeta: ModelMeta, logging?: boolean): Mutator {
    // https://swr.vercel.app/docs/advanced/cache#mutate-multiple-keys-from-regex
    const { cache, mutate } = useSWRConfig();
    return async (args: unknown, opts?: boolean | MutatorOptions) => {
        if (!(cache instanceof Map)) {
            throw new Error('mutate requires the cache provider to be a Map instance');
        }

        const mutatedModels = await getMutatedModels(model, operation as PrismaWriteActionType, args, modelMeta);

        const keys = Array.from(cache.keys()).filter((key) => {
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

        const mutations = keys.map((key) => mutate(key, undefined, opts));
        return Promise.all(mutations);
    };
}

export async function fetcher<R, C extends boolean>(
    url: string,
    options?: RequestInit,
    fetch?: FetchFn,
    checkReadBack?: C
): Promise<C extends true ? R | undefined : R> {
    const _fetch = fetch ?? crossFetch.fetch;
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
