import type { ClientContract } from '@zenstackhq/orm';
import fs from 'node:fs';
import path from 'node:path';
import type { Migration, MigrationProvider } from 'kysely/migration';
import type { MigrationModule } from './types';

/** Minimal shape of the module loader used to import `migration.ts` files. */
export interface ModuleImporter {
    import(id: string): Promise<unknown>;
}

/**
 * A Kysely {@link MigrationProvider} backed by ZenStack's on-disk migration folders.
 *
 * Each migration is a folder under the migrations directory containing a `migration.ts`
 * that exports `migrate`. The provider wraps it into a Kysely `up`, passing the ZenStack
 * client's Kysely query builder.
 *
 * Down migrations are intentionally not supported (ZenStack favors roll-forward).
 */
export class ZenStackMigrationProvider implements MigrationProvider {
    constructor(
        private readonly migrationsDir: string,
        private readonly importer: ModuleImporter,
        private readonly client: ClientContract<any>,
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
                throw new Error(`Migration "${name}" does not export a "migrate" function`);
            }
            migrations[name] = {
                // Kysely's migrator drives ordering/locking/tracking; `migrate` runs against
                // the ZenStack client's Kysely query builder (same underlying connection).
                up: async () => {
                    await mod.migrate(this.client.$qb);
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
