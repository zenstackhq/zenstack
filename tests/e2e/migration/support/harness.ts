import type { SchemaDef } from '@zenstackhq/schema';
import { createTestProject, generateTsSchema, getTestDbProvider } from '@zenstackhq/testtools';
import BetterSqlite3 from 'better-sqlite3';
import { createJiti } from 'jiti';
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect, sql } from 'kysely';
import { createPool as createMysqlPool } from 'mysql2';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client as PgClient, Pool } from 'pg';
import { MigrationEngine, type RenameResolver } from '@zenstackhq/migration';

export type Provider = 'sqlite' | 'postgresql' | 'mysql';

export const PG = {
    host: process.env['TEST_PG_HOST'] ?? 'localhost',
    port: process.env['TEST_PG_PORT'] ? Number(process.env['TEST_PG_PORT']) : 5432,
    user: process.env['TEST_PG_USER'] ?? 'postgres',
    password: process.env['TEST_PG_PASSWORD'] ?? 'postgres',
};

export const MYSQL = {
    host: process.env['TEST_MYSQL_HOST'] ?? 'localhost',
    port: process.env['TEST_MYSQL_PORT'] ? Number(process.env['TEST_MYSQL_PORT']) : 3306,
    user: process.env['TEST_MYSQL_USER'] ?? 'root',
    password: process.env['TEST_MYSQL_PASSWORD'] ?? 'mysql',
};

// small connection pools so the parallel test suite doesn't exhaust MySQL's connection limit
const mysqlUrl = (database = '') =>
    `mysql://${MYSQL.user}:${MYSQL.password}@${MYSQL.host}:${MYSQL.port}/${database}?connectionLimit=3`;

/**
 * The database provider for the current test run, selected by the `TEST_DB_PROVIDER`
 * environment variable (default `sqlite`), following the repo's e2e convention. This
 * migration suite is first-class on `sqlite`, `postgresql`, and `mysql`.
 */
export function currentProvider(): Provider {
    return getTestDbProvider() as Provider;
}

// #region normalized introspection

export interface DbSchema {
    tables: Record<string, DbTable>;
}
export interface DbTable {
    columns: Record<string, { nullable: boolean; type: string }>;
    indexes: DbIndex[];
    foreignKeys: DbForeignKey[];
}
export interface DbIndex {
    name: string;
    columns: string[];
    unique: boolean;
}
export interface DbForeignKey {
    columns: string[];
    refTable: string;
}

// #endregion

/** An isolated database for a single test, with introspection + cleanup. */
export interface TestDb {
    provider: Provider;
    workDir: string;
    /** Connection URL passed to the migration engine. */
    url: string;
    /** Base dir for resolving relative sqlite paths (also where `schema.ts` is written). */
    baseDir: string;
    introspect(): Promise<DbSchema>;
    /** Type-checks the scaffolded project (schema + migration files) with `tsc`, throwing on error. */
    typecheck(): void;
    cleanup(): Promise<void>;
}

export async function createTestDb(provider: Provider, options?: { debug: boolean }): Promise<TestDb> {
    // scaffold a real npm project (package.json, tsconfig, symlinked node_modules) so the
    // generated schema.ts / schema.before.ts / migration.ts resolve their types
    const workDir = createTestProject();
    if (options?.debug) {
        console.log(`Work dir: ${workDir}`);
    }
    const typecheck = () => {
        execSync('npx tsc --noEmit', { cwd: workDir, stdio: 'pipe' });
    };

    if (provider === 'sqlite') {
        const dbFile = path.join(workDir, 'test.db');
        return {
            provider,
            workDir,
            url: 'file:./test.db',
            baseDir: workDir,
            introspect: () => introspectSqlite(dbFile),
            typecheck,
            cleanup: async () => fs.rmSync(workDir, { recursive: true, force: true }),
        };
    }

    if (provider === 'mysql') {
        // create an isolated database
        const dbName = `zmig_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
        const admin = createMysqlPool(mysqlUrl());
        await admin.promise().query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await admin.promise().query(`CREATE DATABASE \`${dbName}\``);
        await admin.promise().end();
        const url = mysqlUrl(dbName);
        return {
            provider,
            workDir,
            url,
            baseDir: workDir,
            introspect: () => introspectMysql(url),
            typecheck,
            cleanup: async () => {
                fs.rmSync(workDir, { recursive: true, force: true });
                const a = createMysqlPool(mysqlUrl());
                await a.promise().query(`DROP DATABASE IF EXISTS \`${dbName}\``);
                await a.promise().end();
            },
        };
    }

    // postgres: create an isolated database
    const dbName = `zmig_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const admin = new PgClient({ ...PG, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.end();
    const url = `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${dbName}`;

    return {
        provider,
        workDir,
        url,
        baseDir: workDir,
        introspect: () => introspectPostgres(url),
        typecheck,
        cleanup: async () => {
            fs.rmSync(workDir, { recursive: true, force: true });
            const a = new PgClient({ ...PG, database: 'postgres' });
            await a.connect();
            await a.query(
                `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
                [dbName],
            );
            await a.query(`DROP DATABASE IF EXISTS "${dbName}"`);
            await a.end();
        },
    };
}

