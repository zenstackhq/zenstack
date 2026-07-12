import { EMPTY_RENAME_PLAN, type RenameMapping, type RenamePlan } from './rename';
import type { ColumnSnapshot, EnumSnapshot, ForeignKeySnapshot, IndexSnapshot, Snapshot, TableSnapshot } from './types';

/**
 * A single schema change produced by diffing two snapshots. The first-draft engine
 * supports the additive/removal cases fully; more nuanced in-place alterations are
 * surfaced as {@link UnsupportedChange} so the developer can hand-author them.
 */
export type SchemaChange =
    | { kind: 'create-enum'; enum: EnumSnapshot }
    | { kind: 'drop-enum'; enum: EnumSnapshot }
    | { kind: 'create-table'; table: TableSnapshot }
    | { kind: 'drop-table'; table: TableSnapshot }
    // A table (model) rename — preserves the table and its data. `to` is the new table def.
    | { kind: 'rename-table'; from: string; to: TableSnapshot }
    | { kind: 'add-column'; table: TableSnapshot; column: ColumnSnapshot; fk?: ForeignKeySnapshot }
    | { kind: 'drop-column'; table: TableSnapshot; column: ColumnSnapshot }
    // A column (field) rename — preserves the column and its data. `column` is the new def.
    | { kind: 'rename-column'; table: TableSnapshot; from: string; column: ColumnSnapshot }
    | { kind: 'create-index'; table: TableSnapshot; index: IndexSnapshot }
    | { kind: 'drop-index'; table: TableSnapshot; index: IndexSnapshot }
    // SQLite can't drop a foreign-key column via ALTER, so the table is rebuilt to its
    // desired shape, copying the overlapping columns.
    | { kind: 'rebuild-table'; table: TableSnapshot; copyColumns: string[] }
    | { kind: 'unsupported'; description: string };

/**
 * Diffs two snapshots and returns the ordered list of changes to get from `from` to `to`.
 *
 * Tables are created in dependency order (referenced tables first) and dropped in the
 * reverse order so foreign keys stay valid. An optional {@link RenamePlan} turns otherwise
 * drop + create pairs into data-preserving renames.
 */
export function diffSnapshots(from: Snapshot, to: Snapshot, plan: RenamePlan = EMPTY_RENAME_PLAN): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // enums
    for (const [name, enumDef] of Object.entries(to.enums)) {
        if (!from.enums[name]) {
            changes.push({ kind: 'create-enum', enum: enumDef });
        } else if (!arraysEqual(from.enums[name]!.values, enumDef.values)) {
            changes.push({
                kind: 'unsupported',
                description: `enum "${name}" values changed (${from.enums[name]!.values.join(', ')} -> ${enumDef.values.join(', ')})`,
            });
        }
    }
    for (const [name, enumDef] of Object.entries(from.enums)) {
        if (!to.enums[name]) {
            changes.push({ kind: 'drop-enum', enum: enumDef });
        }
    }

    const oldTableOf = new Map(plan.tables.map((m) => [m.to, m.from]));
    const renamedFromTables = new Set(plan.tables.map((m) => m.from));

    // tables to create (in dependency order) and to alter
    const createOrder = topoSortTables(to);
    for (const table of createOrder) {
        const renamedFrom = oldTableOf.get(table.name);
        const columnRenames = plan.columns[table.name] ?? [];
        if (renamedFrom) {
            // rename the table first, then reconcile its contents against the renamed table
            changes.push({ kind: 'rename-table', from: renamedFrom, to: table });
            changes.push(...diffTable(from.tables[renamedFrom]!, table, to.provider, columnRenames));
        } else {
            const before = from.tables[table.name];
            if (!before) {
                changes.push({ kind: 'create-table', table });
            } else {
                changes.push(...diffTable(before, table, to.provider, columnRenames));
            }
        }
    }

    // tables to drop (reverse dependency order) — skip any consumed by a rename
    const dropOrder = topoSortTables(from).reverse();
    for (const table of dropOrder) {
        if (!to.tables[table.name] && !renamedFromTables.has(table.name)) {
            changes.push({ kind: 'drop-table', table });
        }
    }

    return changes;
}

