import { AsyncLocalStorage } from 'node:async_hooks';

type InternalQueryContext = {
    /**
     * When true, `ZenStackQueryExecutor` skips all `onKyselyQuery` plugin hooks.
     * Used for internal pre-load queries that must not be filtered by access policies.
     */
    bypassOnKyselyHooks?: boolean;
};

export const internalQueryContextStorage = new AsyncLocalStorage<InternalQueryContext>();
