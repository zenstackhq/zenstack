/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { deserialize, serialize } from '@zenstackhq/runtime/browser';
import {
    applyMutation,
    getMutatedModels,
    getReadModels,
    type ModelMeta,
    type PrismaWriteActionType,
} from '@zenstackhq/runtime/cross';
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
 * Type for query and mutation errors.
 */
export type QueryError = Error & {
    /**
     * Additional error information.
     */
    info?: unknown;

    /**
     * HTTP status code.
     */
    status?: number;
};

/**
 * Result of optimistic data provider.
 */
export type OptimisticDataProviderResult = {
    /**
     * Kind of the result.
     *   - Update: use the `data` field to update the query cache.
     *   - Skip: skip the optimistic update for this query.
     *   - ProceedDefault: proceed with the default optimistic update.
     */
    kind: 'Update' | 'Skip' | 'ProceedDefault';

    /**
     * Data to update the query cache. Only applicable if `kind` is 'Update'.
     *
     * If the data is an object with fields updated, it should have a `$optimistic`
     * field set to `true`. If it's an array and an element object is created or updated,
     * the element should have a `$optimistic` field set to `true`.
     */
    data?: any;
};

/**
 * Optimistic data provider.
 *
 * @param args Arguments.
 * @param args.queryModel The model of the query.
 * @param args.queryOperation The operation of the query, `findMany`, `count`, etc.
 * @param args.queryArgs The arguments of the query.
 * @param args.currentData The current cache data for the query.
 * @param args.mutationArgs The arguments of the mutation.
 */
export type OptimisticDataProvider = (args: {
    queryModel: string;
    queryOperation: string;
    queryArgs: any;
    currentData: any;
    mutationArgs: any;
}) => OptimisticDataProviderResult | Promise<OptimisticDataProviderResult>;

/**
 * Extra mutation options.
 */
export type ExtraMutationOptions = {
    /**
     * Whether to automatically invalidate queries potentially affected by the mutation. Defaults to `true`.
     */
    invalidateQueries?: boolean;

    /**
     * Whether to optimistically update queries potentially affected by the mutation. Defaults to `false`.
     */
    optimisticUpdate?: boolean;

    /**
     * A callback for computing optimistic update data for each query cache entry.
     */
    optimisticDataProvider?: OptimisticDataProvider;
};

/**
 * Extra query options.
 */
export type ExtraQueryOptions = {
    /**
     * Whether to opt-in to optimistic updates for this query. Defaults to `true`.
     */
    optimisticUpdate?: boolean;
};

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

type QueryKey = [
    string /* prefix */,
    string /* model */,
    string /* operation */,
    unknown /* args */,
    {
        infinite: boolean;
        optimisticUpdate: boolean;
    } /* flags */
];

/**
 * Computes query key for the given model, operation and query args.
 * @param model Model name.
 * @param urlOrOperation Prisma operation (e.g, `findMany`) or request URL. If it's a URL, the last path segment will be used as the operation name.
 * @param args Prisma query arguments.
 * @param options Query options, including `infinite` indicating if it's an infinite query (defaults to false), and `optimisticUpdate` indicating if optimistic updates are enabled (defaults to true).
 * @returns Query key
 */
