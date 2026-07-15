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
    // Appends values to an existing enum type (PostgreSQL `ALTER TYPE … ADD VALUE`).
    | { kind: 'alter-enum-add-values'; enum: EnumSnapshot; added: string[] }
    // Recreates an enum whose values were removed/reordered (PostgreSQL can't drop enum values
    // in place): create a new type, cast every using column over, then swap names and drop the
    // old type. `columns` are the using columns as they exist *before* the migration (the
    // database state when this change applies). `enum` is the new definition.
    | { kind: 'recreate-enum'; enum: EnumSnapshot; columns: EnumColumnUsage[] }
    | { kind: 'create-table'; table: TableSnapshot }
    | { kind: 'drop-table'; table: TableSnapshot }
    // A table (model) rename — preserves the table and its data. `to` is the new table def.
    | { kind: 'rename-table'; from: string; to: TableSnapshot }
    | { kind: 'add-column'; table: TableSnapshot; column: ColumnSnapshot; fk?: ForeignKeySnapshot }
    | { kind: 'drop-column'; table: TableSnapshot; column: ColumnSnapshot }
    // A column (field) rename — preserves the column and its data. `column` is the new def.
    | { kind: 'rename-column'; table: TableSnapshot; from: string; column: ColumnSnapshot }
    // An in-place column change (type / nullability / default). `to` is the new def.
    | { kind: 'alter-column'; table: TableSnapshot; from: ColumnSnapshot; to: ColumnSnapshot }
    | { kind: 'create-index'; table: TableSnapshot; index: IndexSnapshot }
    | { kind: 'drop-index'; table: TableSnapshot; index: IndexSnapshot }
    // A foreign key added/dropped on already-existing columns, or recreated because its
    // referential actions (onDelete/onUpdate) changed.
    | { kind: 'add-foreign-key'; table: TableSnapshot; fk: ForeignKeySnapshot }
    | { kind: 'drop-foreign-key'; table: TableSnapshot; fk: ForeignKeySnapshot }
    // A primary-key change (composite `@@id` or single `@id` move) — drop then re-add the
    // constraint on pg/mysql (`columns` are the new PK columns); rebuild on sqlite.
    | { kind: 'add-primary-key'; table: TableSnapshot; columns: string[] }
    | { kind: 'drop-primary-key'; table: TableSnapshot }
    // SQLite can't alter/drop columns in place, so the table is rebuilt to its desired shape,
    // copying data for the columns that carry over (`source` → `target`, honoring renames).
    | { kind: 'rebuild-table'; table: TableSnapshot; copyColumns: ColumnCopy[] }
    | { kind: 'unsupported'; description: string };

/** A column carried over during a SQLite table rebuild: copy `source` (old) into `target` (new). */
export interface ColumnCopy {
    target: string;
    source: string;
}

/** A column typed with a given enum, identified by its physical table name. */
export interface EnumColumnUsage {
    table: string;
    column: ColumnSnapshot;
}

/**
 * Diffs two snapshots and returns the ordered list of changes to get from `from` to `to`.
 *
 * Tables are created in dependency order (referenced tables first) and dropped in the
 * reverse order so foreign keys stay valid. An optional {@link RenamePlan} turns otherwise
 * drop + create pairs into data-preserving renames.
 */
