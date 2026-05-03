import type { Logger } from '@zenstackhq/client-helpers';
import { createInvalidator, type InvalidateFunc } from '@zenstackhq/client-helpers';
import type { FetchFn } from '@zenstackhq/client-helpers/fetch';
import { fetcher, marshal } from '@zenstackhq/client-helpers/fetch';
import type { SchemaDef } from '@zenstackhq/schema';
import { TRANSACTION_ROUTE_PREFIX } from './constants.js';
import type { TransactionOperation } from './types.js';

/**
 * Builds the mutation function for a sequential transaction request.
 */
export function makeTransactionMutationFn(endpoint: string, fetch: FetchFn | undefined) {
    return (operations: TransactionOperation[]) => {
        const reqUrl = `${endpoint}/${TRANSACTION_ROUTE_PREFIX}/sequential`;
        const fetchInit = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: marshal(operations),
        };
        return fetcher<unknown[]>(reqUrl, fetchInit, fetch);
    };
}

/**
 * Builds the `onSuccess` handler for a sequential transaction mutation that invalidates
 * all queries affected by the operations in the transaction.
 *
 * @param schema The schema definition.
 * @param invalidateFunc Function that invalidates queries matching a predicate.
 * @param logging Logging option.
 * @param origOnSuccess The user-provided `onSuccess` callback to call after invalidation.
 */
export function makeTransactionOnSuccess(
    schema: SchemaDef,
    invalidateFunc: InvalidateFunc,
    logging: Logger | undefined,
    origOnSuccess: ((...args: any[]) => any) | undefined,
) {
    return async (...args: any[]) => {
        const variables = args[1] as TransactionOperation[];
        for (const op of variables) {
            const invalidator = createInvalidator(op.model, op.op, schema, invalidateFunc, logging);
            // pass op.args as mutation variables so the invalidator can analyze nested writes
            await invalidator(args[0], op.args, args[2]);
        }
        await origOnSuccess?.(...args);
    };
}
