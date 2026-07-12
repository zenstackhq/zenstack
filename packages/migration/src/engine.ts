import { ZenStackClient, type ClientContract } from '@zenstackhq/orm';
import type { DataSourceProviderType, SchemaDef } from '@zenstackhq/schema';
import fs from 'node:fs';
import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import { Migrator, type MigrationResultSet } from 'kysely/migration';
import { applyChanges } from './applier';
import { diffSnapshots, type SchemaChange } from './diff';
import { createDialect, createKysely } from './kysely-factory';
import { ZenStackMigrationProvider, type ModuleImporter } from './provider';
import { diffForPush, introspectCurrentState } from './push';
import { resolveRenames, type RenameResolver } from './rename';
import { buildSnapshot, emptySnapshot, parseSnapshot } from './snapshot';
import type { Snapshot } from './types';
import { writeMigrationFolder } from './writer';

/** ZenStack's migration tracking + lock tables (override Kysely's `kysely_migration` defaults). */
const MIGRATION_TABLE = 'zenstack_migration';
const MIGRATION_LOCK_TABLE = 'zenstack_migration_lock';

export interface MigrationEngineOptions {
    /** The compiled schema — the current desired state and the shape of the migration client. */
    schema: SchemaDef;
    /** Absolute path of the directory holding migration folders. */
    migrationsDir: string;
    /** Database connection URL. */
    connectionUrl: string;
    /** Base directory used to resolve relative SQLite `file:` paths (usually the schema output dir). */
    baseDir: string;
    /** Loader for user-authored `migration.ts` files (e.g. a jiti instance). */
    importer: ModuleImporter;
    /**
     * Optional resolver that disambiguates drop + create pairs into data-preserving renames
     * during {@link MigrationEngine.generate}. Omit for the default (everything is drop + create).
     */
    resolver?: RenameResolver;
    /** Clock, injectable for deterministic tests. */
    now?: () => Date;
}

export interface GenerateResult {
    created: boolean;
    dir?: string;
    name?: string;
    changes: SchemaChange[];
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
 * ZenStack's native migration engine: diffs schema snapshots to author migrations and
 * runs them with Kysely's {@link Migrator}. Migration functions receive a ZenStack
 * {@link ClientContract}.
 */
export class MigrationEngine {
    constructor(private readonly options: MigrationEngineOptions) {}

    private get provider(): DataSourceProviderType {
        return this.options.schema.provider.type;
    }

    /**
     * Diffs the latest recorded snapshot against the current schema and, if anything
     * changed, writes a new migration folder. Does not apply the migration.
     */
    async generate(name: string): Promise<GenerateResult> {
        const before = this.readLatestSnapshot();
        const after = buildSnapshot(this.options.schema);
        const plan = await resolveRenames(before, after, this.options.resolver);
        const changes = diffSnapshots(before, after, plan);

        if (changes.length === 0) {
            return { created: false, changes };
        }

        const folderName = `${this.timestamp()}_${slugify(name)}`;
        const dir = path.join(this.options.migrationsDir, folderName);
        writeMigrationFolder({ dir, changes, after });

        return { created: true, dir, name: folderName, changes };
    }

    /**
     * State-based sync: introspects the live database and applies the DDL needed to make
     * it match the schema, without creating migration files or history. For prototyping.
     *
     * Data-loss changes (dropping tables/columns) are only applied when `acceptDataLoss`
     * is set; otherwise the push is aborted before applying anything.
     */
    async push(options?: { acceptDataLoss?: boolean; forceReset?: boolean }): Promise<PushResult> {
        const desired = buildSnapshot(this.options.schema);
        const acceptDataLoss = !!options?.acceptDataLoss;
        const db = await createKysely(this.provider, this.options.connectionUrl, this.options.baseDir);
        try {
            if (options?.forceReset) {
                // drop everything first, then recreate from scratch
                await this.dropAllTables(db);
            }
            const current = await introspectCurrentState(db, this.provider);
            const { changes, dataLoss, blocked } = diffForPush(current, desired, acceptDataLoss);

            if (blocked.length > 0) {
                // don't apply anything destructive without consent
                return { aborted: true, applied: [], dataLoss: [], blocked };
            }

            await applyChanges(db, changes, desired, this.provider);
            return { aborted: false, applied: changes, dataLoss, blocked: [] };
        } finally {
            await db.destroy();
        }
    }

