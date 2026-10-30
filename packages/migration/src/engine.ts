import type { DataSourceProviderType, SchemaDef } from '@zenstackhq/schema';
import { createJiti } from 'jiti';
import { sql, type Kysely } from 'kysely';
import { Migrator, type MigrationResultSet } from 'kysely/migration';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { applyChanges } from './applier';
import { MIGRATION_LOCK_TABLE, MIGRATION_TABLE } from './conventions';
import { dataLossWarnings, filterDataLossRisks, type ConfirmDataLossCallback } from './data-loss';
import { diffSnapshots, type SchemaChange } from './diff';
import { MigrationError, MigrationErrorReason } from './error';
import { createKysely } from './kysely-factory';
import { ZenStackMigrationProvider, type ModuleImporter } from './provider';
import { providerTraits } from './provider-traits';
import { diffForPush, introspectCurrentState } from './push';
import { resolveRenames, type RenameResolver } from './rename';
import { buildSnapshot, emptySnapshot, parseSnapshot } from './snapshot';
import type { Snapshot } from './types';
import { writeMigrationFolder } from './writer';

/**
 * Options for configuring the migration engine.
 */
export interface MigrationEngineOptions {
    /** The compiled schema — the current desired state. */
    schema: SchemaDef;

    /** Absolute path of the directory holding migration folders. */
    migrationsDir: string;

    /** Database connection URL. Relative SQLite `file:` paths resolve against the current working directory. */
    connectionUrl: string;

    /**
     * Optional loader for user-authored `migration.ts` files. Defaults to a jiti-based
     * importer that can load TypeScript directly; override for custom runtimes.
     */
    importer?: ModuleImporter;

    /**
     * Optional resolver that disambiguates drop + create pairs into data-preserving renames
     * during {@link MigrationEngine.generate}. Omit for the default (everything is drop + create).
     */
    resolver?: RenameResolver;

    /**
     * Invoked before writing a migration containing destructive changes; return `false` to
     * abort. When omitted, migrations generate without confirmation.
     */
    confirmDataLoss?: ConfirmDataLossCallback;

    /**
     * Skip the verification that refuses to deploy when an already-applied migration's
     * `migration.ts` was edited (checksum mismatch). On a successful deploy the edited
     * files' checksums are re-recorded as canonical, so subsequent deploys without this
     * option succeed. Use with care — already-applied migrations are not re-run, so the
     * database may no longer match what the edited files describe.
     */
    ignoreChecksumMismatch?: boolean;

    /** Clock, injectable for deterministic tests. */
    now?: () => Date;
}

/**
 * Result of generating a new migration.
 */
export interface GenerateResult {
    /**
     * Whether a new migration was created.
     */
    created: boolean;

    /**
     * Directory of the newly created migration, if any.
     */
    dir?: string;

    /**
     * Name of the newly created migration, if any.
     */
    name?: string;

    /**
     * Schema changes detected between the previous and current snapshots.
     */
    changes: SchemaChange[];

    /**
     * Data-loss warnings for the generated changes (`[]` when none).
     */
    warnings: string[];

    /**
     * True when `confirmDataLoss` declined the migration and nothing was written.
     */
    aborted?: boolean;
}

/**
 * Options for {@link MigrationEngine.push}.
 */
export interface PushOptions {
    /**
     * Allow applying data-loss changes (dropping tables/columns). When not set, a push
     * containing destructive changes is aborted before applying anything.
     */
    acceptDataLoss?: boolean;

    /** Drop all tables first and recreate the database from scratch. */
    forceReset?: boolean;
}

export interface PushResult {
    /** Whether the push was aborted before applying anything (due to unaccepted data loss). */
    aborted: boolean;

    /** Changes that were applied. */
    applied: SchemaChange[];

    /** Descriptions of data-loss changes that were applied. */
    dataLoss: string[];

    /** Descriptions of data-loss changes that blocked the push (when data loss was not accepted). */
    blocked: string[];
}

/**
 * Result of {@link MigrationEngine.deploy} / {@link MigrationEngine.reset}: Kysely's
 * migration result set plus checksum-verification information.
 */
export interface DeployResult extends MigrationResultSet {
    /**
     * Previously-applied migrations that had no recorded checksum before this run (e.g. an
     * earlier deploy was interrupted before checksums were recorded). On a successful run
     * their current file content is adopted as the checksum — it cannot be verified against
     * what was actually applied.
     */
    unverified: string[];
}

/**
 * Status of a single migration, as reported by {@link MigrationEngine.status}.
 */
export interface MigrationStatus {
    name: string;

    applied: boolean;

    /** True when the migration is applied but has no recorded checksum to verify against. */
    unverified?: boolean;
}

/**
 * ZenStack's native migration engine: diffs schema snapshots to author migrations and
 * runs them with Kysely's {@link Migrator}.
 */
