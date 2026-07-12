import { describe, expect, it } from 'vitest';
import {
    compile,
    createTestDb,
    currentProvider,
    readRows,
    runFlow,
    seedRows,
    type Provider,
    type TestDb,
} from './support/harness';

/**
 * These tests assert what a migration does to the *data* already in the database, not just
 * to its *structure* (which `scenarios.test.ts` covers). Each case seeds a row into the
 * `from` state, runs the `from -> to` migration across all three flows (push / dev / deploy),
 * then reads the table back.
 *
 * Additive and removal changes preserve the surviving columns' data. Renames, however, are
 * currently implemented as drop + add (there is no true rename detection yet), so the seeded
 * value is dropped. Each rename case therefore asserts the *current* (lossy) behavior and
 * documents, in a comment, the outcome we want once rename detection lands — at which point
 * the assertion will start failing and must be updated to expect the preserved value.
 */

type Flow = 'push' | 'dev' | 'deploy';
const FLOWS: Flow[] = ['push', 'dev', 'deploy'];

const ID = 'id Int @id @default(autoincrement())';

interface Case {
    name: string;
    from: string;
    to: string;
    /** Seed a row into the `from` state. */
    seed: (db: TestDb) => Promise<void>;
    /** Table to read back after the migration. */
    readTable: string;
    /** Assert the observed outcome (see per-case comments for the desired future behavior). */
    assert: (rows: Record<string, unknown>[]) => void;
}

const CASES: Case[] = [
    {
        name: 'add an optional field preserves existing rows',
        from: `model User { ${ID}  name String }`,
        to: `model User { ${ID}  name String  email String? }`,
        seed: (db) => seedRows(db, 'User', [{ name: 'Alice' }]),
        readTable: 'User',
        assert: (rows) => {
            expect(rows).toHaveLength(1);
            expect(rows[0]!['name']).toBe('Alice');
            expect(rows[0]!['email']).toBeNull();
        },
    },
    {
        name: 'remove a field preserves other columns',
        from: `model User { ${ID}  name String  email String? }`,
        to: `model User { ${ID}  name String }`,
        seed: (db) => seedRows(db, 'User', [{ name: 'Alice', email: 'alice@example.com' }]),
        readTable: 'User',
        assert: (rows) => {
            expect(rows).toHaveLength(1);
            expect(rows[0]!['name']).toBe('Alice');
        },
    },
    {
        name: 'add a unique index preserves existing rows',
        from: `model User { ${ID}  email String }`,
        to: `model User { ${ID}  email String @unique }`,
        seed: (db) => seedRows(db, 'User', [{ email: 'alice@example.com' }]),
        readTable: 'User',
        assert: (rows) => {
            expect(rows).toHaveLength(1);
            expect(rows[0]!['email']).toBe('alice@example.com');
        },
    },
    {
        name: 'rename a field drops the value (no rename detection yet)',
        // optional so the added column can be created on a non-empty table
        from: `model User { ${ID}  name String? }`,
        to: `model User { ${ID}  fullName String? }`,
        seed: (db) => seedRows(db, 'User', [{ name: 'Alice' }]),
        readTable: 'User',
        assert: (rows) => {
            // The row survives, but `name` is dropped and `fullName` is added empty.
            // DESIRED once rename detection lands: rows[0].fullName === 'Alice'.
            expect(rows).toHaveLength(1);
            expect(rows[0]!['fullName']).toBeNull();
            expect(rows[0]).not.toHaveProperty('name');
        },
    },
    {
        name: 'rename a model drops the rows (no rename detection yet)',
        from: `model User { ${ID}  name String }`,
        to: `model Account { ${ID}  name String }`,
        seed: (db) => seedRows(db, 'User', [{ name: 'Alice' }]),
        readTable: 'Account',
        assert: (rows) => {
            // The old table is dropped and a fresh, empty one is created.
            // DESIRED once rename detection lands: the row moves to `Account` (length 1).
            expect(rows).toHaveLength(0);
        },
    },
];

const provider: Provider = currentProvider();

describe(`data preservation (${provider})`, () => {
    for (const c of CASES) {
        describe(c.name, () => {
            for (const flow of FLOWS) {
                it(flow, async () => {
                    const db = await createTestDb(provider);
                    try {
                        const from = await compile(c.from, provider);
                        const to = await compile(c.to, provider);
                        await runFlow(db, flow, from, to, { seed: () => c.seed(db) });
                        c.assert(await readRows(db, c.readTable));
                    } finally {
                        await db.cleanup();
                    }
                });
            }
        });
    }
});
