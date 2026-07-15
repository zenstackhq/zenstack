import { buildSnapshot, dataLossWarnings, diffSnapshots, MigrationEngine } from '@zenstackhq/migration';
import { ExpressionUtils, type SchemaDef } from '@zenstackhq/schema';
import Database from 'better-sqlite3';
import { createJiti } from 'jiti';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile, currentProvider, type Provider } from './support/harness';

const ID = 'id Int @id @default(autoincrement())';
const provider: Provider = currentProvider();

describe(`data-loss warnings (${provider})`, () => {
    async function warningsFor(fromZmodel: string, toZmodel: string) {
        const from = buildSnapshot(await compile(fromZmodel, provider));
        const to = buildSnapshot(await compile(toZmodel, provider));
        return { from, to, risks: dataLossWarnings(from, to, diffSnapshots(from, to)) };
    }

    it('warns on dropped table', async () => {
        const { risks } = await warningsFor(
            `model User { ${ID} }  model Post { ${ID} }`,
            `model User { ${ID} }`,
        );
        expect(risks).toEqual([
            expect.objectContaining({
                table: 'Post',
                message: expect.stringContaining('table "Post" will be dropped'),
            }),
        ]);
    });

    it('warns on dropped column', async () => {
        // on SQLite the drop may be lowered to a table rebuild — the warning must survive that path too
        const { risks } = await warningsFor(
            `model User { ${ID}  name String }`,
            `model User { ${ID} }`,
        );
        expect(risks).toEqual([
            expect.objectContaining({
                table: 'User',
                column: 'name',
                message: expect.stringContaining('column "User.name" will be dropped'),
            }),
        ]);
    });

    it('does not warn on additive changes', async () => {
        const { risks } = await warningsFor(
            `model User { ${ID} }`,
            `model User { ${ID}  name String? }`,
        );
        expect(risks).toEqual([]);
    });

    it('does not warn when only an unused enum is dropped', async () => {
        const { from, risks } = await warningsFor(
            `enum Role { USER ADMIN }  model User { ${ID} }`,
            `model User { ${ID} }`,
        );
        // sanity: the (unused) enum is actually part of the snapshot being diffed away
        expect(from.enums['Role']).toBeDefined();
        expect(risks).toEqual([]);
    });

    it('warns on enum value removal (pg/mysql) but not on sqlite', async () => {
        const { risks } = await warningsFor(
            `enum Role { USER ADMIN GUEST }  model User { ${ID}  role Role }`,
            `enum Role { USER ADMIN }  model User { ${ID}  role Role }`,
        );
        if (provider === 'sqlite') {
            // enum columns are plain text on SQLite — nothing enforces the removed value
            expect(risks).toEqual([]);
        } else {
            const enumRisks = risks.filter((r) => r.message.includes('enum "Role"'));
            expect(enumRisks).toHaveLength(1);
            expect(enumRisks[0]!.message).toContain('GUEST');
            // enum removals can't be probed for at-risk rows generically — no table to check
            expect(enumRisks[0]!.table).toBeUndefined();
        }
    });
});

