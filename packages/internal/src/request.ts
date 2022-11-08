import Decimal from 'decimal.js';
import useSWR, { useSWRConfig } from 'swr';
import type {
    MutatorCallback,
    MutatorOptions,
    SWRResponse,
} from 'swr/dist/types';

type BufferShape = { type: 'Buffer'; data: number[] };
function isBuffer(value: unknown): value is BufferShape {
    return (
        !!value &&
        (value as BufferShape).type === 'Buffer' &&
        Array.isArray((value as BufferShape).data)
    );
}

type BigIntShape = { type: 'BigInt'; data: string };
function isBigInt(value: unknown): value is BigIntShape {
    return (
        !!value &&
        (value as BigIntShape).type === 'BigInt' &&
        typeof (value as BigIntShape).data === 'string'
    );
}

type DateShape = { type: 'Date'; data: string };
function isDate(value: unknown): value is BigIntShape {
    return (
        !!value &&
        (value as DateShape).type === 'Date' &&
        typeof (value as DateShape).data === 'string'
    );
}

type DecmalShape = { type: 'Decimal'; data: string };
function isDecimal(value: unknown): value is DecmalShape {
    return (
        !!value &&
        (value as DecmalShape).type === 'Decimal' &&
        typeof (value as DateShape).data === 'string'
    );
}

const dataReviver = (key: string, value: unknown) => {
    // Buffer
    if (isBuffer(value)) {
        return Buffer.from(value.data);
    }

    // BigInt
    if (isBigInt(value)) {
        return BigInt(value.data);
    }

    // Date
    if (isDate(value)) {
        return new Date(value.data);
    }

    // Decimal
    if (isDecimal(value)) {
        return new Decimal(value.data);
    }

    return value;
};

const fetcher = async (url: string, options?: RequestInit) => {
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
    console.log;
    try {
        return JSON.parse(textResult, dataReviver);
    } catch (err) {
        console.error(`Unable to deserialize data:`, textResult);
        throw err;
    }
};

function makeUrl(url: string, args: unknown) {
    return args ? url + `?q=${encodeURIComponent(JSON.stringify(args))}` : url;
}

/**
 * Makes a GET request with SWR.
 *
 * @param url The request URL.
 * @param args The request args object, which will be JSON-stringified and appended as "?q=" parameter
 * @returns SWR response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function get<Data, Error = any>(
    url: string | null,
    args?: unknown
): SWRResponse<Data, Error> {
    return useSWR<Data, Error>(url && makeUrl(url, args), fetcher);
}

export async function post<Data, Result>(
    url: string,
    data: Data,
    mutate: Mutator
): Promise<Result> {
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
): Promise<Result> {
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

export async function del<Result>(
    url: string,
    args: unknown,
    mutate: Mutator
): Promise<Result> {
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
    data?: unknown | Promise<unknown> | MutatorCallback,
    opts?: boolean | MutatorOptions
) => Promise<unknown[]>;

export function getMutate(): Mutator {
    // https://swr.vercel.app/docs/advanced/cache#mutate-multiple-keys-from-regex
    const { cache, mutate } = useSWRConfig();
    return (
        key: string,
        prefix: boolean,
        data?: unknown | Promise<unknown> | MutatorCallback,
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
        const mutations = keys.map((key) => mutate(key, data, opts));
        return Promise.all(mutations);
    };
}