// Remembers the generated `schema.zmodel` source for each compiled schema, so it can be
// written into the test project (mirroring a real ZenStack project layout).
const zmodelBySchema = new WeakMap<SchemaDef, string>();

/** Compiles a ZModel body into a runtime {@link SchemaDef} for the given provider. */
export async function compile(zmodelBody: string, provider: Provider): Promise<SchemaDef> {
    const { workDir, schema } = await generateTsSchema(zmodelBody, provider);
    zmodelBySchema.set(schema, fs.readFileSync(path.join(workDir, 'schema.zmodel'), 'utf-8'));
    return schema;
}

function makeEngine(schema: SchemaDef, db: TestDb, migrationsDir: string, seq = 0, resolver?: RenameResolver) {
    // keep the project's schema.zmodel in sync with the schema being migrated
    const zmodel = zmodelBySchema.get(schema);
    if (zmodel) {
        fs.writeFileSync(path.join(db.baseDir, 'schema.zmodel'), zmodel);
    }
    return new MigrationEngine({
        schema,
        migrationsDir,
        connectionUrl: db.url,
        baseDir: db.baseDir,
        importer: { import: (id: string) => createJiti(import.meta.url).import(id) },
        resolver,
        // distinct, increasing timestamps so migration folders sort in creation order
        now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, seq)),
    });
}

/** Options common to all migration flows. */
export interface FlowOptions {
    /**
     * Invoked after the `from` state has been established but before migrating to `to`.
     * Use it to seed rows so a test can assert whether data survives the migration.
     */
    seed?: (db: TestDb) => Promise<void>;
    /** Rename resolver used when authoring the `from -> to` migration (dev/deploy flows). */
    resolver?: RenameResolver;
}

/** `db push`: sync the db to `from`, then push `to` (with data-loss accepted). */
export async function runDbPush(
    db: TestDb,
    from: SchemaDef | undefined,
    to: SchemaDef,
    opts?: FlowOptions,
): Promise<void> {
    const migrationsDir = path.join(db.workDir, 'migrations');
    if (from) {
        await makeEngine(from, db, migrationsDir).push({ acceptDataLoss: true });
    }
    if (opts?.seed) {
        await opts.seed(db);
    }
    await makeEngine(to, db, migrationsDir).push({ acceptDataLoss: true });
}

/** `migrate dev`: apply `from` (init) then generate+apply the `from -> to` migration. */
async function deployOrThrow(engine: MigrationEngine): Promise<void> {
    const result = await engine.deploy();
    if (result.error) {
        throw result.error instanceof Error ? result.error : new Error(String(result.error));
    }
}

export async function runMigrateDev(
    db: TestDb,
    from: SchemaDef | undefined,
    to: SchemaDef,
    opts?: FlowOptions,
): Promise<void> {
    const migrationsDir = path.join(db.workDir, 'migrations');
    if (from) {
        await makeEngine(from, db, migrationsDir, 0).generate('init');
        await deployOrThrow(makeEngine(from, db, migrationsDir, 0));
    }
    if (opts?.seed) {
        await opts.seed(db);
    }
    await makeEngine(to, db, migrationsDir, 1, opts?.resolver).generate(from ? 'change' : 'init');
    await deployOrThrow(makeEngine(to, db, migrationsDir, 1));
}

/**
 * `migrate deploy`: author the migrations in a separate dev workspace (no db), then apply
 * all of them to a fresh (pre-migration) database via deploy.
 */
export async function runMigrateDeploy(
    db: TestDb,
    from: SchemaDef | undefined,
    to: SchemaDef,
    opts?: FlowOptions,
): Promise<void> {
    const migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zmig-hist-'));
    try {
        if (from && opts?.seed) {
            // to seed between migrations, deploy `init`, seed, then author + deploy `change`
            await makeEngine(from, db, migrationsDir, 0).generate('init');
            await deployOrThrow(makeEngine(from, db, migrationsDir, 0));
            await opts.seed(db);
            await makeEngine(to, db, migrationsDir, 1, opts?.resolver).generate('change');
            await deployOrThrow(makeEngine(to, db, migrationsDir, 1));
            return;
        }
        if (from) {
            await makeEngine(from, db, migrationsDir, 0).generate('init');
            await makeEngine(to, db, migrationsDir, 1, opts?.resolver).generate('change');
        } else {
            await makeEngine(to, db, migrationsDir, 0).generate('init');
        }
        // apply the whole history to the fresh database
        await deployOrThrow(makeEngine(to, db, migrationsDir));
    } finally {
        fs.rmSync(migrationsDir, { recursive: true, force: true });
    }
}

