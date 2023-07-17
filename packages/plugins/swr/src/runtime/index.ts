/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext } from 'react';
import type { MutatorCallback, MutatorOptions, SWRResponse } from 'swr';
import useSWR, { useSWRConfig } from 'swr';
import SuperJSON from 'superjson';
import { deserialize, serialize } from '@zenstackhq/runtime/browser';

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
 * Client request options
 */
export type RequestOptions<T> = {
    // disable data fetching
    disabled?: boolean;
    initialData?: T;
};

/**
 * Makes a GET request with SWR.
 *
 * @param url The request URL.
 * @param args The request args object, which will be superjson-stringified and appended as "?q=" parameter
 * @returns SWR response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function get<Result, Error = any>(
    url: string | null,
    args?: unknown,
    options?: RequestOptions<Result>,
    fetch?: FetchFn
): SWRResponse<Result, Error> {
    const reqUrl = options?.disabled ? null : url ? makeUrl(url, args) : null;
    return useSWR<Result, Error>(reqUrl, (url) => fetcher<Result, false>(url, undefined, fetch, false), {
        fallbackData: options?.initialData,
    });
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
    mutate();
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
    mutate();
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
    mutate();
    return r;
}

type Mutator = (
    data?: unknown | Promise<unknown> | MutatorCallback,
    opts?: boolean | MutatorOptions
) => Promise<unknown[]>;

export function getMutate(prefixes: string[]): Mutator {
    // https://swr.vercel.app/docs/advanced/cache#mutate-multiple-keys-from-regex
    const { cache, mutate } = useSWRConfig();
    return (data?: unknown | Promise<unknown> | MutatorCallback, opts?: boolean | MutatorOptions) => {
        if (!(cache instanceof Map)) {
            throw new Error('mutate requires the cache provider to be a Map instance');
        }

        const keys = Array.from(cache.keys()).filter(
            (k) => typeof k === 'string' && prefixes.some((prefix) => k.startsWith(prefix))
        ) as string[];
        const mutations = keys.map((key) => mutate(key, data, opts));
        return Promise.all(mutations);
    };
}

export async function fetcher<R, C extends boolean>(
    url: string,
    options?: RequestInit,
    fetch?: FetchFn,
    checkReadBack?: C
): Promise<C extends true ? R | undefined : R> {
    const _fetch = fetch ?? window.fetch;
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

    const { json, meta } = SuperJSON.serialize(args);
    let result = `${url}?q=${encodeURIComponent(JSON.stringify(json))}`;
    if (meta) {
        result += `&meta=${encodeURIComponent(JSON.stringify({ serialization: meta }))}`;
    }
    return result;
}
