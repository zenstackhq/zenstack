import type { Snapshot } from './types';

export type MaybePromise<T> = T | Promise<T>;

/** A single rename: the pre-existing (old) name and the new name it maps to. */
export interface RenameMapping {
    /** The pre-existing (old) physical name. */
    from: string;
    /** The new physical name it was renamed to. */
    to: string;
}

/** The set of ambiguous table changes presented to a {@link RenameResolver}. */
export interface TableRenameQuery {
    /** Tables present in the new schema but not the old one (candidates for rename targets). */
    created: string[];
    /** Tables present in the old schema but not the new one (candidates for rename sources). */
    deleted: string[];
}

/** The set of ambiguous column changes (within one table) presented to a {@link RenameResolver}. */
export interface ColumnRenameQuery {
    /** Physical table name (already resolved through any table rename). */
    table: string;
    /** Columns present in the new schema but not the old one. */
    created: string[];
    /** Columns present in the old schema but not the new one. */
    deleted: string[];
}

/**
 * Disambiguates "a thing disappeared and another appeared" into either a rename (data
 * preserved) or an unrelated drop + create (data lost).
 *
 * Both hooks receive the created/deleted sets and return the subset that are renames as
 * `{ from, to }` pairs. Anything not returned is treated as an independent create/drop.
 * A missing hook (or one returning `[]`) means "no renames" — the default drop + create
 * behavior, which is what non-interactive/CI runs should do.
 */
export interface RenameResolver {
    resolveTableRenames?(query: TableRenameQuery): MaybePromise<RenameMapping[]>;
    resolveColumnRenames?(query: ColumnRenameQuery): MaybePromise<RenameMapping[]>;
}

/** The resolved rename decisions consumed by the snapshot diff. */
export interface RenamePlan {
    /** Table renames (old table name -> new table name). */
    tables: RenameMapping[];
    /** Column renames keyed by the *new* table name (old column name -> new column name). */
    columns: Record<string, RenameMapping[]>;
}

export const EMPTY_RENAME_PLAN: RenamePlan = { tables: [], columns: {} };

/**
 * Computes a {@link RenamePlan} by detecting the ambiguous add/drop pairs between two
 * snapshots and asking the `resolver` to disambiguate them. With no resolver, returns an
 * empty plan (everything stays a drop + create).
 */
export async function resolveRenames(
    from: Snapshot,
    to: Snapshot,
    resolver?: RenameResolver,
): Promise<RenamePlan> {
    if (!resolver) {
        return EMPTY_RENAME_PLAN;
    }

    const plan: RenamePlan = { tables: [], columns: {} };

    // table renames
    const deletedTables = Object.keys(from.tables).filter((name) => !to.tables[name]);
    const createdTables = Object.keys(to.tables).filter((name) => !from.tables[name]);
    if (resolver.resolveTableRenames && deletedTables.length > 0 && createdTables.length > 0) {
        const mappings = await resolver.resolveTableRenames({ created: createdTables, deleted: deletedTables });
        plan.tables = sanitize(mappings, deletedTables, createdTables);
    }

    // column renames, computed per corresponding table (following any table rename)
    const oldTableOf = new Map(plan.tables.map((m) => [m.to, m.from]));
    for (const [toName, toTable] of Object.entries(to.tables)) {
        const fromName = oldTableOf.get(toName) ?? (from.tables[toName] ? toName : undefined);
        if (!fromName) {
            continue; // a brand-new table — nothing to rename from
        }
        const fromTable = from.tables[fromName]!;
        const deletedCols = Object.keys(fromTable.columns).filter((c) => !toTable.columns[c]);
        const createdCols = Object.keys(toTable.columns).filter((c) => !fromTable.columns[c]);
        if (resolver.resolveColumnRenames && deletedCols.length > 0 && createdCols.length > 0) {
            const mappings = await resolver.resolveColumnRenames({
                table: toName,
                created: createdCols,
                deleted: deletedCols,
            });
            const clean = sanitize(mappings, deletedCols, createdCols);
            if (clean.length > 0) {
                plan.columns[toName] = clean;
            }
        }
    }

    return plan;
}

/** Keeps only valid, de-duplicated mappings: `from` ∈ deleted, `to` ∈ created, each used once. */
function sanitize(mappings: RenameMapping[], deleted: string[], created: string[]): RenameMapping[] {
    const del = new Set(deleted);
    const cre = new Set(created);
    const usedFrom = new Set<string>();
    const usedTo = new Set<string>();
    const out: RenameMapping[] = [];
    for (const m of mappings) {
        if (del.has(m.from) && cre.has(m.to) && !usedFrom.has(m.from) && !usedTo.has(m.to)) {
            out.push(m);
            usedFrom.add(m.from);
            usedTo.add(m.to);
        }
    }
    return out;
}
