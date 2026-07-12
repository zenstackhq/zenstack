import { buildSnapshot, diffSnapshots } from '@zenstackhq/migration';
import { describe, expect, it } from 'vitest';
import { compile, createTestDb, currentProvider, readRows, runFlow, seedRows, type Provider } from './support/harness';

const provider: Provider = currentProvider();
const FLOWS = ['dev', 'deploy'] as const;

const PK_AB = `model M { a Int  b Int  note String  @@id([a, b]) }`;
const PK_ABC = `model M { a Int  b Int  note String  @@id([a, b, note]) }`;

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
