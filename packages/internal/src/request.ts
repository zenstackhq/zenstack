import useSWR, { useSWRConfig } from 'swr';
import type { ScopedMutator } from 'swr/dist/types';

const fetcher = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options);
    if (!res.ok) {
        const error: Error & { info?: any; status?: number } = new Error(
            'An error occurred while fetching the data.'
        );
        error.info = await res.json();
        error.status = res.status;
        throw error;
    }
    return res.json();
};

function makeUrl(url: string, args: unknown) {
    return args ? url + `q=${encodeURIComponent(JSON.stringify(args))}` : url;
}

export function get<Data, Error = any>(url: string, args?: unknown) {
    return useSWR<Data, Error>(makeUrl(url, args), fetcher);
}

export async function post<Data, Result>(
    url: string,
    data: Data,
    mutate: ScopedMutator<any>
) {
    const r: Result = await fetcher(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    mutate(url);
    return r;
}

export async function put<Data, Result>(
    url: string,
    data: Data,
    mutate: ScopedMutator<any>
) {
    const r: Result = await fetcher(url, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    mutate(url, r);
    return r;
}

export async function del<Result>(
    url: string,
    args: unknown,
    mutate: ScopedMutator<any>
) {
    const reqUrl = makeUrl(url, args);
    const r: Result = await fetcher(reqUrl, {
        method: 'DELETE',
    });
    const path = url.split('/');
    path.pop();
    mutate(path.join('/'));
    return r;
}

export function getMutate() {
    const { mutate } = useSWRConfig();
    return mutate;
}
