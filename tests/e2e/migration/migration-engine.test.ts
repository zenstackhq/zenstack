import { ExpressionUtils, type SchemaDef } from '@zenstackhq/schema';
import Database from 'better-sqlite3';
import { createJiti } from 'jiti';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationEngine } from '@zenstackhq/migration';

// A tiny hand-built schema (v1): User(id, email unique, name?).
function schemaV1(): SchemaDef {
    return {
        provider: { type: 'sqlite' },
        plugins: {},
        models: {
            User: {
                name: 'User',
                fields: {
                    id: {
                        name: 'id',
                        type: 'Int',
                        id: true,
                        default: ExpressionUtils.call('autoincrement'),
                    },
                    email: { name: 'email', type: 'String', unique: true },
                    name: { name: 'name', type: 'String', optional: true },
                },
                idFields: ['id'],
                uniqueFields: { id: { type: 'Int' }, email: { type: 'String' } },
            },
        },
    };
}

// v2 adds an optional `age` column.
function schemaV2(): SchemaDef {
    const s = schemaV1();
    s.models['User']!.fields['age'] = { name: 'age', type: 'Int', optional: true };
    return s;
}

describe('native migration engine', () => {
    let workDir: string;
    let migrationsDir: string;
    let dbFile: string;
    const importer = { import: (id: string) => createJiti(import.meta.url).import(id) };

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zen-migrate-'));
        migrationsDir = path.join(workDir, 'migrations');
        dbFile = path.join(workDir, 'test.db');
    });

    afterEach(() => {
        fs.rmSync(workDir, { recursive: true, force: true });
    });

    function makeEngine(schema: SchemaDef, at: string) {
        return new MigrationEngine({
            schema,
            migrationsDir,
            connectionUrl: dbFile,
            baseDir: workDir,
            importer,
            now: () => new Date(at),
        });
    }

    function tables(): string[] {
        const db = new Database(dbFile);
        try {
            return db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .all()
                .map((r: any) => r.name);
        } finally {
            db.close();
        }
    }

    function columns(table: string): string[] {
        const db = new Database(dbFile);
        try {
            return db.prepare(`PRAGMA table_info("${table}")`).all().map((r: any) => r.name);
        } finally {
            db.close();
        }
    }

    it('generates an initial migration folder with a snapshot and migration', async () => {
        const result = await makeEngine(schemaV1(), '2026-01-01T00:00:00Z').generate('init');

        expect(result.created).toBe(true);
        expect(result.name).toMatch(/_init$/);
        const dir = result.dir!;
        expect(fs.existsSync(path.join(dir, 'snapshot.json'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'migration.ts'))).toBe(true);

        const migrationSrc = fs.readFileSync(path.join(dir, 'migration.ts'), 'utf-8');
        expect(migrationSrc).toContain('export async function migrate(db: Kysely<any>)');
        expect(migrationSrc).toContain(`db.schema`);
        expect(migrationSrc).toContain(`createTable('User')`);
    });

    it('applies migrations with the Kysely migrator', async () => {
        const engine = makeEngine(schemaV1(), '2026-01-01T00:00:00Z');
        await engine.generate('init');

        const result = await engine.deploy();
        expect(result.error).toBeUndefined();
        expect(result.results?.map((r) => r.status)).toEqual(['Success']);

        expect(tables()).toContain('User');
        // the migration engine's bookkeeping table
        expect(tables()).toContain('zenstack_migration');
        expect(columns('User').sort()).toEqual(['email', 'id', 'name']);
    });

    it('reports status of applied and pending migrations', async () => {
        const engine = makeEngine(schemaV1(), '2026-01-01T00:00:00Z');
        await engine.generate('init');
        await engine.deploy();

        const status = await engine.status();
        expect(status).toHaveLength(1);
        expect(status[0]!.applied).toBe(true);
    });

    it('diffs a follow-up change into a new migration and applies it', async () => {
        await makeEngine(schemaV1(), '2026-01-01T00:00:00Z').generate('init');
        await makeEngine(schemaV1(), '2026-01-01T00:00:00Z').deploy();

        const v2 = makeEngine(schemaV2(), '2026-01-02T00:00:00Z');
        const gen = await v2.generate('add_age');
        expect(gen.created).toBe(true);
        expect(gen.changes.some((c) => c.kind === 'add-column')).toBe(true);

        const deployed = await v2.deploy();
        expect(deployed.error).toBeUndefined();
        // only the new migration runs this time
        expect(deployed.results?.map((r) => r.status)).toEqual(['Success']);
        expect(columns('User')).toContain('age');
    });

    it('is a no-op when the schema is unchanged', async () => {
        await makeEngine(schemaV1(), '2026-01-01T00:00:00Z').generate('init');
        const again = await makeEngine(schemaV1(), '2026-01-03T00:00:00Z').generate('noop');
        expect(again.created).toBe(false);
        expect(again.changes).toHaveLength(0);
    });

    describe('baseline (adopting an existing database)', () => {
        const at = '2026-01-01T00:00:00Z';

        it('marks the current state applied without recreating existing tables', async () => {
            // simulate a database already built (e.g. by Prisma) — tables exist, no history
            await makeEngine(schemaV1(), at).push();
            expect(tables()).toContain('User');

            // baseline on the (fresh) migrations directory
            const engine = makeEngine(schemaV1(), at);
            const result = await engine.baseline('init');
            expect(result.created).toBe(true);
            expect(result.name).toMatch(/_init$/);

            // the baseline migration is recorded as applied
            const status = await engine.status();
            expect(status).toEqual([{ name: result.name, applied: true }]);

            // deploy is a no-op — it must NOT try to recreate the existing table
            const deployed = await engine.deploy();
            expect(deployed.error).toBeUndefined();
            expect(deployed.results ?? []).toHaveLength(0);
            expect(tables()).toContain('User');
        });

        it('applies only the delta after baselining', async () => {
            await makeEngine(schemaV1(), at).push();
            await makeEngine(schemaV1(), at).baseline('init');

            // evolve the schema and generate a follow-up migration
            const v2 = makeEngine(schemaV2(), '2026-01-02T00:00:00Z');
            const gen = await v2.generate('add_age');
            expect(gen.changes.some((c) => c.kind === 'add-column')).toBe(true);
            expect(gen.changes.some((c) => c.kind === 'create-table')).toBe(false);

            const deployed = await v2.deploy();
            expect(deployed.error).toBeUndefined();
            expect(deployed.results?.map((r) => r.status)).toEqual(['Success']);
            expect(columns('User')).toContain('age');
        });

        it('refuses to baseline when migrations already exist', async () => {
            await makeEngine(schemaV1(), at).generate('init');
            await expect(makeEngine(schemaV1(), at).baseline('base')).rejects.toThrow(/already contains migrations/);
        });
    });

    describe('checksums', () => {
        const at = '2026-01-01T00:00:00Z';

        it('refuses to deploy when an applied migration was edited', async () => {
            const init = await makeEngine(schemaV1(), at).generate('init');
            await makeEngine(schemaV1(), at).deploy(); // applies + records checksum

            // tamper with the already-applied migration.ts
            fs.appendFileSync(path.join(init.dir!, 'migration.ts'), '\n// tampered\n');

            // author a new migration and try to deploy — it must refuse and not apply anything
            await makeEngine(schemaV2(), '2026-01-02T00:00:00Z').generate('add_age');
            const result = await makeEngine(schemaV2(), '2026-01-02T00:00:00Z').deploy();

            expect(result.error).toBeDefined();
            expect(String((result.error as Error).message)).toMatch(/modified|checksum/i);
            expect(columns('User')).not.toContain('age'); // the new migration was not applied
        });

        it('deploys cleanly when applied migrations are unchanged', async () => {
            await makeEngine(schemaV1(), at).generate('init');
            expect((await makeEngine(schemaV1(), at).deploy()).error).toBeUndefined();
            // re-deploying an unchanged history verifies checksums and is a no-op
            expect((await makeEngine(schemaV1(), at).deploy()).error).toBeUndefined();
        });
    });

    describe('db push', () => {
        const at = '2026-01-01T00:00:00Z';

        it('creates the schema on an empty database', async () => {
            const result = await makeEngine(schemaV1(), at).push();
            expect(result.aborted).toBe(false);
            expect(tables()).toContain('User');
            expect(columns('User').sort()).toEqual(['email', 'id', 'name']);
        });

        it('is idempotent', async () => {
            await makeEngine(schemaV1(), at).push();
            const second = await makeEngine(schemaV1(), at).push();
            expect(second.aborted).toBe(false);
            expect(second.applied).toHaveLength(0);
        });

        it('adds a new column', async () => {
            await makeEngine(schemaV1(), at).push();
            const result = await makeEngine(schemaV2(), at).push();
            expect(result.applied.some((c) => c.kind === 'add-column')).toBe(true);
            expect(columns('User')).toContain('age');
        });

        it('blocks data loss without acceptDataLoss', async () => {
            await makeEngine(schemaV2(), at).push();
            const result = await makeEngine(schemaV1(), at).push();
            expect(result.aborted).toBe(true);
            expect(result.blocked.some((b) => b.includes('age'))).toBe(true);
            // the column is preserved
            expect(columns('User')).toContain('age');
        });

        it('applies data loss with acceptDataLoss', async () => {
            await makeEngine(schemaV2(), at).push();
            const result = await makeEngine(schemaV1(), at).push({ acceptDataLoss: true });
            expect(result.aborted).toBe(false);
            expect(columns('User')).not.toContain('age');
        });
    });
});
