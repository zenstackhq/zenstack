/* eslint-disable */

import SuperJSON from 'superjson';

// Prisma's Bytes type is mapped to 'Buffer' type on the client side; install 'buffer' package to use it in browser.
declare var Buffer: any;

if (Buffer) {
    SuperJSON.registerCustom(
        {
            isApplicable: (v: any): v is any => Buffer.isBuffer(v),
            serialize: (v: any) => v.toString('base64'),
            deserialize: (v: any) => Buffer.from(v, 'base64'),
        },
        'Bytes'
    );
}

/**
 * The default query endpoint.
 */
export const DEFAULT_QUERY_ENDPOINT = '/api/model';

/**
 * Prefix for react-query keys.
 */
export const QUERY_KEY_PREFIX = 'zenstack:';

/**
 * Function signature for `fetch`.
 */
export type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

/**
 * Context type for configuring the hooks.
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

async function fetcher<R, C extends boolean>(
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
        return unmarshal(textResult) as R;
    } catch (err) {
        console.error(`Unable to deserialize data:`, textResult);
        throw err;
    }
}