/** Dispatches to the flow runner for `flow`. */
export async function runFlow(
    db: TestDb,
    flow: 'push' | 'dev' | 'deploy',
    from: SchemaDef | undefined,
    to: SchemaDef,
    opts?: FlowOptions,
): Promise<void> {
    if (flow === 'push') {
        return runDbPush(db, from, to, opts);
    }
    if (flow === 'dev') {
        return runMigrateDev(db, from, to, opts);
    }
    return runMigrateDeploy(db, from, to, opts);
}

// #region raw data access (for data-preservation assertions)

/** Opens a raw Kysely connection to the test database (no name mapping). */
function openKysely(db: TestDb): Kysely<any> {
    if (db.provider === 'sqlite') {
        const dbFile = path.join(db.baseDir, 'test.db');
        return new Kysely<any>({ dialect: new SqliteDialect({ database: new BetterSqlite3(dbFile) }) });
    }
    if (db.provider === 'mysql') {
        return new Kysely<any>({ dialect: new MysqlDialect({ pool: createMysqlPool(db.url) }) });
    }
    return new Kysely<any>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: db.url }) }) });
}

/** Runs `fn` with a raw Kysely connection, always destroying it afterward. */
export async function withDb<T>(db: TestDb, fn: (k: Kysely<any>) => Promise<T>): Promise<T> {
    const k = openKysely(db);
    try {
        return await fn(k);
    } finally {
        await k.destroy();
    }
}

/** Inserts rows into a physical table. */
export async function seedRows(db: TestDb, table: string, rows: Record<string, unknown>[]): Promise<void> {
    await withDb(db, (k) => k.insertInto(table).values(rows).execute());
}

/** Reads all rows of a physical table. */
export async function readRows(db: TestDb, table: string): Promise<Record<string, unknown>[]> {
    return withDb(db, (k) => k.selectFrom(table).selectAll().execute());
}

// #endregion

// #region provider-specific introspection

async function introspectSqlite(dbFile: string): Promise<DbSchema> {
    const db = new Kysely<any>({ dialect: new SqliteDialect({ database: new BetterSqlite3(dbFile) }) });
    try {
        return await introspectViaKysely(db, 'sqlite');
    } finally {
        await db.destroy();
    }
}

async function introspectPostgres(url: string): Promise<DbSchema> {
    const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: url }) }) });
    try {
        return await introspectViaKysely(db, 'postgresql');
    } finally {
        await db.destroy();
    }
}

async function introspectMysql(url: string): Promise<DbSchema> {
    const db = new Kysely<any>({ dialect: new MysqlDialect({ pool: createMysqlPool(url) }) });
    try {
        return await introspectViaKysely(db, 'mysql');
    } finally {
        await db.destroy();
    }
}

async function introspectViaKysely(db: Kysely<any>, provider: Provider): Promise<DbSchema> {
    const tables: Record<string, DbTable> = {};
    const meta = await db.introspection.getTables();
    for (const t of meta) {
        if (t.isView || t.name.startsWith('kysely_') || t.name.startsWith('zenstack_migration')) {
            continue;
        }
        const columns: Record<string, { nullable: boolean; type: string }> = {};
        for (const c of t.columns) {
            columns[c.name] = { nullable: c.isNullable, type: c.dataType };
        }
        const indexes =
            provider === 'sqlite'
                ? await sqliteIndexes(db, t.name)
                : provider === 'mysql'
                  ? await mysqlIndexes(db, t.name)
                  : await postgresIndexes(db, t.name);
        const foreignKeys =
            provider === 'sqlite'
                ? await sqliteFks(db, t.name)
                : provider === 'mysql'
                  ? await mysqlFks(db, t.name)
                  : await postgresFks(db, t.name);
        tables[t.name] = { columns, indexes, foreignKeys };
    }
    return { tables };
}

async function mysqlIndexes(db: Kysely<any>, table: string): Promise<DbIndex[]> {
    const rows = (
        await sql<{ INDEX_NAME: string; NON_UNIQUE: number; COLUMN_NAME: string }>`
            SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
        `.execute(db)
    ).rows;
    const byName = new Map<string, DbIndex>();
    for (const r of rows) {
        if (r.INDEX_NAME === 'PRIMARY') {
            continue; // primary key, not an index we manage
        }
        const existing = byName.get(r.INDEX_NAME) ?? { name: r.INDEX_NAME, columns: [], unique: Number(r.NON_UNIQUE) === 0 };
        existing.columns.push(r.COLUMN_NAME);
        byName.set(r.INDEX_NAME, existing);
    }
    return [...byName.values()];
}

