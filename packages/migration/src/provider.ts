import type { Kysely } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely/migration';
import fs from 'node:fs';
import path from 'node:path';
import { MigrationError, MigrationErrorReason } from './error';
import type { MigrationModule } from './types';

/** Minimal shape of the module loader used to import `migration.ts` files. */
export interface ModuleImporter {
    import(id: string): Promise<unknown>;
}

/**
 * A Kysely {@link MigrationProvider} backed by ZenStack's on-disk migration folders.
 *
 * Each migration is a folder under the migrations directory containing a `migration.ts`
 * that exports `migrate`. The provider wraps it into a Kysely `up`, passing the Kysely
 * instance (physical table/column names, no ORM name mapping).
 *
 * Down migrations are intentionally not supported (ZenStack favors roll-forward).
 */
export class ZenStackMigrationProvider implements MigrationProvider {
    constructor(
        private readonly migrationsDir: string,
        private readonly importer: ModuleImporter,
    ) {}

    async getMigrations(): Promise<Record<string, Migration>> {
        const migrations: Record<string, Migration> = {};
        if (!fs.existsSync(this.migrationsDir)) {
            return migrations;
        }

        const folders = fs
            .readdirSync(this.migrationsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            // Kysely applies migrations in the (locale-independent) sorted order of these keys
            .sort();

        for (const name of folders) {
            const file = path.join(this.migrationsDir, name, 'migration.ts');
            if (!fs.existsSync(file)) {
                continue;
            }
            const mod = normalizeModule(await this.importer.import(file));
            if (typeof mod.migrate !== 'function') {
                const error = new MigrationError(
                    MigrationErrorReason.INVALID_MIGRATION,
                    `Migration "${name}" does not export a "migrate" function`,
                );
                error.migration = name;
                throw error;
            }
            migrations[name] = {
                // `migrate` must run on the Kysely instance the migrator passes in — it's the
                // migrator's dedicated connection (and, on transactional-DDL dialects, its
                // transaction). Using any other instance deadlocks single-connection dialects
                // like better-sqlite3.
                up: async (db: Kysely<any>) => {
                    await mod.migrate(db);
                },
            };
        }

        return migrations;
    }
}

function normalizeModule(mod: unknown): MigrationModule {
    const m = mod as { default?: MigrationModule } & MigrationModule;
    // support both ESM namespace and interop default
    if (m && typeof m.migrate !== 'function' && m.default && typeof m.default.migrate === 'function') {
        return m.default;
    }
    return m;
}