export function getQueryKey(
    model: string,
    urlOrOperation: string,
    args: unknown,
    options: { infinite: boolean; optimisticUpdate: boolean } = { infinite: false, optimisticUpdate: true }
): QueryKey {
    if (!urlOrOperation) {
        throw new Error('Invalid urlOrOperation');
    }
    const operation = urlOrOperation.split('/').pop();

    const infinite = options.infinite;
    // infinite query doesn't support optimistic updates
    const optimisticUpdate = options.infinite ? false : options.optimisticUpdate;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return [QUERY_KEY_PREFIX, model, operation!, args, { infinite, optimisticUpdate }];
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
    if (typeof parsed === 'object' && parsed?.data && parsed?.meta?.serialization) {
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
type InvalidateFunc = (predicate: InvalidationPredicate) => Promise<void>;
type MutationOptions = {
    onMutate?: (...args: any[]) => any;
    onSuccess?: (...args: any[]) => any;
    onSettled?: (...args: any[]) => any;
};

// sets up invalidation hook for a mutation
export function setupInvalidation(
    model: string,
    operation: string,
    modelMeta: ModelMeta,
    options: MutationOptions,
    invalidate: InvalidateFunc,
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
        const [_, queryModel, , args] = queryKey as QueryKey;

        if (mutatedModels.includes(queryModel)) {
            // direct match
            if (logging) {
                console.log(`Invalidating query ${JSON.stringify(queryKey)} due to mutation "${model}.${operation}"`);
            }
            return true;
        }

        if (args) {
            // traverse query args to find nested reads that match the model under mutation
            if (findNestedRead(queryModel, mutatedModels, modelMeta, args)) {
                if (logging) {
                    console.log(
                        `Invalidating query ${JSON.stringify(queryKey)} due to mutation "${model}.${operation}"`
                    );
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

type QueryCache = {
    queryKey: readonly unknown[];
    state: {
        data: unknown;
        error: unknown;
    };
}[];

type SetCacheFunc = (queryKey: readonly unknown[], data: unknown) => void;

/**
 * Sets up optimistic update and invalidation (after settled) for a mutation.
 */
export function setupOptimisticUpdate(
    model: string,
    operation: string,
    modelMeta: ModelMeta,
    options: MutationOptions & ExtraMutationOptions,
    queryCache: QueryCache,
    setCache: SetCacheFunc,
    invalidate?: InvalidateFunc,
    logging = false
) {
    const origOnMutate = options?.onMutate;
    const origOnSettled = options?.onSettled;

    // optimistic update on mutate
    options.onMutate = async (...args: unknown[]) => {
        const [variables] = args;
        await optimisticUpdate(
            model,
            operation as PrismaWriteActionType,
            variables,
            options,
            modelMeta,
            queryCache,
            setCache,
            logging
        );
        return origOnMutate?.(...args);
    };

    // invalidate on settled
    options.onSettled = async (...args: unknown[]) => {
        if (invalidate) {
            const [, , variables] = args;
            const predicate = await getInvalidationPredicate(
                model,
                operation as PrismaWriteActionType,
                variables,
                modelMeta,
                logging
            );
            await invalidate(predicate);
        }
        return origOnSettled?.(...args);
    };
}

// optimistically updates query cache
async function optimisticUpdate(
    mutationModel: string,
    mutationOp: string,
    mutationArgs: any,
    options: MutationOptions & ExtraMutationOptions,
    modelMeta: ModelMeta,
    queryCache: QueryCache,
    setCache: SetCacheFunc,
    logging = false
) {
    for (const cacheItem of queryCache) {
        const {
            queryKey,
            state: { data, error },
        } = cacheItem;

        if (!isZenStackQueryKey(queryKey)) {
            // skip non-zenstack queries
            continue;
        }

        if (error) {
            if (logging) {
                console.warn(`Skipping optimistic update for ${JSON.stringify(queryKey)} due to error:`, error);
            }
            continue;
        }

        const [_, queryModel, queryOperation, queryArgs, queryOptions] = queryKey;
        if (!queryOptions?.optimisticUpdate) {
            if (logging) {
                console.log(`Skipping optimistic update for ${JSON.stringify(queryKey)} due to opt-out`);
            }
            continue;
        }

        if (options.optimisticDataProvider) {
            const providerResult = await options.optimisticDataProvider({
                queryModel,
                queryOperation,
                queryArgs,
                currentData: data,
                mutationArgs,
            });

            if (providerResult?.kind === 'Skip') {
                // skip
                if (logging) {
                    console.log(`Skipping optimistic update for ${JSON.stringify(queryKey)} due to provider`);
                }
                continue;
            } else if (providerResult?.kind === 'Update') {
                // update cache
                if (logging) {
                    console.log(`Optimistically updating query ${JSON.stringify(queryKey)} due to provider`);
                }
                setCache(queryKey, providerResult.data);
                continue;
            }
        }

        // proceed with default optimistic update
        const mutatedData = await applyMutation(
            queryModel,
            queryOperation,
            data,
            mutationModel,
            mutationOp as PrismaWriteActionType,
            mutationArgs,
            modelMeta,
            logging
        );

        if (mutatedData !== undefined) {
            // mutation applicable to this query, update cache
            if (logging) {
                console.log(
                    `Optimistically updating query ${JSON.stringify(
                        queryKey
                    )} due to mutation "${mutationModel}.${mutationOp}"`
                );
            }
            setCache(queryKey, mutatedData);
        }
    }
}

function isZenStackQueryKey(queryKey: readonly unknown[]): queryKey is QueryKey {
    if (queryKey.length < 5) {
        return false;
    }

    if (queryKey[0] !== QUERY_KEY_PREFIX) {
        return false;
    }

    return true;
}
