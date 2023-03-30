import { marshal, unmarshal } from '../serialization-utils';

export function makeUrl(url: string, args: unknown) {
    return args ? url + `?q=${encodeURIComponent(marshal(args))}` : url;
}

export async function fetcher<R>(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const error: Error & { info?: unknown; status?: number } = new Error(
            'An error occurred while fetching the data.'
        );
        error.info = await res.json();
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