    /** Applies all pending migrations using Kysely's migrator. */
    async deploy(): Promise<MigrationResultSet> {
        const client = await this.createClient();
        try {
            return await this.createMigrator(client).migrateToLatest();
        } finally {
            await client.$disconnect();
        }
    }

    /** Returns the status of each migration (applied / pending). */
    async status(): Promise<Array<{ name: string; applied: boolean }>> {
        const client = await this.createClient();
        try {
            const migrations = await this.createMigrator(client).getMigrations();
            return migrations.map((m) => ({ name: m.name, applied: !!m.executedAt }));
        } finally {
            await client.$disconnect();
        }
    }

    /**
     * Drops all tables in the database and re-applies every migration from scratch.
     * Development only — all data is lost.
     */
    async reset(): Promise<MigrationResultSet> {
        const client = await this.createClient();
        try {
            // use the raw Kysely so catalog introspection isn't schema-qualified by the ORM
            await this.dropAllTables(client.$qbRaw);
            return await this.createMigrator(client).migrateToLatest();
        } finally {
            await client.$disconnect();
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
            throw new Error('Cannot baseline: the migrations directory already contains migrations.');
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
        const client = await this.createClient();
        try {
            const db = client.$qbRaw;
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
            await db.insertInto(MIGRATION_TABLE).values({ name, timestamp }).execute();
        } finally {
            await client.$disconnect();
        }
    }

    /** Creates Kysely's migration tracking table if it doesn't already exist. */
    private async ensureMigrationTable(db: Kysely<any>): Promise<void> {
        await db.schema
            .createTable(MIGRATION_TABLE)
            .ifNotExists()
            .addColumn('name', 'varchar(255)', (col) => col.notNull().primaryKey())
            .addColumn('timestamp', 'varchar(255)', (col) => col.notNull())
            .execute();
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
        const provider = this.provider;
        if (provider === 'sqlite') {
            await sql`PRAGMA foreign_keys = OFF`.execute(db);
        } else if (provider === 'mysql') {
            await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(db);
        }

        const tables = await db.introspection.getTables();
        for (const table of tables) {
            let builder = db.schema.dropTable(table.name).ifExists();
            if (provider === 'postgresql') {
                builder = builder.cascade();
            }
            await builder.execute();
        }

        if (provider === 'sqlite') {
            await sql`PRAGMA foreign_keys = ON`.execute(db);
        } else if (provider === 'mysql') {
            await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(db);
        }
    }

    private createMigrator(client: ClientContract<any>): Migrator {
        return new Migrator({
            // drive ordering/locking/tracking through the RAW Kysely instance — the ORM's
            // name-mapper would otherwise schema-qualify the migrator's internal catalog
            // queries (e.g. `pg_attribute`) and break introspection on Postgres.
            db: client.$qbRaw,
            provider: new ZenStackMigrationProvider(this.options.migrationsDir, this.options.importer, client),
            migrationTableName: MIGRATION_TABLE,
            migrationLockTableName: MIGRATION_LOCK_TABLE,
        });
    }

    /** Builds a ZenStack client for running migrations (passed to migration functions). */
    private async createClient(): Promise<ClientContract<any>> {
        const dialect = await createDialect(this.provider, this.options.connectionUrl, this.options.baseDir);
        return new ZenStackClient(this.options.schema, {
            dialect,
            skipValidationForComputedFields: true,
        }) as ClientContract<any>;
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

function slugify(name: string): string {
    return (
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'migration'
    );
}
