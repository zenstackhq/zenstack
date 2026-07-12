import type { DataSourceProviderType } from '@zenstackhq/schema';
import { sql, type Kysely } from 'kysely';
import type { SchemaChange } from './diff';
import type { ColumnSnapshot, Snapshot, TableSnapshot } from './types';

/** A live foreign-key constraint. */
export interface FkInfo {
    name: string;
    columns: string[];
    refTable: string;
    refColumns: string[];
}

/** A lightweight, name-based view of the live database schema. */
export interface CurrentDbState {
    /** Table name -> set of column names. */
    tables: Map<string, Set<string>>;
    /** Table name -> set of index names (excluding primary keys). */
    indexes: Map<string, Set<string>>;
    /** Table name -> set of columns that participate in a foreign key (SQLite only). */
    fkColumns: Map<string, Set<string>>;
    /** Table name -> live foreign keys (MySQL only — used to drop FKs before their columns). */
    foreignKeys: Map<string, FkInfo[]>;
    /** Existing enum type names (PostgreSQL only). */
    enums: Set<string>;
}

/** The (columns -> target) identity of a foreign key, ignoring its name. */
function fkKey(fk: { columns: string[]; refTable: string; refColumns: string[] }): string {
    return `${fk.columns.join(',')}=>${fk.refTable}(${fk.refColumns.join(',')})`;
}

/** Result of diffing the live database against the desired schema for a `db push`. */
export interface PushDiff {
    /** Changes that are safe to apply (additive, plus accepted data-loss changes). */
    changes: SchemaChange[];
    /** Human-readable descriptions of data-loss changes that were included (accepted). */
    dataLoss: string[];
    /** Data-loss changes that were NOT included because data loss was not accepted. */
    blocked: string[];
}

/** Introspects the live database into a {@link CurrentDbState}. */
export async function introspectCurrentState(
    db: Kysely<any>,
    provider: DataSourceProviderType,
): Promise<CurrentDbState> {
    const tables = new Map<string, Set<string>>();
    const indexes = new Map<string, Set<string>>();
    const fkColumns = new Map<string, Set<string>>();
    const foreignKeys = new Map<string, FkInfo[]>();
    for (const table of await db.introspection.getTables()) {
        // ignore views and the migration engine's bookkeeping tables
        if (table.isView || table.name.startsWith('kysely_') || table.name.startsWith('zenstack_migration')) {
            continue;
        }
        tables.set(table.name, new Set(table.columns.map((c) => c.name)));
        indexes.set(table.name, await introspectIndexNames(db, provider, table.name));
        if (provider === 'sqlite') {
            // only needed to decide whether a column drop requires a table rebuild
            const rows = (
                await sql<{ from: string }>`PRAGMA foreign_key_list(${sql.raw(`"${table.name}"`)})`.execute(db)
            ).rows;
            fkColumns.set(table.name, new Set(rows.map((r) => r.from)));
        } else if (provider === 'mysql') {
            foreignKeys.set(table.name, await introspectMysqlForeignKeys(db, table.name));
        }
    }

    const enums = new Set<string>();
    if (provider === 'postgresql') {
        const result = await sql<{ typname: string }>`SELECT typname FROM pg_type WHERE typtype = 'e'`.execute(db);
        for (const row of result.rows) {
            enums.add(row.typname);
        }
    }

    return { tables, indexes, fkColumns, foreignKeys, enums };
}

/** Reads a MySQL table's foreign-key constraints. */
async function introspectMysqlForeignKeys(db: Kysely<any>, table: string): Promise<FkInfo[]> {
    const rows = (
        await sql<{
            CONSTRAINT_NAME: string;
            COLUMN_NAME: string;
            REFERENCED_TABLE_NAME: string;
            REFERENCED_COLUMN_NAME: string;
        }>`
            SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
        `.execute(db)
    ).rows;
    const byName = new Map<string, FkInfo>();
    for (const r of rows) {
        const existing =
            byName.get(r.CONSTRAINT_NAME) ??
            ({ name: r.CONSTRAINT_NAME, columns: [], refTable: r.REFERENCED_TABLE_NAME, refColumns: [] } as FkInfo);
        existing.columns.push(r.COLUMN_NAME);
        existing.refColumns.push(r.REFERENCED_COLUMN_NAME);
        byName.set(r.CONSTRAINT_NAME, existing);
    }
    return [...byName.values()];
}

