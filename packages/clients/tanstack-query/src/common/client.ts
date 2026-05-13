import type { QueryClient } from '@tanstack/query-core';
import type { InvalidationPredicate, QueryInfo } from '@zenstackhq/client-helpers';
import { parseQueryKey } from './query-key.js';

/** Strips a trailing slash from an endpoint URL. */
export function normalizeEndpoint(endpoint: string) {
    return endpoint.replace(/\/$/, '');
}

export function invalidateQueriesMatchingPredicate(queryClient: QueryClient, predicate: InvalidationPredicate) {
    return queryClient.invalidateQueries({
        predicate: ({ queryKey }) => {
            const parsed = parseQueryKey(queryKey);
            if (!parsed) {
                return false;
            }
            return predicate({ model: parsed.model as string, args: parsed.args });
        },
    });
}

export function getAllQueries(queryClient: QueryClient): readonly QueryInfo[] {
    return queryClient
        .getQueryCache()
        .getAll()
        .map(({ queryKey, state }) => {
            const parsed = parseQueryKey(queryKey);
            if (!parsed) {
                return undefined;
            }
            return {
                model: parsed?.model,
                operation: parsed?.operation,
                args: parsed?.args,
                data: state.data,
                optimisticUpdate: !!parsed.flags.optimisticUpdate,
                updateData: (data: unknown, cancelOnTheFlyQueries: boolean) => {
                    queryClient.setQueryData<unknown>(queryKey, data);
                    if (cancelOnTheFlyQueries) {
                        queryClient.cancelQueries({ queryKey }, { revert: false, silent: true });
                    }
                },
            };
        })
        .filter((entry) => !!entry);
}
