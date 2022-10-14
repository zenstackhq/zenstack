import useSWR, { useSWRConfig } from 'swr';
import type { MutatorCallback, MutatorOptions } from 'swr/dist/types';

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
    return args ? url + `?q=${encodeURIComponent(JSON.stringify(args))}` : url;
}

export function get<Data, Error = any>(url: string | null, args?: unknown) {
    return useSWR<Data, Error>(url && makeUrl(url, args), fetcher);
}

export async function post<Data, Result>(
    url: string,
    data: Data,
    mutate: Mutator
) {
    const r: Result = await fetcher(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    mutate(url, true);
    return r;
}

export async function put<Data, Result>(
    url: string,
    data: Data,
    mutate: Mutator
) {
    const r: Result = await fetcher(url, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    mutate(url, true);
    return r;
}

export async function del<Result>(url: string, args: unknown, mutate: Mutator) {
    const reqUrl = makeUrl(url, args);
    const r: Result = await fetcher(reqUrl, {
        method: 'DELETE',
    });
    const path = url.split('/');
    path.pop();
    mutate(path.join('/'), true);
    return r;
}

type Mutator = (
    key: string,
    prefix: boolean,
    data?: any | Promise<any> | MutatorCallback,
    opts?: boolean | MutatorOptions
) => Promise<any[]>;

export function getMutate(): Mutator {
    // https://swr.vercel.app/docs/advanced/cache#mutate-multiple-keys-from-regex
    const { cache, mutate } = useSWRConfig();
    return (
        key: string,
        prefix: boolean,
        data?: any | Promise<any> | MutatorCallback,
        opts?: boolean | MutatorOptions
    ) => {
        if (!prefix) {
            return mutate(key, data, opts);
        }

        if (!(cache instanceof Map)) {
            throw new Error(
                'mutate requires the cache provider to be a Map instance'
            );
        }

        const keys = Array.from(cache.keys()).filter(
            (k) => typeof k === 'string' && k.startsWith(key)
        ) as string[];
        console.log('Mutating keys:', JSON.stringify(keys));
        const mutations = keys.map((key) => mutate(key, data, opts));
        return Promise.all(mutations);
    };
}