export class MigrationEngine {
    constructor(private readonly options: MigrationEngineOptions) {}

    private get provider(): DataSourceProviderType {
        return this.options.schema.provider.type;
    }

    private get traits() {
        return providerTraits(this.provider);
    }

    /**
     * Diffs the latest recorded snapshot against the current schema and, if anything
     * changed, writes a new migration folder. Does not apply the migration.
     */
    async generate(name: string): Promise<GenerateResult> {
        const before = this.readLatestSnapshot();
        const after = buildSnapshot(this.options.schema);
        const renamePlan = await resolveRenames(before, after, this.options.resolver);
        const changes = diffSnapshots(before, after, renamePlan);

        if (changes.length === 0) {
            return { created: false, changes, warnings: [] };
        }

        let risks = dataLossWarnings(before, after, changes, renamePlan);
        // only touch the database when there's both something destructive and someone to ask —
        // the hook-absent path must stay connection-free
        if (risks.length > 0 && this.options.confirmDataLoss) {
            const db = await createKysely(this.provider, this.options.connectionUrl);
            try {
                risks = await filterDataLossRisks(db, risks);
            } finally {
                await db.destroy();
            }
            if (risks.length > 0) {
                const ok = await this.options.confirmDataLoss(risks.map((r) => r.message));
                if (!ok) {
                    return { created: false, aborted: true, changes, warnings: risks.map((r) => r.message) };
                }
            }
        }

        const folderName = `${this.timestamp()}_${slugify(name)}`;
        const dir = path.join(this.options.migrationsDir, folderName);
        writeMigrationFolder({ dir, changes, after });

        return { created: true, dir, name: folderName, changes, warnings: risks.map((r) => r.message) };
    }

    /**
     * State-based sync: introspects the live database and applies the DDL needed to make
     * it match the schema, without creating migration files or history. For prototyping.
     *
     * Data-loss changes (dropping tables/columns) are only applied when `acceptDataLoss`
     * is set; otherwise the push is aborted before applying anything.
     */
    async push(options?: PushOptions): Promise<PushResult> {
        const desired = buildSnapshot(this.options.schema);
        const acceptDataLoss = !!options?.acceptDataLoss;
        const db = await createKysely(this.provider, this.options.connectionUrl);
        try {
            if (options?.forceReset) {
                // drop everything first, then recreate from scratch
                await this.dropAllTables(db);
            }
            const current = await introspectCurrentState(this.options.connectionUrl, this.provider);
            const { changes, dataLoss, blocked } = diffForPush(current, desired, acceptDataLoss);

            if (blocked.length > 0) {
                // don't apply anything destructive without consent
                return { aborted: true, applied: [], dataLoss: [], blocked };
            }

            if (changes.length > 0) {
                await this.applyChangesTransactionally(db, changes, desired);
            }
            return { aborted: false, applied: changes, dataLoss, blocked: [] };
        } finally {
            await db.destroy();
        }
    }

    /**
     * Runs {@link applyChanges} inside a transaction so a failed push leaves the database
     * untouched (PostgreSQL/SQLite; MySQL DDL auto-commits each statement, so partial
     * application remains possible there). SQLite's `PRAGMA foreign_keys` is a no-op inside
     * a transaction, so enforcement is toggled out here for the table rebuilds
     * {@link applyChanges} may perform.
     */
    private async applyChangesTransactionally(db: Kysely<any>, changes: SchemaChange[], desired: Snapshot) {
        // table rebuilds need FK enforcement off, toggled outside the transaction
        const fkToggle = this.traits.rebuildTableForAlters ? this.traits.fkToggle : undefined;
        if (fkToggle) {
            await sql.raw(fkToggle.off).execute(db);
        }
        try {
            await db.transaction().execute((trx) => applyChanges(trx, changes, desired, this.provider));
        } finally {
            if (fkToggle) {
                await sql.raw(fkToggle.on).execute(db);
            }
        }
    }

    /** Applies all pending migrations using Kysely's migrator. */
    async deploy(): Promise<DeployResult> {
        const db = await createKysely(this.provider, this.options.connectionUrl);
        try {
            await this.ensureMigrationTable(db);
            const rows = await this.readMigrationRows(db);
            const ignoreMismatch = !!this.options.ignoreChecksumMismatch;
            if (!ignoreMismatch) {
                // refuse to proceed if a previously-applied migration was edited
                const modified = this.findModifiedMigration(rows);
                if (modified) {
                    const error = new MigrationError(
                        MigrationErrorReason.MIGRATION_MODIFIED,
                        migrationModifiedMessage(modified),
                    );
                    error.migration = modified;
                    return { error, unverified: [] };
                }
            }
            // applied earlier but never checksummed (an interrupted deploy) — the backfill
            // below adopts their current content without being able to verify it
            const unverified = rows.filter((r) => !r.checksum).map((r) => r.name);
            const result = await this.createMigrator(db).migrateToLatest();
            if (!result.error) {
                // when mismatches are ignored, adopt the edited files as canonical so
                // subsequent deploys without the option succeed
                await this.recordChecksums(db, ignoreMismatch);
            }
            return { ...result, unverified };
        } finally {
            await db.destroy();
        }
    }

