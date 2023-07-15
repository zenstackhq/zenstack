/* eslint-disable */

import { createContext } from 'react';
import type { MutatorCallback, MutatorOptions, SWRResponse } from 'swr';
import useSWR, { useSWRConfig } from 'swr';
import SuperJSON from 'superjson';

// Prisma's Decimal type is mapped to 'decimal.js' on the client side
try {
    const Decimal = require('decimal.js');
    SuperJSON.registerCustom(
        {
            isApplicable: (v): v is any => Decimal.isDecimal(v),
            serialize: (v) => v.toJSON(),
            deserialize: (v) => new Decimal(v),
        },
        'Decimal'
    );
} catch {}

// Prisma's Bytes type is mapped to 'Buffer' type on the client side; install 'buffer' package to use it in browser.
declare var Buffer: any;

if (Buffer) {
    SuperJSON.registerCustom(
        {
            isApplicable: (v): v is any => Buffer.isBuffer(v),
            serialize: (v) => v.toString('base64'),
            deserialize: (v) => Buffer.from(v, 'base64'),
        },
        'Bytes'
    );
}

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
    return useSWR<Result, Error>(reqUrl, (url) => fetcher(url, undefined, fetch), {
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
export async function post<Result>(url: string, data: unknown, mutate: Mutator, fetch?: FetchFn): Promise<Result> {
    const r: Result = await fetcher(
        url,
        {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: marshal(data),
        },
        fetch
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
export async function put<Result>(url: string, data: unknown, mutate: Mutator, fetch?: FetchFn): Promise<Result> {
    const r: Result = await fetcher(
        url,
        {
            method: 'PUT',
            headers: {
                'content-type': 'application/json',
            },
            body: marshal(data),
        },
        fetch
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
export async function del<Result>(url: string, args: unknown, mutate: Mutator, fetch?: FetchFn): Promise<Result> {
    const reqUrl = makeUrl(url, args);
    const r: Result = await fetcher(
        reqUrl,
        {
            method: 'DELETE',
        },
        fetch
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

export async function fetcher<R>(url: string, options?: RequestInit, fetch?: FetchFn) {
    const _fetch = fetch ?? window.fetch;
    const res = await _fetch(url, options);
    if (!res.ok) {
        const errData = unmarshal(await res.text());
        if (
            errData.error?.prisma &&
            errData.error?.code === 'P2004' &&
            errData.error?.reason === 'RESULT_NOT_READABLE'
        ) {
            // policy doesn't allow mutation result to be read back, just return undefined
            return undefined;
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
        return unmarshal(textResult) as R;
    } catch (err) {
        console.error(`Unable to deserialize data:`, textResult);
        throw err;
    }
}