function diffTable(
    from: TableSnapshot,
    to: TableSnapshot,
    provider: Snapshot['provider'],
    columnRenames: RenameMapping[] = [],
): SchemaChange[] {
    const oldColumnOf = new Map(columnRenames.map((m) => [m.to, m.from])); // new column -> old column
    const renamedFromColumns = new Set(columnRenames.map((m) => m.from));

    // SQLite can't drop a column that participates in a foreign key — rebuild the table.
    // A *renamed* column is not a drop, so it doesn't force a rebuild.
    const droppedFkColumn = Object.keys(from.columns).some(
        (name) =>
            !to.columns[name] &&
            !renamedFromColumns.has(name) &&
            from.foreignKeys.some((fk) => fk.columns.includes(name)),
    );
    if (provider === 'sqlite' && droppedFkColumn) {
        const copyColumns = Object.keys(to.columns).filter((name) => from.columns[name]);
        return [{ kind: 'rebuild-table', table: to, copyColumns }];
    }

    const changes: SchemaChange[] = [];

    const addedColumns = new Set<string>();
    const droppedColumns = new Set<string>();

    for (const [name, column] of Object.entries(to.columns)) {
        const renamedFrom = oldColumnOf.get(name);
        if (renamedFrom) {
            changes.push({ kind: 'rename-column', table: to, from: renamedFrom, column });
            // a rename only changes the name; any other difference needs a manual alter
            if (!columnsEqualIgnoringName(from.columns[renamedFrom]!, column)) {
                changes.push({
                    kind: 'unsupported',
                    description: `column "${to.name}.${name}" changed while being renamed and requires a manual migration`,
                });
            }
            continue;
        }
        const before = from.columns[name];
        if (!before) {
            addedColumns.add(name);
            // if this column is the sole column of a new foreign key, add it inline
            changes.push({ kind: 'add-column', table: to, column, fk: singleColumnFk(to, name) });
        } else if (!columnsEqual(before, column)) {
            changes.push({
                kind: 'unsupported',
                description: `column "${to.name}.${name}" changed and requires a manual migration`,
            });
        }
    }
    for (const [name, column] of Object.entries(from.columns)) {
        if (!to.columns[name] && !renamedFromColumns.has(name)) {
            droppedColumns.add(name);
            changes.push({ kind: 'drop-column', table: to, column });
        }
    }

    // indexes — compared by name (add/drop; a `map:` rename is a drop + create)
    const fromIndexes = new Map(from.indexes.map((i) => [i.name, i]));
    const toIndexes = new Map(to.indexes.map((i) => [i.name, i]));
    for (const [name, index] of toIndexes) {
        if (!fromIndexes.has(name)) {
            changes.push({ kind: 'create-index', table: to, index });
        }
    }
    for (const [name, index] of fromIndexes) {
        if (!toIndexes.has(name)) {
            changes.push({ kind: 'drop-index', table: to, index });
        }
    }

    // primary-key changes on an existing table aren't automated yet
    if (!arraysEqual(from.primaryKey, to.primaryKey)) {
        changes.push({
            kind: 'unsupported',
            description: `primary key on table "${to.name}" changed and requires a manual migration`,
        });
    }

    // foreign keys — compared by (columns -> target), ignoring the constraint name so a
    // relation rename is a no-op. Single-column FKs on added/dropped columns are handled
    // inline by the corresponding add-column / drop-column.
    const fromFks = new Map(from.foreignKeys.map((fk) => [fkKey(fk), fk]));
    const toFks = new Map(to.foreignKeys.map((fk) => [fkKey(fk), fk]));
    for (const [key, fk] of toFks) {
        if (fromFks.has(key)) {
            continue;
        }
        if (fk.columns.length === 1 && addedColumns.has(fk.columns[0]!)) {
            continue; // added inline with the column
        }
        changes.push({
            kind: 'unsupported',
            description: `adding foreign key on existing columns of table "${to.name}" requires a manual migration`,
        });
    }
    for (const [key, fk] of fromFks) {
        if (toFks.has(key)) {
            continue;
        }
        if (fk.columns.length === 1 && droppedColumns.has(fk.columns[0]!)) {
            continue; // removed together with the dropped column
        }
        changes.push({
            kind: 'unsupported',
            description: `dropping foreign key while keeping its columns on table "${to.name}" requires a manual migration`,
        });
    }

    return changes;
}

/** The foreign key whose sole column is `columnName`, if any. */
function singleColumnFk(table: TableSnapshot, columnName: string): ForeignKeySnapshot | undefined {
    return table.foreignKeys.find((fk) => fk.columns.length === 1 && fk.columns[0] === columnName);
}

function fkKey(fk: ForeignKeySnapshot): string {
    return `${fk.columns.join(',')}=>${fk.refTable}(${fk.refColumns.join(',')})`;
}

/** Orders tables so that a table's foreign-key targets come before it. */
function topoSortTables(snapshot: Snapshot): TableSnapshot[] {
    const tables = Object.values(snapshot.tables);
    const byName = new Map(tables.map((t) => [t.name, t]));
    const visited = new Set<string>();
    const result: TableSnapshot[] = [];

    const visit = (table: TableSnapshot, stack: Set<string>) => {
        if (visited.has(table.name)) {
            return;
        }
        if (stack.has(table.name)) {
            // cycle (e.g. self-reference) — break to avoid infinite recursion
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

// #region equality

function columnsEqual(a: ColumnSnapshot, b: ColumnSnapshot): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Compares two columns ignoring their name — used to detect whether a rename also alters the column. */
function columnsEqualIgnoringName(a: ColumnSnapshot, b: ColumnSnapshot): boolean {
    return columnsEqual({ ...a, name: '' }, { ...b, name: '' });
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

// #endregion
