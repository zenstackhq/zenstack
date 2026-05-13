import { lowerCaseFirst } from '@zenstackhq/common-helpers';
import { AnyNull, AnyNullClass, DbNull, DbNullClass, JsonNull, JsonNullClass } from '@zenstackhq/orm/common-types';
import Decimal from 'decimal.js';
import SuperJSON from 'superjson';
import type { QueryError } from './types';

/**
 * Function signature for `fetch`.
 */
export type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

/**
 * A fetcher function that uses fetch API to make HTTP requests and automatically unmarshals
 * the response using superjson.
 */
export async function fetcher<R>(url: string, options?: RequestInit, customFetch?: FetchFn): Promise<R> {
    const _fetch = customFetch ?? fetch;
    const res = await _fetch(url, options);
    if (!res.ok) {
        const errData = unmarshal(await res.text());
        if (errData.error?.rejectedByPolicy && errData.error?.rejectReason === 'cannot-read-back') {
            // policy doesn't allow mutation result to be read back, just return undefined
            return undefined as any;
        }
        const error: QueryError = new Error('An error occurred while fetching the data.');
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

/**
 * Makes a URL for the given endpoint, model, operation, and args that matches the RPC-style server API.
 */
export function makeUrl(endpoint: string, model: string, operation: string, args?: unknown) {
    const baseUrl = `${endpoint}/${lowerCaseFirst(model)}/${operation}`;
    if (!args) {
        return baseUrl;
    }

    const { data, meta } = serialize(args);
    let result = `${baseUrl}?q=${encodeURIComponent(JSON.stringify(data))}`;
    if (meta) {
        result += `&meta=${encodeURIComponent(JSON.stringify({ serialization: meta }))}`;
    }
    return result;
}

SuperJSON.registerCustom<Decimal, string>(
    {
        isApplicable: (v): v is Decimal =>
            v instanceof Decimal ||
            // interop with decimal.js
            v?.toStringTag === '[object Decimal]',
        serialize: (v) => v.toJSON(),
        deserialize: (v) => new Decimal(v),
    },
    'Decimal',
);

SuperJSON.registerCustom<DbNullClass, string>(
    {
        isApplicable: (v): v is DbNullClass => v instanceof DbNullClass,
        serialize: () => 'DbNull',
        deserialize: () => DbNull,
    },
    'DbNull',
);

SuperJSON.registerCustom<JsonNullClass, string>(
    {
        isApplicable: (v): v is JsonNullClass => v instanceof JsonNullClass,
        serialize: () => 'JsonNull',
        deserialize: () => JsonNull,
    },
    'JsonNull',
);

SuperJSON.registerCustom<AnyNullClass, string>(
    {
        isApplicable: (v): v is AnyNullClass => v instanceof AnyNullClass,
        serialize: () => 'AnyNull',
        deserialize: () => AnyNull,
    },
    'AnyNull',
);

/**
 * Serialize the given value with superjson
 */
export function serialize(value: unknown): { data: unknown; meta: unknown } {
    const { json, meta } = SuperJSON.serialize(value);
    return { data: json, meta };
}

/**
 * Deserialize the given value with superjson using the given metadata
 */
export function deserialize(value: unknown, meta: any): unknown {
    return SuperJSON.deserialize({ json: value as any, meta });
}

/**
 * Marshal the given value to a string using superjson
 */
export function marshal(value: unknown) {
    const { data, meta } = serialize(value);
    if (meta) {
        return JSON.stringify({ ...(data as any), meta: { serialization: meta } });
    } else {
        return JSON.stringify(data);
    }
}

/**
 * Unmarshal the given string value using superjson, assuming the value is a JSON stringified
 * object containing the serialized data and serialization metadata.
 */
export function unmarshal(value: string) {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed?.data && parsed?.meta?.serialization) {
        const deserializedData = deserialize(parsed.data, parsed.meta.serialization);
        return { ...parsed, data: deserializedData };
    } else {
        return parsed;
    }
}
