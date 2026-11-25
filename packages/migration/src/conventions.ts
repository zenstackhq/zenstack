import type { DataSourceProviderType } from '@zenstackhq/schema';
import { providerTraits } from './provider-traits';

/**
 * Physical naming conventions matching Prisma's, so the native engine reproduces the exact
 * constraint/index names Prisma generates for the same schema (verified against Prisma v7).
 *
 * All names use the *physical* (mapped) table and column names and are assembled as
 * `<table>[_<col>...]_<suffix>`, then truncated to the provider's identifier limit on
 * overflow (keeping the suffix). PostgreSQL truncates at 63 chars, MySQL at 64; SQLite has
 * no practical limit and is not truncated.
 */

/** ZenStack's migration tracking table (overrides Kysely's `kysely_migration` default). */
export const MIGRATION_TABLE = 'zenstack_migration';

/** ZenStack's migration lock table. */
export const MIGRATION_LOCK_TABLE = 'zenstack_migration_lock';

/** Prisma's migration tracking table — present on databases adopted via `migrate baseline`. */
export const PRISMA_MIGRATION_TABLE = '_prisma_migrations';

/**
 * Whether a table is migration-tooling bookkeeping (ours, Kysely's, or Prisma's) rather
 * than part of the schema — such tables are excluded from introspection-based diffing.
 */
export function isBookkeepingTable(name: string): boolean {
    return name.startsWith(MIGRATION_TABLE) || name.startsWith('kysely_') || name === PRISMA_MIGRATION_TABLE;
}

/** Assembles `<parts joined by _>_<suffix>`, truncating to fit the provider's limit. */
function assemble(provider: DataSourceProviderType, parts: string[], suffix: string): string {
    const base = parts.join('_');
    const full = `${base}_${suffix}`;
    const limit = providerTraits(provider).maxIdentifierLength;
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

/** The two columns of an implicit many-to-many join table. */
export const JOIN_TABLE_COLUMNS = ['A', 'B'] as const;

/**
 * Implicit many-to-many join table name: `_<relation name>` when the relation is named,
 * otherwise `_<ModelA>To<ModelB>` (logical model names, sorted). Truncated to the
 * provider's identifier limit, as Prisma does.
 */
export function joinTableName(
    provider: DataSourceProviderType,
    relationName: string | undefined,
    sortedModels: [string, string],
): string {
    const name = `_${relationName ?? `${sortedModels[0]}To${sortedModels[1]}`}`;
    const limit = providerTraits(provider).maxIdentifierLength;
    return name.length <= limit ? name : name.slice(0, limit);
}

/** Join-table primary-key constraint name, e.g. `_PostToTag_AB_pkey`. */
export function joinTablePrimaryKeyName(provider: DataSourceProviderType, table: string): string {
    return assemble(provider, [table], 'AB_pkey');
}

/** Join-table unique-index name (where the pair isn't a primary key), e.g. `_PostToTag_AB_unique`. */
export function joinTableUniqueIndexName(provider: DataSourceProviderType, table: string): string {
    return assemble(provider, [table], 'AB_unique');
}

/** Join-table index name on the `B` column, e.g. `_PostToTag_B_index`. */
export function joinTableIndexName(provider: DataSourceProviderType, table: string): string {
    return assemble(provider, [table], 'B_index');
}

/** Join-table foreign-key constraint name, e.g. `_PostToTag_A_fkey`. */
export function joinTableForeignKeyName(provider: DataSourceProviderType, table: string, column: 'A' | 'B'): string {
    return assemble(provider, [table], `${column}_fkey`);
}
