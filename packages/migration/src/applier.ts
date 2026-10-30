import type { DataSourceProviderType } from '@zenstackhq/schema';
import { sql, type Kysely } from 'kysely';
import { generateMigrateBody } from './codegen';
import type { SchemaChange } from './diff';
import type { Snapshot } from './types';

type Provider = DataSourceProviderType;

/**
 * Executes a list of {@link SchemaChange}s directly against a Kysely instance — the runtime
 * counterpart of the migration-file codegen, used by `db push` to reconcile a live database
 * to the desired schema.
 *
 * Rather than maintaining a second lowering of every change kind, this *evaluates* the same
 * statements the codegen would write into a `migration.ts` (generated in lenient mode, so
 * drops tolerate a partially matching database). `db push` therefore performs exactly what
 * `migrate dev` + `deploy` would, by construction.
 *
 * `snapshot` is the desired schema (provides column type/constraint details for creates and
 * additions). Unsupported changes are skipped (they only render as comments).
 */
export async function applyChanges(
    db: Kysely<any>,
    changes: SchemaChange[],
    snapshot: Snapshot,
    provider: Provider,
): Promise<void> {
    const body = generateMigrateBody(changes, provider, snapshot, { lenient: true });
    // the generated statements are plain JS referencing only `db` and `sql`
    const run = new Function(
        'db',
        'sql',
        `return (async () => {\n${body}\n//# sourceURL=zenstack-db-push.js\n})();`,
    ) as (db: Kysely<any>, sqlTag: typeof sql) => Promise<void>;
    await run(db, sql);
}