export function diffSnapshots(from: Snapshot, to: Snapshot, plan: RenamePlan = EMPTY_RENAME_PLAN): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const mysqlEnumsChanged: string[] = [];

    // enums
    for (const [name, enumDef] of Object.entries(to.enums)) {
        const before = from.enums[name];
        if (!before) {
            changes.push({ kind: 'create-enum', enum: enumDef });
        } else if (!arraysEqual(before.values, enumDef.values)) {
            if (to.provider === 'postgresql') {
                // appended values can be added in place; a removal/reorder recreates the type
                // and casts the using columns over
                const added = appendedValues(before.values, enumDef.values);
                if (added) {
                    changes.push({ kind: 'alter-enum-add-values', enum: enumDef, added });
                } else {
                    changes.push({ kind: 'recreate-enum', enum: enumDef, columns: enumUsages(from, name) });
                }
            } else if (to.provider === 'mysql') {
                // MySQL enums are inline in the column type (`enum('A','B')`), so a value change
                // is lowered to a MODIFY COLUMN per using column — emitted after the table loop
                // below so any table/column renames have already run and the physical names
                // match. SQLite stores enums as plain text, so a value change needs no DDL.
                mysqlEnumsChanged.push(name);
            }
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

    // MySQL enum value changes: restate every using column with the new enum(...) via
    // MODIFY COLUMN (the alter-column path). Uses the `to` snapshot so names are post-rename
    // and defaults/nullability are the desired ones; the new enum values render from the
    // after snapshot at codegen/apply time. Skips columns diffTable already altered.
    for (const name of mysqlEnumsChanged) {
        for (const { table, column } of enumUsages(to, name)) {
            const alreadyAltered = changes.some(
                (c) => c.kind === 'alter-column' && c.table.name === table && c.to.name === column.name,
            );
            if (!alreadyAltered) {
                changes.push({ kind: 'alter-column', table: to.tables[table]!, from: column, to: column });
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

    // resolves a `to` column back to its source column in `from` (following a rename), if any
    const sourceOf = (name: string): string | undefined =>
        oldColumnOf.get(name) ?? (from.columns[name] ? name : undefined);

    // classify columns (added = brand new, dropped = removed and not renamed)
    const addedColumns = new Set(Object.keys(to.columns).filter((n) => !oldColumnOf.has(n) && !from.columns[n]));
    const droppedColumns = new Set(
        Object.keys(from.columns).filter((n) => !to.columns[n] && !renamedFromColumns.has(n)),
    );
    const { adds: fkAdds, drops: fkDrops } = diffForeignKeys(from, to, addedColumns, droppedColumns, provider);

    // SQLite can't alter/drop columns or add/drop constraints in place — rebuild the table
    // instead. A rebuild recreates the table in its desired shape and copies the carried-over
    // columns, so it also handles primary-key and foreign-key changes for free.
    const droppedFkColumn = [...droppedColumns].some((name) =>
        from.foreignKeys.some((fk) => fk.columns.includes(name)),
    );
    const alteredColumn = Object.entries(to.columns).some(([name, column]) => {
        const source = sourceOf(name);
        return source !== undefined && !columnsEqualIgnoringName(from.columns[source]!, column);
    });
    // the effective primary key — composite `@@id` columns, or the single `@id` column
    const fromPk = effectivePrimaryKey(from);
    const toPk = effectivePrimaryKey(to);
    const pkChanged = !arraysEqual(fromPk, toPk);
    const fkChanged = fkAdds.length > 0 || fkDrops.length > 0;
    if (provider === 'sqlite' && (droppedFkColumn || alteredColumn || pkChanged || fkChanged)) {
        return [{ kind: 'rebuild-table', table: to, copyColumns: rebuildCopyColumns(from, to, sourceOf) }];
    }

    const changes: SchemaChange[] = [];

    // drop foreign keys first — MySQL requires dropping the FK before its column (pg cascades,
    // and pg/sqlite exclude column-drop FKs from `fkDrops` anyway)
    for (const fk of fkDrops) {
        changes.push({ kind: 'drop-foreign-key', table: to, fk });
    }

    for (const [name, column] of Object.entries(to.columns)) {
        const renamedFrom = oldColumnOf.get(name);
        if (renamedFrom) {
            changes.push({ kind: 'rename-column', table: to, from: renamedFrom, column });
            // a rename may also change the column's type/nullability/default
            changes.push(...alterColumnChanges(from.columns[renamedFrom]!, column, to));
            continue;
        }
        const before = from.columns[name];
        if (!before) {
            // a single-column FK is added inline with the column on pg/sqlite; MySQL ignores
            // inline REFERENCES, so it gets a separate add-foreign-key below instead
            const fk = provider === 'mysql' ? undefined : singleColumnFk(to, name);
            changes.push({ kind: 'add-column', table: to, column, fk });
        } else {
            changes.push(...alterColumnChanges(before, column, to));
        }
    }
    for (const name of droppedColumns) {
        changes.push({ kind: 'drop-column', table: to, column: from.columns[name]! });
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

    // primary-key changes (pg/mysql; sqlite handles them via the rebuild above). A composite
    // `@@id` change or a single `@id` move is a drop + re-add of the constraint (like Prisma;
    // we can name the constraint deterministically, so it needs no manual step). Adding or
    // removing the primary key entirely is left manual.
    if (pkChanged) {
        if (fromPk.length > 0 && toPk.length > 0) {
            changes.push({ kind: 'drop-primary-key', table: to });
            changes.push({ kind: 'add-primary-key', table: to, columns: toPk });
        } else {
            changes.push({
                kind: 'unsupported',
                description: `primary key on table "${to.name}" changed and requires a manual migration`,
            });
        }
    }

    // add foreign keys last, once their columns exist (drops were emitted first, above)
    for (const fk of fkAdds) {
        changes.push({ kind: 'add-foreign-key', table: to, fk });
    }

    return changes;
}

/**
 * Diffs foreign keys by their (columns -> target) key, ignoring the constraint name so a
 * relation rename is a no-op. Single-column FKs on just-added/just-dropped columns are handled
 * inline by add-column / drop-column and excluded here. A change to `onDelete`/`onUpdate` is a
 * drop + re-add of the constraint.
 */
function diffForeignKeys(
    from: TableSnapshot,
    to: TableSnapshot,
    addedColumns: Set<string>,
    droppedColumns: Set<string>,
    provider: Snapshot['provider'],
): { adds: ForeignKeySnapshot[]; drops: ForeignKeySnapshot[] } {
    // pg/sqlite add/drop a single-column FK together with its column (inline reference / cascade
    // / rebuild); MySQL ignores inline references and blocks dropping an FK column, so those FKs
    // must be added/dropped explicitly.
    const inlineWithColumn = provider !== 'mysql';
    const fromByKey = new Map(from.foreignKeys.map((fk) => [fkKey(fk), fk]));
    const toByKey = new Map(to.foreignKeys.map((fk) => [fkKey(fk), fk]));
    const adds: ForeignKeySnapshot[] = [];
    const drops: ForeignKeySnapshot[] = [];

    for (const [key, fk] of toByKey) {
        if (inlineWithColumn && fk.columns.length === 1 && addedColumns.has(fk.columns[0]!)) {
            continue; // added inline with its column
        }
        const before = fromByKey.get(key);
        if (!before) {
            adds.push(fk);
        } else if (before.onDelete !== fk.onDelete || before.onUpdate !== fk.onUpdate) {
            drops.push(before);
            adds.push(fk);
        }
    }
    for (const [key, fk] of fromByKey) {
        if (inlineWithColumn && fk.columns.length === 1 && droppedColumns.has(fk.columns[0]!)) {
            continue; // removed together with its column
        }
        if (!toByKey.has(key)) {
            drops.push(fk);
        }
    }
    return { adds, drops };
}

/**
 * Diffs two versions of a column (ignoring name). Returns an `alter-column` for an in-place
 * change of type/nullability/default, nothing when unchanged, or `unsupported` when the change
 * touches structural aspects we don't automate (array-ness, auto-increment, primary key).
 */
function alterColumnChanges(from: ColumnSnapshot, to: ColumnSnapshot, table: TableSnapshot): SchemaChange[] {
    if (columnsEqualIgnoringName(from, to)) {
        return [];
    }
    if (isSimpleColumnAlter(from, to)) {
        return [{ kind: 'alter-column', table, from, to }];
    }
    return [
        {
            kind: 'unsupported',
            description: `column "${table.name}.${to.name}" changed in a way that requires a manual migration`,
        },
    ];
}

/** Whether a column change only involves type/nullability/default (safe to `ALTER`). */
function isSimpleColumnAlter(from: ColumnSnapshot, to: ColumnSnapshot): boolean {
    // `primaryKey` is handled by the primary-key diff, not as a column alteration
    return from.array === to.array && from.autoIncrement === to.autoIncrement;
}

/** The effective primary-key columns: composite `@@id` columns, or the single `@id` column. */
function effectivePrimaryKey(table: TableSnapshot): string[] {
    if (table.primaryKey.length > 0) {
        return table.primaryKey;
    }
    return Object.values(table.columns)
        .filter((c) => c.primaryKey)
        .map((c) => c.name);
}

/** Columns to copy during a SQLite table rebuild, mapping each new column to its source (honoring renames). */
function rebuildCopyColumns(
    from: TableSnapshot,
    to: TableSnapshot,
    sourceOf: (name: string) => string | undefined,
): ColumnCopy[] {
    const copies: ColumnCopy[] = [];
    for (const target of Object.keys(to.columns)) {
        const source = sourceOf(target);
        if (source && from.columns[source]) {
            copies.push({ target, source });
        }
    }
    return copies;
}

/** If `to` is `from` with values appended (a safe in-place enum extension), returns the appended values. */
function appendedValues(from: readonly string[], to: readonly string[]): string[] | undefined {
    if (to.length <= from.length) {
        return undefined;
    }
    for (let i = 0; i < from.length; i++) {
        if (from[i] !== to[i]) {
            return undefined;
        }
    }
    return to.slice(from.length);
}

/** All columns typed with the given enum across the snapshot's tables. */
function enumUsages(snapshot: Snapshot, enumName: string): EnumColumnUsage[] {
    const usages: EnumColumnUsage[] = [];
    for (const table of Object.values(snapshot.tables)) {
        for (const column of Object.values(table.columns)) {
            if (column.isEnum && column.type === enumName) {
                usages.push({ table: table.name, column });
            }
        }
    }
    return usages;
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

/**
 * Compares two columns ignoring their name and `primaryKey` flag — used to detect whether a
 * column was altered. The primary key is compared separately (a single-`@id` move shows up as
 * a `primaryKey` flag flip, which is handled by the primary-key diff, not as a column alter).
 */
function columnsEqualIgnoringName(a: ColumnSnapshot, b: ColumnSnapshot): boolean {
    return columnsEqual({ ...a, name: '', primaryKey: false }, { ...b, name: '', primaryKey: false });
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

// #endregion
