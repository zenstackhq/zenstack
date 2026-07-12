import { buildSnapshot, diffSnapshots } from '@zenstackhq/migration';
import { describe, expect, it } from 'vitest';
import { compile, createTestDb, currentProvider, readRows, runFlow, seedRows, type Provider } from './support/harness';

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
});
