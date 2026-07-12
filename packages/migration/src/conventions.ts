import type { DataSourceProviderType } from '@zenstackhq/schema';

/**
 * Physical naming conventions matching Prisma's, so the native engine reproduces the exact
 * constraint/index names Prisma generates for the same schema (verified against Prisma v7).
 *
 * All names use the *physical* (mapped) table and column names and are assembled as
 * `<table>[_<col>...]_<suffix>`, then truncated to the provider's identifier limit on
 * overflow (keeping the suffix). PostgreSQL truncates at 63 chars, MySQL at 64; SQLite has
 * no practical limit and is not truncated.
 */

/** Identifier length limit for constraint/index names, per provider (Prisma's behavior). */
function nameLimit(provider: DataSourceProviderType): number {
    switch (provider) {
        case 'postgresql':
            return 63;
        case 'mysql':
            return 64;
        default:
            return Number.POSITIVE_INFINITY; // SQLite is not truncated
    }
}

/** Assembles `<parts joined by _>_<suffix>`, truncating to fit the provider's limit. */
function assemble(provider: DataSourceProviderType, parts: string[], suffix: string): string {
    const base = parts.join('_');
    const full = `${base}_${suffix}`;
    const limit = nameLimit(provider);
    if (full.length <= limit) {
        return full;
    }
    // keep the suffix; trim the base so `<trimmed>_<suffix>` is exactly `limit` chars
    return `${base.slice(0, limit - suffix.length - 1)}_${suffix}`;
}

/** Primary-key constraint name, e.g. `User_pkey`. */
export function primaryKeyName(provider: DataSourceProviderType, table: string): string {
    return assemble(provider, [table], 'pkey');
}

/** Foreign-key constraint name, e.g. `Post_authorId_fkey`. */
export function foreignKeyName(provider: DataSourceProviderType, table: string, columns: string[]): string {
    return assemble(provider, [table, ...columns], 'fkey');
}

/** Unique-index name, e.g. `User_email_key`. */
export function uniqueIndexName(provider: DataSourceProviderType, table: string, columns: string[]): string {
    return assemble(provider, [table, ...columns], 'key');
}

/** Non-unique index name, e.g. `User_email_idx`. */
export function indexName(provider: DataSourceProviderType, table: string, columns: string[]): string {
    return assemble(provider, [table, ...columns], 'idx');
}
