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

async function fetcher<R>(url: string, options?: RequestInit, fetch?: FetchFn) {
    const _fetch = fetch ?? window.fetch;
    const res = await _fetch(url, options);
    if (!res.ok) {
        const error: Error & { info?: unknown; status?: number } = new Error(
            'An error occurred while fetching the data.'
        );
        error.info = unmarshal(await res.text());
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
