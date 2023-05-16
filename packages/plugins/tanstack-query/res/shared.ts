import superjson from 'superjson';

/**
 * The default query endpoint.
 */
export const DEFAULT_QUERY_ENDPOINT = '/api/model';

/**
 * Prefix for react-query keys.
 */
export const QUERY_KEY_PREFIX = 'zenstack:';

/**
 * Context type for configuring the hooks.
 */
export type RequestHandlerContext = {
    endpoint: string;
};

/**
 * Builds a request URL with optional args.
 */
export function makeUrl(url: string, args: unknown) {
    return args ? url + `?q=${encodeURIComponent(marshal(args))}` : url;
}

async function fetcher<R>(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
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

export function marshal(value: unknown) {
    return superjson.stringify(value);
}

export function unmarshal(value: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return superjson.parse<any>(value);
}
