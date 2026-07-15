import { buildSnapshot, diffSnapshots, type RenameResolver } from '@zenstackhq/migration';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import {
    compile,
    createTestDb,
    currentProvider,
    readRows,
    runFlow,
    seedRows,
    withDb,
    type Provider,
    type TestDb,
} from './support/harness';

const ID = 'id Int @id @default(autoincrement())';
const provider: Provider = currentProvider();
// `db push` uses name-only introspection and doesn't detect in-place column changes yet,
// so alter-column is exercised through the migration flows.
const FLOWS = ['dev', 'deploy'] as const;

describe(`alter column (${provider})`, () => {
    it('diffs an in-place column change instead of marking it unsupported', async () => {
        const from = buildSnapshot(await compile(`model User { ${ID}  name String }`, provider));
        const to = buildSnapshot(await compile(`model User { ${ID}  name String? }`, provider));
        const changes = diffSnapshots(from, to);
        expect(changes.some((c) => c.kind === 'unsupported')).toBe(false);
        if (provider === 'sqlite') {
            expect(changes.some((c) => c.kind === 'rebuild-table')).toBe(true);
        } else {
            expect(changes.some((c) => c.kind === 'alter-column')).toBe(true);
        }
    });

    describe.each(FLOWS)('%s', (flow) => {
        it('makes a required column nullable, preserving data', async () => {
            const db = await createTestDb(provider);
            try {
                const from = await compile(`model User { ${ID}  name String }`, provider);
                const to = await compile(`model User { ${ID}  name String? }`, provider);
                await runFlow(db, flow, from, to, { seed: () => seedRows(db, 'User', [{ name: 'Alice' }]) });

                const intro = await db.introspect();
                expect(intro.tables['User']!.columns['name']!.nullable).toBe(true);
                expect((await readRows(db, 'User'))[0]!['name']).toBe('Alice');
            } finally {
                await db.cleanup();
            }
        });

        it('changes a column type, preserving data', async () => {
            const db = await createTestDb(provider);
            try {
                const from = await compile(`model User { ${ID}  n Int }`, provider);
                const to = await compile(`model User { ${ID}  n BigInt }`, provider);
                await runFlow(db, flow, from, to, { seed: () => seedRows(db, 'User', [{ n: 7 }]) });

                expect(Number((await readRows(db, 'User'))[0]!['n'])).toBe(7);
                if (provider === 'postgresql') {
                    expect((await db.introspect()).tables['User']!.columns['n']!.type).toBe('int8');
                }
            } finally {
                await db.cleanup();
            }
        });
    });

    it.runIf(provider === 'postgresql')('appends a value to an existing enum', async () => {
        const db = await createTestDb(provider);
        try {
            const from = await compile(`enum Role { USER ADMIN }  model User { ${ID}  role Role }`, provider);
            const to = await compile(`enum Role { USER ADMIN SUPER }  model User { ${ID}  role Role }`, provider);
            await runFlow(db, 'dev', from, to);
            // the appended value is usable (proves ALTER TYPE ... ADD VALUE ran)
            await seedRows(db, 'User', [{ role: 'SUPER' }]);
            expect((await readRows(db, 'User'))[0]!['role']).toBe('SUPER');
        } finally {
            await db.cleanup();
        }
    });

    it('diffs an enum value removal (recreate on pg, no-op on sqlite, modify-column on mysql)', async () => {
        const from = buildSnapshot(await compile(`enum Role { USER ADMIN GUEST }  model User { ${ID}  role Role }`, provider));
        const to = buildSnapshot(await compile(`enum Role { ADMIN USER }  model User { ${ID}  role Role }`, provider));
        const changes = diffSnapshots(from, to);
        if (provider === 'postgresql') {
            expect(changes).toEqual([
                expect.objectContaining({
                    kind: 'recreate-enum',
                    columns: [expect.objectContaining({ table: 'User' })],
                }),
            ]);
        } else if (provider === 'sqlite') {
            // enum columns are plain text on SQLite — nothing to do
            expect(changes).toEqual([]);
        } else {
            // MySQL lowers the enum change to one MODIFY COLUMN per column using the enum
            expect(changes).toEqual([
                expect.objectContaining({ kind: 'alter-column', table: expect.objectContaining({ name: 'User' }) }),
            ]);
        }
    });

    it.runIf(provider === 'postgresql')('removes and reorders enum values by recreating the type', async () => {
        const db = await createTestDb(provider);
        try {
            const from = await compile(
                `enum Role { USER ADMIN GUEST }  model User { ${ID}  role Role @default(USER) }`,
                provider,
            );
            const to = await compile(
                `enum Role { ADMIN USER }  model User { ${ID}  role Role @default(USER) }`,
                provider,
            );
            await runFlow(db, 'dev', from, to, { seed: () => seedRows(db, 'User', [{ role: 'ADMIN' }]) });

            // existing data survives the type recreation
            expect((await readRows(db, 'User'))[0]!['role']).toBe('ADMIN');
            // the removed value is gone and the remaining values are reordered
            const values = await withDb(db, async (k) => {
                const result = await sql<{ values: string[] }>`SELECT enum_range(NULL::"Role")::text[] AS values`.execute(k);
                return result.rows[0]!.values;
            });
            expect(values).toEqual(['ADMIN', 'USER']);
            await expect(seedRows(db, 'User', [{ role: 'GUEST' }])).rejects.toThrow();
            // the column default was restored after the recreate
            await withDb(db, (k) => k.insertInto('User').defaultValues().execute());
            expect((await readRows(db, 'User')).map((r) => r['role'])).toEqual(['ADMIN', 'USER']);
        } finally {
            await db.cleanup();
        }
    });

    it.runIf(provider === 'postgresql')('fails the enum recreate when a removed value is still in use', async () => {
        const db = await createTestDb(provider);
        try {
            const from = await compile(`enum Role { USER ADMIN GUEST }  model User { ${ID}  role Role }`, provider);
            const to = await compile(`enum Role { USER ADMIN }  model User { ${ID}  role Role }`, provider);
            await expect(
                runFlow(db, 'dev', from, to, { seed: () => seedRows(db, 'User', [{ role: 'GUEST' }]) }),
            ).rejects.toThrow();
        } finally {
            await db.cleanup();
        }
    });

    /** The literal MySQL column type of a column, e.g. `enum('USER','ADMIN')`. */
    async function mysqlColumnType(db: TestDb, table: string, column: string): Promise<string> {
        return withDb(db, async (k) => {
            const r = await sql<{ COLUMN_TYPE: string }>`
                SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
            `.execute(k);
            return r.rows[0]!.COLUMN_TYPE;
        });
    }

    it.runIf(provider === 'mysql')('appends a value to an existing enum', async () => {
        const db = await createTestDb(provider);
        try {
            const from = await compile(`enum Role { USER ADMIN }  model User { ${ID}  role Role }`, provider);
            const to = await compile(`enum Role { USER ADMIN SUPER }  model User { ${ID}  role Role }`, provider);
            await runFlow(db, 'dev', from, to);
            // the appended value is usable (proves MODIFY COLUMN restated the enum)
            await seedRows(db, 'User', [{ role: 'SUPER' }]);
            expect((await readRows(db, 'User'))[0]!['role']).toBe('SUPER');
            expect(await mysqlColumnType(db, 'User', 'role')).toBe("enum('USER','ADMIN','SUPER')");
        } finally {
            await db.cleanup();
        }
    });

    it.runIf(provider === 'mysql')('removes and reorders enum values via MODIFY COLUMN', async () => {
        const db = await createTestDb(provider);
        try {
            const from = await compile(
                `enum Role { USER ADMIN GUEST }  model User { ${ID}  role Role @default(USER) }`,
                provider,
            );
            const to = await compile(
                `enum Role { ADMIN USER }  model User { ${ID}  role Role @default(USER) }`,
                provider,
            );
            await runFlow(db, 'dev', from, to, { seed: () => seedRows(db, 'User', [{ role: 'ADMIN' }]) });

            // existing data survives the column modification
            expect((await readRows(db, 'User'))[0]!['role']).toBe('ADMIN');
            // the removed value is gone and the remaining values are reordered
            expect(await mysqlColumnType(db, 'User', 'role')).toBe("enum('ADMIN','USER')");
            await expect(seedRows(db, 'User', [{ role: 'GUEST' }])).rejects.toThrow();
            // the column default survived the MODIFY (MySQL has no `INSERT ... DEFAULT VALUES`,
            // so insert with just an explicit id and let `role` fall back to its default)
            await withDb(db, (k) => k.insertInto('User').values({ id: 999 }).execute());
            expect((await readRows(db, 'User')).map((r) => r['role'])).toEqual(['ADMIN', 'USER']);
        } finally {
            await db.cleanup();
        }
    });

    it.runIf(provider === 'mysql')('fails the enum shrink when a removed value is still in use', async () => {
        const db = await createTestDb(provider);
        try {
            const from = await compile(`enum Role { USER ADMIN GUEST }  model User { ${ID}  role Role }`, provider);
            const to = await compile(`enum Role { USER ADMIN }  model User { ${ID}  role Role }`, provider);
            // strict mode rejects the MODIFY while a row still holds the removed value
            await expect(
                runFlow(db, 'dev', from, to, { seed: () => seedRows(db, 'User', [{ role: 'GUEST' }]) }),
            ).rejects.toThrow();
        } finally {
            await db.cleanup();
        }
    });

    it.runIf(provider === 'mysql')('changes enum values on a renamed table', async () => {
        // regression: the enum-driven MODIFY COLUMN must target the post-rename table name
        const resolver: RenameResolver = {
            resolveTableRenames: () => [{ from: 'User', to: 'Person' }],
            resolveColumnRenames: () => [],
        };
        const db = await createTestDb(provider);
        try {
            const from = await compile(`enum Role { USER ADMIN GUEST }  model User { ${ID}  role Role }`, provider);
            const to = await compile(`enum Role { ADMIN USER }  model Person { ${ID}  role Role }`, provider);
            await runFlow(db, 'dev', from, to, {
                resolver,
                seed: () => seedRows(db, 'User', [{ role: 'ADMIN' }]),
            });

            // the row moved to the renamed table and survived the enum change
            expect((await readRows(db, 'Person'))[0]!['role']).toBe('ADMIN');
            expect(await mysqlColumnType(db, 'Person', 'role')).toBe("enum('ADMIN','USER')");
        } finally {
            await db.cleanup();
        }
    });
});
