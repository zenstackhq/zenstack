/**
 * Zod schema cache statistics.
 */
export interface ZodCacheStats {
    /**
     * Number of cached Zod schemas.
     */
    size: number;

    /**
     * Keys of the cached Zod schemas.
     */
    keys: string[];
}

/**
 * Information about a query, used for diagnostics.
 */
export interface QueryInfo {
    /**
     * Duration of the query in milliseconds.
     */
    durationMs: number;

    /**
     * SQL statement of the query.
     */
    sql: string;
}

/**
 * ZenStackClient diagnostics.
 */
export interface Diagnostics {
    /**
     * Statistics about the Zod schemas (used for query args validation) cache.
     */
    zodCache: ZodCacheStats;

    /**
     * Slow queries.
     */
    slowQueries: QueryInfo[];
}