/** Reads the (non-primary-key) index names of a table. */
async function introspectIndexNames(
    db: Kysely<any>,
    provider: DataSourceProviderType,
    table: string,
): Promise<Set<string>> {
    const names = new Set<string>();
    if (provider === 'postgresql') {
        const rows = (
            await sql<{ indexname: string }>`
                SELECT i.indexname
                FROM pg_indexes i
                JOIN pg_class c ON c.relname = i.indexname
                JOIN pg_index ix ON ix.indexrelid = c.oid
                WHERE i.schemaname = 'public' AND i.tablename = ${table} AND NOT ix.indisprimary
            `.execute(db)
        ).rows;
        for (const r of rows) {
            names.add(r.indexname);
        }
    } else if (provider === 'mysql') {
        const rows = (
            await sql<{ INDEX_NAME: string }>`
                SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND INDEX_NAME <> 'PRIMARY'
            `.execute(db)
        ).rows;
        for (const r of rows) {
            names.add(r.INDEX_NAME);
        }
    } else {
        const rows = (
            await sql<{ name: string; origin: string }>`PRAGMA index_list(${sql.raw(`"${table}"`)})`.execute(db)
        ).rows;
        for (const r of rows) {
            if (r.origin !== 'pk' && !r.name.startsWith('sqlite_autoindex')) {
                names.add(r.name);
            }
        }
    }
    return names;
}

/**
 * Computes the changes needed to reconcile the live database ({@link CurrentDbState}) to
 * the desired schema. This is a name-based diff (structure add/remove) — it does not
 * detect column type or nullability changes.
 */
