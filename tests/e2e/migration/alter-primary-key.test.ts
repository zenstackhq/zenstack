import { buildSnapshot, diffSnapshots } from '@zenstackhq/migration';
import { describe, expect, it } from 'vitest';
import { compile, createTestDb, currentProvider, readRows, runFlow, seedRows, type Provider } from './support/harness';

const provider: Provider = currentProvider();
const FLOWS = ['dev', 'deploy'] as const;

const PK_AB = `model M { a Int  b Int  note String  @@id([a, b]) }`;
const PK_ABC = `model M { a Int  b Int  note String  @@id([a, b, note]) }`;

// single-field @id move (a -> b)
const ID_A = `model M { a Int @id  b Int }`;
const ID_B = `model M { a Int  b Int @id }`;

describe(`move single @id primary key (${provider})`, () => {
    it('diffs a single-@id move instead of unsupported', async () => {
        const changes = diffSnapshots(
            buildSnapshot(await compile(ID_A, provider)),
            buildSnapshot(await compile(ID_B, provider)),
        );
        expect(changes.some((c) => c.kind === 'unsupported')).toBe(false);
        if (provider === 'sqlite') {
            expect(changes.some((c) => c.kind === 'rebuild-table')).toBe(true);
        } else {
            expect(changes.some((c) => c.kind === 'drop-primary-key')).toBe(true);
            expect(
                changes.some((c) => c.kind === 'add-primary-key' && c.columns.length === 1 && c.columns[0] === 'b'),
            ).toBe(true);
        }
    });

    describe.each(FLOWS)('%s', (flow) => {
        it('moves the primary key to another column, preserving data', async () => {
            const db = await createTestDb(provider);
            try {
                const from = await compile(ID_A, provider);
                const to = await compile(ID_B, provider);
                await runFlow(db, flow, from, to, { seed: () => seedRows(db, 'M', [{ a: 1, b: 2 }]) });

                const rows = await readRows(db, 'M');
                expect(rows).toHaveLength(1);
                expect(Number(rows[0]!['a'])).toBe(1);
                expect(Number(rows[0]!['b'])).toBe(2);
            } finally {
                await db.cleanup();
            }
        });
    });
});

describe(`alter composite primary key (${provider})`, () => {
    it('diffs a composite PK change instead of unsupported', async () => {
        const changes = diffSnapshots(
            buildSnapshot(await compile(PK_AB, provider)),
            buildSnapshot(await compile(PK_ABC, provider)),
        );
        expect(changes.some((c) => c.kind === 'unsupported')).toBe(false);
        if (provider === 'sqlite') {
            expect(changes.some((c) => c.kind === 'rebuild-table')).toBe(true);
        } else {
            expect(changes.some((c) => c.kind === 'drop-primary-key')).toBe(true);
            expect(changes.some((c) => c.kind === 'add-primary-key')).toBe(true);
        }
    });

    describe.each(FLOWS)('%s', (flow) => {
        it('changes the composite primary key, preserving data', async () => {
            const db = await createTestDb(provider);
            try {
                const from = await compile(PK_AB, provider);
                const to = await compile(PK_ABC, provider);
                await runFlow(db, flow, from, to, { seed: () => seedRows(db, 'M', [{ a: 1, b: 2, note: 'x' }]) });

                const rows = await readRows(db, 'M');
                expect(rows).toHaveLength(1);
                expect(rows[0]!['note']).toBe('x');
            } finally {
                await db.cleanup();
            }
        });
    });
});
