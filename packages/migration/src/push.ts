import type { DataSourceProviderType } from '@zenstackhq/schema';
import { isBookkeepingTable } from './conventions';
import { introspect } from './introspect';
import { providerTraits } from './provider-traits';
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

    /**
     * Table name -> set of columns that participate in a foreign key or an index (SQLite
     * only — dropping such a column requires a table rebuild).
     */
    constrainedColumns: Map<string, Set<string>>;

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

/**
 * Introspects the live database into a {@link CurrentDbState}, using the same deep
 * introspection that powers `db pull` and reducing it to the name-based view the push
 * diff consumes.
 */
export async function introspectCurrentState(
    connectionUrl: string,
    provider: DataSourceProviderType,
): Promise<CurrentDbState> {
    const introspected = await introspect(provider, connectionUrl, {
        // push operates on the default schema only
        schemas: ['public'],
        modelCasing: 'none',
    });

    const tables = new Map<string, Set<string>>();
    const indexes = new Map<string, Set<string>>();
    const constrainedColumns = new Map<string, Set<string>>();
    const foreignKeys = new Map<string, FkInfo[]>();

    for (const table of introspected.tables) {
        // ignore views and migration-tooling bookkeeping tables
        if (table.type !== 'table' || isBookkeepingTable(table.name)) {
            continue;
        }
        tables.set(table.name, new Set(table.columns.map((c) => c.name)));
        indexes.set(table.name, new Set(table.indexes.filter((i) => !i.primary).map((i) => i.name)));

        if (provider === 'sqlite') {
            // columns that participate in a foreign key or an index can't be dropped in
            // place — their drop requires a table rebuild
            const constrained = new Set<string>();
            for (const column of table.columns) {
                if (column.foreign_key_table) {
                    constrained.add(column.name);
                }
            }
            for (const index of table.indexes) {
                for (const column of index.columns) {
                    constrained.add(column.name);
                }
            }
            constrainedColumns.set(table.name, constrained);
        } else if (provider === 'mysql') {
            // group FK columns (reported per column) into constraints, preserving column order
            const byName = new Map<string, FkInfo>();
            for (const column of table.columns) {
                if (!column.foreign_key_name || !column.foreign_key_table || !column.foreign_key_column) {
                    continue;
                }
                const existing = byName.get(column.foreign_key_name) ?? {
                    name: column.foreign_key_name,
                    columns: [],
                    refTable: column.foreign_key_table,
                    refColumns: [],
                };
                existing.columns.push(column.name);
                existing.refColumns.push(column.foreign_key_column);
                byName.set(column.foreign_key_name, existing);
            }
            foreignKeys.set(table.name, [...byName.values()]);
        }
    }

    const enums = new Set(introspected.enums.map((e) => e.enum_type));

    return { tables, indexes, constrainedColumns, foreignKeys, enums };
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

        // SQLite: dropping a column that participates in a foreign key or an index requires
        // a table rebuild (its native DROP COLUMN refuses such columns)
        if (providerTraits(desired.provider).rebuildTableForAlters) {
            const constrained = current.constrainedColumns.get(table.name) ?? new Set<string>();
            const droppedColumns = [...currentColumns].filter((c) => !table.columns[c]);
            if (droppedColumns.some((c) => constrained.has(c))) {
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
        const explicitFks = !providerTraits(desired.provider).inlineForeignKeys;
        const currentFks = explicitFks ? (current.foreignKeys.get(table.name) ?? []) : [];
        const desiredFkKeys = new Set(table.foreignKeys.map(fkKey));
        const fkBackingIndexes = new Set<string>();
        if (explicitFks) {
            for (const fk of currentFks) {
                fkBackingIndexes.add(fk.name); // a MySQL FK creates an index of the same name
                if (!desiredFkKeys.has(fkKey(fk))) {
                    changes.push({ kind: 'drop-foreign-key', table, fk });
                }
            }
        }

        // drop stale indexes before the column changes — a dropped column's index must go
        // first (MySQL's DROP COLUMN auto-drops it, making a later DROP INDEX fail)
        const currentIndexes = current.indexes.get(table.name) ?? new Set<string>();
        for (const indexName of currentIndexes) {
            if (!table.indexes.some((i) => i.name === indexName) && !fkBackingIndexes.has(indexName)) {
                changes.push({ kind: 'drop-index', table, index: { name: indexName, columns: [], unique: false } });
            }
        }

        for (const [columnName, column] of Object.entries(table.columns)) {
            if (!currentColumns.has(columnName)) {
                // a single-column FK is added inline on pg/sqlite; MySQL adds it separately below
                const fk = explicitFks
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
        // create missing indexes once their columns exist (index changes are not data-destructive)
        for (const index of table.indexes) {
            if (!currentIndexes.has(index.name)) {
                changes.push({ kind: 'create-index', table, index });
            }
        }

        // MySQL: add newly-desired foreign keys once their columns exist
        if (explicitFks) {
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