async function mysqlFks(db: Kysely<any>, table: string): Promise<DbForeignKey[]> {
    const rows = (
        await sql<{ CONSTRAINT_NAME: string; COLUMN_NAME: string; REFERENCED_TABLE_NAME: string }>`
            SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
        `.execute(db)
    ).rows;
    const byName = new Map<string, DbForeignKey>();
    for (const r of rows) {
        const existing = byName.get(r.CONSTRAINT_NAME) ?? { columns: [], refTable: r.REFERENCED_TABLE_NAME };
        existing.columns.push(r.COLUMN_NAME);
        byName.set(r.CONSTRAINT_NAME, existing);
    }
    return [...byName.values()];
}

async function sqliteIndexes(db: Kysely<any>, table: string): Promise<DbIndex[]> {
    const list = (
        await sql<{
            name: string;
            unique: number;
            origin: string;
        }>`PRAGMA index_list(${sql.raw(`"${table}"`)})`.execute(db)
    ).rows;
    const result: DbIndex[] = [];
    for (const idx of list) {
        if (idx.origin === 'pk') {
            continue; // primary key, not an index we manage
        }
        const cols = (await sql<{ name: string }>`PRAGMA index_info(${sql.raw(`"${idx.name}"`)})`.execute(db)).rows;
        result.push({ name: idx.name, columns: cols.map((c) => c.name), unique: idx.unique === 1 });
    }
    return result;
}

async function sqliteFks(db: Kysely<any>, table: string): Promise<DbForeignKey[]> {
    const rows = (
        await sql<{
            id: number;
            table: string;
            from: string;
        }>`PRAGMA foreign_key_list(${sql.raw(`"${table}"`)})`.execute(db)
    ).rows;
    const byId = new Map<number, DbForeignKey>();
    for (const r of rows) {
        const existing = byId.get(r.id) ?? { columns: [], refTable: r.table };
        existing.columns.push(r.from);
        byId.set(r.id, existing);
    }
    return [...byId.values()];
}

async function postgresIndexes(db: Kysely<any>, table: string): Promise<DbIndex[]> {
    const rows = (
        await sql<{ indexname: string; indexdef: string; isprimary: boolean }>`
            SELECT i.indexname, i.indexdef, ix.indisprimary AS isprimary
            FROM pg_indexes i
            JOIN pg_class c ON c.relname = i.indexname
            JOIN pg_index ix ON ix.indexrelid = c.oid
            WHERE i.schemaname = 'public' AND i.tablename = ${table}
        `.execute(db)
    ).rows;
    const result: DbIndex[] = [];
    for (const r of rows) {
        if (r.isprimary) {
            continue;
        }
        const unique = /CREATE UNIQUE INDEX/i.test(r.indexdef);
        const match = r.indexdef.match(/\(([^)]*)\)\s*$/);
        const columns = match ? match[1]!.split(',').map((s) => s.trim().replace(/"/g, '')) : [];
        result.push({ name: r.indexname, columns, unique });
    }
    return result;
}

async function postgresFks(db: Kysely<any>, table: string): Promise<DbForeignKey[]> {
    const rows = (
        await sql<{ conname: string; column: string; reftable: string; ord: number }>`
            SELECT con.conname,
                   att.attname AS column,
                   ref.relname AS reftable,
                   u.ord
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_class ref ON ref.oid = con.confrelid
            JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
            JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
            WHERE con.contype = 'f' AND rel.relname = ${table}
            ORDER BY con.conname, u.ord
        `.execute(db)
    ).rows;
    const byName = new Map<string, DbForeignKey>();
    for (const r of rows) {
        const existing = byName.get(r.conname) ?? { columns: [], refTable: r.reftable };
        existing.columns.push(r.column);
        byName.set(r.conname, existing);
    }
    return [...byName.values()];
}

// #endregion

// #region assertion helpers

export function tableNames(schema: DbSchema): string[] {
    return Object.keys(schema.tables).sort();
}

export function columnNames(schema: DbSchema, table: string): string[] {
    return Object.keys(schema.tables[table]?.columns ?? {}).sort();
}

/** The introspected data type of a column (e.g. `varchar`, `uuid`, `numeric`, `int2`). */
export function columnType(schema: DbSchema, table: string, column: string): string | undefined {
    return schema.tables[table]?.columns[column]?.type;
}

export function hasIndex(schema: DbSchema, table: string, columns: string[], unique?: boolean): boolean {
    const idxs = schema.tables[table]?.indexes ?? [];
    return idxs.some(
        (i) =>
            i.columns.length === columns.length &&
            i.columns.every((c, n) => c === columns[n]) &&
            (unique === undefined || i.unique === unique),
    );
}

export function hasForeignKey(schema: DbSchema, table: string, refTable: string): boolean {
    return (schema.tables[table]?.foreignKeys ?? []).some((fk) => fk.refTable === refTable);
}

// #endregion