// The confirmation flow is provider-independent engine logic — exercised directly against a
// SQLite file, mirroring migration-engine.test.ts.
describe('data-loss confirmation (engine, sqlite)', () => {
    let workDir: string;
    let migrationsDir: string;
    let dbFile: string;
    const importer = { import: (id: string) => createJiti(import.meta.url).import(id) };

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zen-dataloss-'));
        migrationsDir = path.join(workDir, 'migrations');
        dbFile = path.join(workDir, 'test.db');
    });

    afterEach(() => {
        fs.rmSync(workDir, { recursive: true, force: true });
    });

    // User(id, name?) — v2 drops the `name` column
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
                        name: { name: 'name', type: 'String', optional: true },
                    },
                    idFields: ['id'],
                    uniqueFields: { id: { type: 'Int' } },
                },
            },
        };
    }

    function schemaV2(): SchemaDef {
        const s = schemaV1();
        delete s.models['User']!.fields['name'];
        return s;
    }

    function makeEngine(
        schema: SchemaDef,
        at: string,
        confirmDataLoss?: (warnings: string[]) => boolean | Promise<boolean>,
    ) {
        return new MigrationEngine({
            schema,
            migrationsDir,
            connectionUrl: dbFile,
            baseDir: workDir,
            importer,
            confirmDataLoss,
            now: () => new Date(at),
        });
    }

    function migrationFolders(): string[] {
        return fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir).sort() : [];
    }

    function insertUser(name: string) {
        const db = new Database(dbFile);
        try {
            db.prepare('INSERT INTO "User" ("name") VALUES (?)').run(name);
        } finally {
            db.close();
        }
    }

    /** Applies schemaV1 as the `init` migration. */
    async function setupInitialState() {
        await makeEngine(schemaV1(), '2026-01-01T00:00:00Z').generate('init');
        const deployed = await makeEngine(schemaV1(), '2026-01-01T00:00:00Z').deploy();
        expect(deployed.error).toBeUndefined();
    }

    it('declining the confirmation aborts without writing a migration', async () => {
        await setupInitialState();
        insertUser('Alice'); // the dropped column holds data

        const result = await makeEngine(schemaV2(), '2026-01-02T00:00:00Z', () => false).generate('drop_name');

        expect(result.created).toBe(false);
        expect(result.aborted).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.join('\n')).toContain('User.name');
        // only the init migration exists — nothing was written for the declined change
        expect(migrationFolders()).toHaveLength(1);
        expect(migrationFolders()[0]).toMatch(/_init$/);
    });

    it('accepting the confirmation writes the migration', async () => {
        await setupInitialState();
        insertUser('Alice');

        let received: string[] | undefined;
        const result = await makeEngine(schemaV2(), '2026-01-02T00:00:00Z', (warnings) => {
            received = warnings;
            return true;
        }).generate('drop_name');

        expect(result.created).toBe(true);
        expect(result.aborted).toBeFalsy();
        expect(fs.existsSync(path.join(result.dir!, 'migration.ts'))).toBe(true);
        expect(migrationFolders()).toHaveLength(2);
        // the hook saw the human-readable warning about the dropped column
        expect(received).toBeDefined();
        expect(received!.join('\n')).toContain('User.name');
        expect(result.warnings).toEqual(received);
    });

    it('empty tables suppress the confirmation (data-aware)', async () => {
        await setupInitialState();
        // no rows seeded — the dropped column provably holds no data

        let asked = 0;
        const result = await makeEngine(schemaV2(), '2026-01-02T00:00:00Z', () => {
            asked++;
            return false;
        }).generate('drop_name');

        expect(asked).toBe(0);
        expect(result.created).toBe(true);
        expect(result.aborted).toBeFalsy();
        expect(result.warnings).toEqual([]);
        expect(migrationFolders()).toHaveLength(2);
    });

    it('keeps the current behavior when no confirmation hook is provided', async () => {
        await setupInitialState();
        insertUser('Alice');

        // no hook: no prompt, no probe, no abort — the migration is written as before
        const result = await makeEngine(schemaV2(), '2026-01-02T00:00:00Z').generate('drop_name');

        expect(result.created).toBe(true);
        expect(result.aborted).toBeFalsy();
        expect(migrationFolders()).toHaveLength(2);
        // the statically-detected warnings are still reported in the result
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('baseline never aborts on the confirmation hook', async () => {
        // adopt an existing database: baseline diffs from the empty snapshot (create-only),
        // so a declining hook must not get in the way
        await makeEngine(schemaV1(), '2026-01-01T00:00:00Z').push();

        const result = await makeEngine(schemaV1(), '2026-01-01T00:00:00Z', () => false).baseline('init');

        expect(result.created).toBe(true);
        expect(result.aborted).toBeFalsy();
        expect(migrationFolders()).toHaveLength(1);
    });
});