    /** Returns the status of each migration (applied / pending / applied-but-unverified). */
    async status(): Promise<MigrationStatus[]> {
        const db = await createKysely(this.provider, this.options.connectionUrl);
        try {
            const migrations = await this.createMigrator(db).getMigrations();
            const checksums = new Map((await this.readMigrationRows(db)).map((r) => [r.name, r.checksum]));
            return migrations.map((m) => {
                const applied = !!m.executedAt;
                return applied && !checksums.get(m.name)
                    ? { name: m.name, applied, unverified: true }
                    : { name: m.name, applied };
            });
        } finally {
            await db.destroy();
        }
    }

    /**
     * Drops all tables in the database and re-applies every migration from scratch.
     * Development only — all data is lost.
     */
    async reset(): Promise<DeployResult> {
        const db = await createKysely(this.provider, this.options.connectionUrl);
        try {
            await this.dropAllTables(db);
            // recreate the tracking table before the migrator does (it wouldn't add the checksum column)
            await this.ensureMigrationTable(db);
            const result = await this.createMigrator(db).migrateToLatest();
            if (!result.error) {
                await this.recordChecksums(db);
            }
            // the history was rebuilt from scratch, so nothing predates its checksum
            return { ...result, unverified: [] };
        } finally {
            await db.destroy();
        }
    }

    /**
     * Adopts an existing database (e.g. one built by Prisma migrate) into the native
     * migration system: writes a single migration capturing the current schema state and
     * marks it applied **without running it**, so future `generate`/`deploy` diff forward
     * from here instead of trying to recreate existing tables.
     *
     * Only valid on an empty migrations directory.
     */
    async baseline(name = 'baseline'): Promise<GenerateResult> {
        if (this.hasMigrations()) {
            throw new MigrationError(
                MigrationErrorReason.INVALID_STATE,
                'Cannot baseline: the migrations directory already contains migrations.',
            );
        }
        const result = await this.generate(name);
        if (result.created && result.name) {
            await this.resolveApplied(result.name);
        }
        return result;
    }

    /**
     * Marks a migration as already applied in the tracking table without executing it
     * (the equivalent of `prisma migrate resolve --applied`). Used for baselining and to
     * recover a partially-applied/failed migration by rolling it forward manually.
     */
    async resolveApplied(name: string): Promise<void> {
        const db = await createKysely(this.provider, this.options.connectionUrl);
        try {
            await this.ensureMigrationTable(db);
            const already = await db
                .selectFrom(MIGRATION_TABLE)
                .select('name')
                .where('name', '=', name)
                .executeTakeFirst();
            if (already) {
                return; // idempotent
            }
            const timestamp = (this.options.now?.() ?? new Date()).toISOString();
            await db
                .insertInto(MIGRATION_TABLE)
                .values({ name, timestamp, checksum: this.migrationChecksum(name) })
                .execute();
        } finally {
            await db.destroy();
        }
    }

    /**
     * Creates the migration tracking table (name/timestamp/checksum) if needed. The
     * `checksum` column is added as a separate DDL because Kysely's migrator may have
     * already created the base table (name/timestamp only).
     */
    private async ensureMigrationTable(db: Kysely<any>): Promise<void> {
        await db.schema
            .createTable(MIGRATION_TABLE)
            .ifNotExists()
            .addColumn('name', 'varchar(255)', (col) => col.notNull().primaryKey())
            .addColumn('timestamp', 'varchar(255)', (col) => col.notNull())
            .execute();
        // SQLite and MySQL lack `ADD COLUMN IF NOT EXISTS`, so guard via introspection
        const table = (await db.introspection.getTables()).find((t) => t.name === MIGRATION_TABLE);
        if (table && !table.columns.some((c) => c.name === 'checksum')) {
            await db.schema.alterTable(MIGRATION_TABLE).addColumn('checksum', 'varchar(64)').execute();
        }
    }

    /** SHA-256 of a migration's `migration.ts`, or undefined if the file is missing. */
    private migrationChecksum(name: string): string | undefined {
        const file = path.join(this.options.migrationsDir, name, 'migration.ts');
        if (!fs.existsSync(file)) {
            return undefined;
        }
        return crypto.createHash('sha256').update(fs.readFileSync(file, 'utf-8')).digest('hex');
    }

