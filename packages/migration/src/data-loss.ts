import { sql, type Kysely } from 'kysely';
import type { SchemaChange } from './diff';
import type { Snapshot } from './types';

/** A single data-loss (or destructive) risk detected while diffing. */
export interface DataLossRisk {
    message: string;
    /** Physical table to probe for at-risk data (absent for risks that can't be probed). */
    table?: string;
    /** Column to probe (non-null check); absent means "any row in the table". */
    column?: string;
}

/**
 * A hook invoked before writing a migration that contains destructive changes. Receives
 * human-readable warning messages; return `false` to abort the migration.
 */
export type ConfirmDataLossCallback = (warnings: string[]) => boolean | Promise<boolean>;

/**
 * Scans a set of schema changes (plus the snapshots they were diffed from) for changes that
 * can destroy data: dropped tables/columns, columns lost in a SQLite table rebuild, and enum
 * value removals (which fail the migration if rows still use the removed values).
 */
export function dataLossWarnings(from: Snapshot, to: Snapshot, changes: SchemaChange[]): DataLossRisk[] {
    const risks: DataLossRisk[] = [];

    for (const change of changes) {
        switch (change.kind) {
            case 'drop-table':
                risks.push({
                    message: `table "${change.table.name}" will be dropped (all its rows will be lost)`,
                    table: change.table.name,
                });
                break;

            case 'drop-column':
                risks.push({
                    message: `column "${change.table.name}.${change.column.name}" will be dropped (its data will be lost)`,
                    table: change.table.name,
                    column: change.column.name,
                });
                break;

            case 'rebuild-table': {
                // a SQLite rebuild only copies `copyColumns` — anything else in the old table is lost
                const before = from.tables[change.table.name];
                if (!before) {
                    break;
                }
                const copied = new Set(change.copyColumns.map((c) => c.source));
                for (const column of Object.values(before.columns)) {
                    if (!copied.has(column.name)) {
                        risks.push({
                            message: `column "${change.table.name}.${column.name}" will be dropped (its data will be lost)`,
                            table: change.table.name,
                            column: column.name,
                        });
                    }
                }
                break;
            }

            default:
                break;
        }
    }

    // Enum value removals are compared straight from the snapshots: providers lower them to
    // different change kinds (pg: recreate-enum, MySQL: alter-column with from === to), so the
    // change list isn't a reliable signal. SQLite stores enums as plain text (no enforcement,
    // and the diff emits nothing), so it's skipped.
    if (to.provider !== 'sqlite') {
        for (const [name, before] of Object.entries(from.enums)) {
            const after = to.enums[name];
            if (!after) {
                continue; // drop-enum: any using column surfaces as its own change
            }
            const removed = before.values.filter((v) => !after.values.includes(v));
            if (removed.length > 0) {
                risks.push({
                    message: `values [${removed.join(', ')}] will be removed from enum "${name}" (the migration will fail if rows still use them)`,
                });
            }
        }
    }

    return risks;
}

/**
 * Data-aware filtering of {@link dataLossWarnings}: probes the live database and drops risks
 * that provably affect no rows (empty table / all-null column). Fail-safe — any probe error
 * (missing table/column, e.g. pending un-applied migrations) keeps the risk. Risks without a
 * `table` (enum value removals) are always kept.
 */
export async function filterDataLossRisks(db: Kysely<any>, risks: DataLossRisk[]): Promise<DataLossRisk[]> {
    const kept: DataLossRisk[] = [];
    for (const risk of risks) {
        if (!risk.table) {
            kept.push(risk);
            continue;
        }
        try {
            let query = db
                .selectFrom(risk.table)
                .select(sql`1`.as('x'))
                .limit(1);
            if (risk.column) {
                query = query.where(db.dynamic.ref(risk.column), 'is not', null);
            }
            const row = await query.executeTakeFirst();
            if (row !== undefined) {
                kept.push(risk); // at least one row is at risk
            }
        } catch {
            // can't verify (table/column may not exist yet) — keep the warning
            kept.push(risk);
        }
    }
    return kept;
}
