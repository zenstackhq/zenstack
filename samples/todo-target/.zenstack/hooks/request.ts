import useSWR from 'swr';
import type { ScopedMutator } from 'swr/dist/types';

const fetcher = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options);
    if (!res.ok) {
        const error: Error & { info?: any; status?: number } = new Error(
            'An error occurred while fetching the data.'
        );
        // Attach extra info to the error object.
        error.info = await res.json();
        error.status = res.status;
        throw error;
    }
    return res.json();
};

export function swr<Data, Error = any>(url: string) {
    return useSWR<Data, Error>(url, fetcher);
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

export async function del<Result>(url: string, mutate: ScopedMutator<any>) {
    const r: Result = await fetcher(url, {
        method: 'DELETE',
    });
    const path = url.split('/');
    path.pop();
    mutate(path.join('/'));
    return r;
}
