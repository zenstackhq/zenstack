import { fileURLToPath } from 'node:url';
import { ZenStackClient, type ClientContract } from '@zenstackhq/orm';
import { SqliteDialect } from '@zenstackhq/orm/dialects/sqlite';
import { sql } from '@zenstackhq/orm/helpers';
import SQLite from 'better-sqlite3';
import { schema, type SchemaType } from '../zenstack/schema';

/**
 * The SQLite file is created by `zen db push` next to the schema (the migration
 * engine resolves `file:./taskforge.db` relative to the schema directory).
 * Resolve it as an absolute path so the runtime opens the same file regardless
 * of the current working directory.
 */
const databaseFile = fileURLToPath(
    new URL('../zenstack/taskforge.db', import.meta.url),
);

/** Explicit, fully-inferred client type for use in function signatures. */
export type DB = ClientContract<SchemaType>;

export function createClient(): DB {
    return new ZenStackClient(schema, {
        dialect: new SqliteDialect({
            database: new SQLite(databaseFile),
        }),
        // Implementations for the `@computed` fields declared in the ZModel schema.
        // Each is a Kysely sub-query correlated to the owning row via `whereRef`.
        computedFields: {
            project: {
                openIssueCount: (eb, { modelAlias }) =>
                    eb
                        .selectFrom('Issue')
                        .whereRef(
                            'Issue.projectId',
                            '=',
                            sql.ref(`${modelAlias}.id`),
                        )
                        .where('Issue.status', 'not in', ['DONE', 'CANCELED'])
                        .select(({ fn }) => fn.countAll<number>().as('c')),
            },
            issue: {
                commentCount: (eb, { modelAlias }) =>
                    eb
                        .selectFrom('Comment')
                        .whereRef(
                            'Comment.issueId',
                            '=',
                            sql.ref(`${modelAlias}.id`),
                        )
                        .select(({ fn }) => fn.countAll<number>().as('c')),
            },
        },
    });
}

/** Shared client instance used by the CLI. */
export const db: DB = createClient();