    /**
     * Reads name/checksum rows from the tracking table, or `[]` when the table doesn't
     * exist yet or predates the checksum column.
     */
    private async readMigrationRows(db: Kysely<any>): Promise<Array<{ name: string; checksum: string | null }>> {
        const table = (await db.introspection.getTables()).find((t) => t.name === MIGRATION_TABLE);
        if (!table || !table.columns.some((c) => c.name === 'checksum')) {
            return [];
        }
        return (await db.selectFrom(MIGRATION_TABLE).select(['name', 'checksum']).execute()) as Array<{
            name: string;
            checksum: string | null;
        }>;
    }

    /** Returns the name of the first applied migration whose `migration.ts` no longer matches its recorded checksum. */
    private findModifiedMigration(rows: Array<{ name: string; checksum: string | null }>): string | undefined {
        for (const row of rows) {
            if (!row.checksum) {
                // not recorded yet — the migrator inserts rows without a checksum, and a failed
                // deploy can end before recordChecksums backfills them; surfaced to the caller
                // via `DeployResult.unverified` / `MigrationStatus.unverified`
                continue;
            }
            const actual = this.migrationChecksum(row.name);
            // a missing file is reported separately by Kysely as a corrupt migration
            if (actual !== undefined && actual !== row.checksum) {
                return row.name;
            }
        }
        return undefined;
    }

    /**
     * Records checksums for applied migrations that don't have one yet. With
     * `overwriteModified`, stale checksums of edited migrations are also re-recorded
     * from the files' current content (used when checksum mismatches are ignored).
     */
    private async recordChecksums(db: Kysely<any>, overwriteModified = false): Promise<void> {
        const rows = await db.selectFrom(MIGRATION_TABLE).select(['name', 'checksum']).execute();
        for (const row of rows as Array<{ name: string; checksum: string | null }>) {
            const checksum = this.migrationChecksum(row.name);
            if (checksum === undefined || checksum === row.checksum) {
                continue;
            }
            if (!row.checksum || overwriteModified) {
                await db.updateTable(MIGRATION_TABLE).set({ checksum }).where('name', '=', row.name).execute();
            }
        }
    }

    /** Whether the migrations directory contains at least one migration (a folder with a snapshot). */
    private hasMigrations(): boolean {
        const dir = this.options.migrationsDir;
        if (!fs.existsSync(dir)) {
            return false;
        }
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .some((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'snapshot.json')));
    }

    private async dropAllTables(db: Kysely<any>): Promise<void> {
        const { fkToggle, dropTableCascade } = this.traits;
        if (fkToggle) {
            await sql.raw(fkToggle.off).execute(db);
        }

        const tables = await db.introspection.getTables();
        for (const table of tables) {
            let builder = db.schema.dropTable(table.name).ifExists();
            if (dropTableCascade) {
                builder = builder.cascade();
            }
            await builder.execute();
        }

        if (fkToggle) {
            await sql.raw(fkToggle.on).execute(db);
        }
    }

    private createMigrator(db: Kysely<any>): Migrator {
        return new Migrator({
            db,
            provider: new ZenStackMigrationProvider(
                this.options.migrationsDir,
                this.options.importer ?? defaultImporter(),
            ),
            migrationTableName: MIGRATION_TABLE,
            migrationLockTableName: MIGRATION_LOCK_TABLE,
        });
    }

    /** Reads the snapshot of the most recent migration folder, or an empty snapshot. */
    private readLatestSnapshot(): Snapshot {
        const dir = this.options.migrationsDir;
        if (!fs.existsSync(dir)) {
            return emptySnapshot(this.provider);
        }
        const folders = fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'snapshot.json')))
            .map((e) => e.name)
            .sort();
        const latest = folders[folders.length - 1];
        if (!latest) {
            return emptySnapshot(this.provider);
        }
        return parseSnapshot(fs.readFileSync(path.join(dir, latest, 'snapshot.json'), 'utf-8'));
    }

    private timestamp(): string {
        const d = this.options.now?.() ?? new Date();
        const pad = (n: number, w = 2) => String(n).padStart(w, '0');
        return (
            `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
            `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
        );
    }
}

// shared across engines — jiti keeps a transpilation cache worth reusing
let jiti: ReturnType<typeof createJiti> | undefined;

/** The default `migration.ts` loader: jiti, which imports TypeScript directly. */
function defaultImporter(): ModuleImporter {
    // works in both the CJS and ESM builds
    const fileUrl = typeof __filename !== 'undefined' ? __filename : import.meta.url;
    jiti ??= createJiti(fileUrl);
    return { import: (id) => jiti!.import(id) };
}

function migrationModifiedMessage(name: string): string {
    return (
        `Migration "${name}" was modified after it was applied (checksum mismatch). ` +
        `Revert the change to its migration.ts, or run "migrate reset" to rebuild the database from the current migrations.`
    );
}

function slugify(name: string): string {
    return (
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'migration'
    );
}
