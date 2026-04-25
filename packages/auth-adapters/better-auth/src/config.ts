import type { DBAdapterDebugLogOption } from '@better-auth/core/db/adapter';

/**
 * Options for the ZenStack adapter factory.
 */
export interface AdapterConfig {
    /**
     * Database provider
     */
    provider: 'sqlite' | 'postgresql';

    /**
     * Enable debug logs for the adapter
     *
     * @default false
     */
    debugLogs?: DBAdapterDebugLogOption | undefined;

    /**
     * Use plural table names
     *
     * @default false
     */
    usePlural?: boolean | undefined;

    /**
     * Preserve Better Auth array fields as native database arrays.
     *
     * Defaults to true for PostgreSQL and false for SQLite.
     */
    supportsArrays?: boolean | undefined;
}

export function getSupportsArrays(config: AdapterConfig) {
    return config.supportsArrays ?? config.provider === 'postgresql';
}
