import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-query context shared between the ORM hook (`onQuery`) and the Kysely handler (`onKyselyQuery`).
 * - `operation`: ORM operation name (e.g. `findUnique`, `create`) — used to distinguish single-row reads
 *   and to skip the read diagnostic check for nested SELECTs inside mutations
 * - `fetchPolicyCodes`: per-query override of the plugin-level option
 */
export type PolicyContext = {
    operation?: string;
    fetchPolicyCodes?: boolean;
};

export const policyContextStorage = new AsyncLocalStorage<PolicyContext>();