export function diffForPush(current: CurrentDbState, desired: Snapshot, acceptDataLoss: boolean): PushDiff {
    const changes: SchemaChange[] = [];
    const dataLoss: string[] = [];
    const blocked: string[] = [];

    // create missing enums (PostgreSQL)
    for (const [name, enumDef] of Object.entries(desired.enums)) {
        if (!current.enums.has(name)) {
            changes.push({ kind: 'create-enum', enum: enumDef });
        }
    }

    // create/alter tables, in FK-dependency order
    for (const table of orderByDependency(Object.values(desired.tables))) {
        const currentColumns = current.tables.get(table.name);
        if (!currentColumns) {
            changes.push({ kind: 'create-table', table });
            continue;
        }

        // SQLite: dropping a foreign-key column requires a table rebuild
        if (desired.provider === 'sqlite') {
            const fkColumns = current.fkColumns.get(table.name) ?? new Set<string>();
            const droppedColumns = [...currentColumns].filter((c) => !table.columns[c]);
            if (droppedColumns.some((c) => fkColumns.has(c))) {
                if (acceptDataLoss) {
                    const copyColumns = Object.keys(table.columns)
                        .filter((c) => currentColumns.has(c))
                        .map((c) => ({ target: c, source: c }));
                    changes.push({ kind: 'rebuild-table', table, copyColumns });
                    for (const c of droppedColumns) {
                        dataLoss.push(`column "${table.name}.${c}"`);
                    }
                } else {
                    for (const c of droppedColumns) {
                        blocked.push(`column "${table.name}.${c}" would be dropped`);
                    }
                }
                continue; // the rebuild handles all column/index changes for this table
            }
        }

        // MySQL: drop foreign keys that are no longer desired before touching their columns,
        // and remember FK-backing index names so we don't try to drop them
        const mysql = desired.provider === 'mysql';
        const currentFks = mysql ? (current.foreignKeys.get(table.name) ?? []) : [];
        const desiredFkKeys = new Set(table.foreignKeys.map(fkKey));
        const fkBackingIndexes = new Set<string>();
        if (mysql) {
            for (const fk of currentFks) {
                fkBackingIndexes.add(fk.name); // a MySQL FK creates an index of the same name
                if (!desiredFkKeys.has(fkKey(fk))) {
                    changes.push({ kind: 'drop-foreign-key', table, fk });
                }
            }
        }

        for (const [columnName, column] of Object.entries(table.columns)) {
            if (!currentColumns.has(columnName)) {
                // a single-column FK is added inline on pg/sqlite; MySQL adds it separately below
                const fk = mysql
                    ? undefined
                    : table.foreignKeys.find((f) => f.columns.length === 1 && f.columns[0] === columnName);
                changes.push({ kind: 'add-column', table, column, fk });
            }
        }
        for (const columnName of currentColumns) {
            if (!table.columns[columnName]) {
                const description = `column "${table.name}.${columnName}"`;
                if (acceptDataLoss) {
                    changes.push({ kind: 'drop-column', table, column: placeholderColumn(columnName) });
                    dataLoss.push(description);
                } else {
                    blocked.push(`${description} would be dropped`);
                }
            }
        }
        // indexes (add/drop by name — index changes are not data-destructive)
        const currentIndexes = current.indexes.get(table.name) ?? new Set<string>();
        for (const index of table.indexes) {
            if (!currentIndexes.has(index.name)) {
                changes.push({ kind: 'create-index', table, index });
            }
        }
        for (const indexName of currentIndexes) {
            if (!table.indexes.some((i) => i.name === indexName) && !fkBackingIndexes.has(indexName)) {
                changes.push({ kind: 'drop-index', table, index: { name: indexName, columns: [], unique: false } });
            }
        }

        // MySQL: add newly-desired foreign keys once their columns exist
        if (mysql) {
            const currentFkKeys = new Set(currentFks.map(fkKey));
            for (const fk of table.foreignKeys) {
                if (!currentFkKeys.has(fkKey(fk))) {
                    changes.push({ kind: 'add-foreign-key', table, fk });
                }
            }
        }
    }

    // drop tables that are no longer in the schema (reverse dependency order)
    const dropOrder = orderByDependency(Object.values(desired.tables)).reverse();
    const desiredNames = new Set(dropOrder.map((t) => t.name));
    for (const name of current.tables.keys()) {
        if (!desiredNames.has(name)) {
            const description = `table "${name}"`;
            if (acceptDataLoss) {
                changes.push({ kind: 'drop-table', table: placeholderTable(name) });
                dataLoss.push(description);
            } else {
                blocked.push(`${description} would be dropped`);
            }
        }
    }

    return { changes, dataLoss, blocked };
}

/** Orders tables so a table's foreign-key targets come before it. */
function orderByDependency(tables: TableSnapshot[]): TableSnapshot[] {
    const byName = new Map(tables.map((t) => [t.name, t]));
    const visited = new Set<string>();
    const result: TableSnapshot[] = [];

    const visit = (table: TableSnapshot, stack: Set<string>) => {
        if (visited.has(table.name) || stack.has(table.name)) {
            return;
        }
        stack.add(table.name);
        for (const fk of table.foreignKeys) {
            const target = byName.get(fk.refTable);
            if (target && target.name !== table.name) {
                visit(target, stack);
            }
        }
        stack.delete(table.name);
        visited.add(table.name);
        result.push(table);
    };

    for (const table of tables) {
        visit(table, new Set());
    }
    return result;
}

function placeholderTable(name: string): TableSnapshot {
    return { name, columns: {}, primaryKey: [], indexes: [], foreignKeys: [] };
}

function placeholderColumn(name: string): ColumnSnapshot {
    return {
        name,
        type: 'String',
        isEnum: false,
        isJson: false,
        array: false,
        nullable: true,
        autoIncrement: false,
        primaryKey: false,
        unique: false,
    };
}
