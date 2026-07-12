import { describe, expect, it } from 'vitest';
import { buildSnapshot, diffSnapshots, resolveRenames, type RenameResolver } from '@zenstackhq/migration';
import {
    columnNames,
    compile,
    createTestDb,
    currentProvider,
    readRows,
    runFlow,
    seedRows,
    tableNames,
    type Provider,
} from './support/harness';

/**
 * A resolver that treats every appearing table/column as a rename of a disappearing one,
 * pairing them positionally. Deterministic and sufficient for the single-rename scenarios
 * here; it stands in for the CLI's interactive prompt.
 */
const renameAll: RenameResolver = {
    resolveTableRenames: ({ created, deleted }) => pair(created, deleted),
    resolveColumnRenames: ({ created, deleted }) => pair(created, deleted),
};
function pair(created: string[], deleted: string[]) {
    return created
        .map((to, i) => ({ from: deleted[i]!, to }))
        .filter((m): m is { from: string; to: string } => m.from !== undefined);
}

const ID = 'id Int @id @default(autoincrement())';
const provider: Provider = currentProvider();
const FLOWS = ['dev', 'deploy'] as const;

describe(`rename resolution (${provider})`, () => {
    // #region diff-level behavior (no database)

    describe('diff', () => {
        it('turns a column drop+create into a rename-column when the resolver maps it', async () => {
            const from = buildSnapshot(await compile(`model User { ${ID}  name String }`, provider));
            const to = buildSnapshot(await compile(`model User { ${ID}  fullName String }`, provider));

            const plan = await resolveRenames(from, to, renameAll);
            const changes = diffSnapshots(from, to, plan);

            expect(
                changes.some((c) => c.kind === 'rename-column' && c.from === 'name' && c.column.name === 'fullName'),
            ).toBe(true);
            expect(changes.some((c) => c.kind === 'add-column' || c.kind === 'drop-column')).toBe(false);
        });

        it('turns a table drop+create into a rename-table when the resolver maps it', async () => {
            const from = buildSnapshot(await compile(`model User { ${ID}  name String }`, provider));
            const to = buildSnapshot(await compile(`model Account { ${ID}  name String }`, provider));

            const plan = await resolveRenames(from, to, renameAll);
            const changes = diffSnapshots(from, to, plan);

            expect(changes.some((c) => c.kind === 'rename-table' && c.from === 'User' && c.to.name === 'Account')).toBe(
                true,
            );
            expect(changes.some((c) => c.kind === 'create-table' || c.kind === 'drop-table')).toBe(false);
        });

        it('falls back to drop + create with no resolver', async () => {
            const from = buildSnapshot(await compile(`model User { ${ID}  name String }`, provider));
            const to = buildSnapshot(await compile(`model User { ${ID}  fullName String }`, provider));

            const plan = await resolveRenames(from, to); // no resolver
            const changes = diffSnapshots(from, to, plan);

            expect(changes.some((c) => c.kind === 'add-column')).toBe(true);
            expect(changes.some((c) => c.kind === 'drop-column')).toBe(true);
            expect(changes.some((c) => c.kind === 'rename-column')).toBe(false);
        });
    });

    // #endregion

    // #region end-to-end data preservation

    describe('rename a field preserves the data', () => {
        for (const flow of FLOWS) {
            it(flow, async () => {
                const db = await createTestDb(provider);
                try {
                    const from = await compile(`model User { ${ID}  name String }`, provider);
                    const to = await compile(`model User { ${ID}  fullName String }`, provider);
                    await runFlow(db, flow, from, to, {
                        resolver: renameAll,
                        seed: () => seedRows(db, 'User', [{ name: 'Alice' }]),
                    });

                    const rows = await readRows(db, 'User');
                    expect(rows).toHaveLength(1);
                    expect(rows[0]!['fullName']).toBe('Alice'); // value carried over from `name`
                    expect(columnNames(await db.introspect(), 'User')).toEqual(['fullName', 'id']);
                } finally {
                    await db.cleanup();
                }
            });
        }
    });

    describe('rename a model preserves the data', () => {
        for (const flow of FLOWS) {
            it(flow, async () => {
                const db = await createTestDb(provider);
                try {
                    const from = await compile(`model User { ${ID}  name String }`, provider);
                    const to = await compile(`model Account { ${ID}  name String }`, provider);
                    await runFlow(db, flow, from, to, {
                        resolver: renameAll,
                        seed: () => seedRows(db, 'User', [{ name: 'Alice' }]),
                    });

                    const intro = await db.introspect();
                    expect(tableNames(intro)).toContain('Account');
                    expect(tableNames(intro)).not.toContain('User');

                    const rows = await readRows(db, 'Account');
                    expect(rows).toHaveLength(1);
                    expect(rows[0]!['name']).toBe('Alice'); // row moved to the renamed table
                } finally {
                    await db.cleanup();
                }
            });
        }
    });

    // #endregion
});
