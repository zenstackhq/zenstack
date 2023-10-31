/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { deserialize, serialize } from '@zenstackhq/runtime/browser';
import { getMutatedModels, getReadModels, type ModelMeta, type PrismaWriteActionType } from '@zenstackhq/runtime/cross';
import * as crossFetch from 'cross-fetch';

/**
 * The default query endpoint.
 */
export const DEFAULT_QUERY_ENDPOINT = '/api/model';

/**
 * Prefix for react-query keys.
 */
export const QUERY_KEY_PREFIX = 'zenstack';

/**
 * Function signature for `fetch`.
 */
export type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

/**
 * Context type for configuring the hooks.
 */
export type APIContext = {
    /**
     * The endpoint to use for the queries.
     */
    endpoint?: string;

    /**
     * A custom fetch function for sending the HTTP requests.
     */
    fetch?: FetchFn;

    /**
     * If logging is enabled.
     */
    logging?: boolean;
};

export async function fetcher<R, C extends boolean>(
    url: string,
    options?: RequestInit,
    fetch?: FetchFn,
    checkReadBack?: C
): Promise<C extends true ? R | undefined : R> {
    const _fetch = fetch ?? crossFetch.fetch;
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
        return unmarshal(textResult).data as R;
    } catch (err) {
        console.error(`Unable to deserialize data:`, textResult);
        throw err;
    }
}

type QueryKey = [string /* prefix */, string /* model */, string /* operation */, unknown /* args */];

/**
 * Computes query key for the given model, operation and query args.
 * @param model Model name.
 * @param urlOrOperation Prisma operation (e.g, `findMany`) or request URL. If it's a URL, the last path segment will be used as the operation name.
 * @param args Prisma query arguments.
 * @returns Query key
 */
export function getQueryKey(model: string, urlOrOperation: string, args: unknown): QueryKey {
    if (!urlOrOperation) {
        throw new Error('Invalid urlOrOperation');
    }
    const operation = urlOrOperation.split('/').pop();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return [QUERY_KEY_PREFIX, model, operation!, args];
}

export function marshal(value: unknown) {
    const { data, meta } = serialize(value);
    if (meta) {
        return JSON.stringify({ ...(data as any), meta: { serialization: meta } });
    } else {
        return JSON.stringify(data);
    }
}

export function unmarshal(value: string) {
    const parsed = JSON.parse(value);
    if (parsed.data && parsed.meta?.serialization) {
        const deserializedData = deserialize(parsed.data, parsed.meta.serialization);
        return { ...parsed, data: deserializedData };
    } else {
        return parsed;
    }
}

export function makeUrl(url: string, args: unknown) {
    if (!args) {
        return url;
    }

    const { data, meta } = serialize(args);
    let result = `${url}?q=${encodeURIComponent(JSON.stringify(data))}`;
    if (meta) {
        result += `&meta=${encodeURIComponent(JSON.stringify({ serialization: meta }))}`;
    }
    return result;
}

type InvalidationPredicate = ({ queryKey }: { queryKey: readonly unknown[] }) => boolean;

// sets up invalidation hook for a mutation
export function setupInvalidation(
    model: string,
    operation: string,
    modelMeta: ModelMeta,
    options: { onSuccess?: (...args: any[]) => any },
    invalidate: (predicate: InvalidationPredicate) => Promise<void>,
    logging = false
) {
    const origOnSuccess = options?.onSuccess;
    options.onSuccess = async (...args: unknown[]) => {
        const [_, variables] = args;
        const predicate = await getInvalidationPredicate(
            model,
            operation as PrismaWriteActionType,
            variables,
            modelMeta,
            logging
        );
        await invalidate(predicate);
        return origOnSuccess?.(...args);
    };
}

// gets a predicate for evaluating whether a query should be invalidated
async function getInvalidationPredicate(
    model: string,
    operation: PrismaWriteActionType,
    mutationArgs: any,
    modelMeta: ModelMeta,
    logging = false
) {
    const mutatedModels = await getMutatedModels(model, operation, mutationArgs, modelMeta);

    return ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const [_model, queryModel, queryOp, args] = queryKey as QueryKey;

        if (mutatedModels.includes(queryModel)) {
            // direct match
            if (logging) {
                console.log(`Invalidating query [${queryKey}] due to mutation "${model}.${operation}"`);
            }
            return true;
        }

        if (args) {
            // traverse query args to find nested reads that match the model under mutation
            if (findNestedRead(queryModel, mutatedModels, modelMeta, args)) {
                if (logging) {
                    console.log(`Invalidating query [${queryKey}] due to mutation "${model}.${operation}"`);
                }
                return true;
            }
        }

        return false;
    };
}

// find nested reads that match the given models
function findNestedRead(visitingModel: string, targetModels: string[], modelMeta: ModelMeta, args: any) {
    const modelsRead = getReadModels(visitingModel, modelMeta, args);
    return targetModels.some((m) => modelsRead.includes(m));
}
