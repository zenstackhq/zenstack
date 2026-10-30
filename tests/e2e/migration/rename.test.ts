import { describe, expect, it } from 'vitest';
import { sql } from 'kysely';
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
    withDb,
    type Provider,
} from './support/harness';

/**
 * A resolver that treats every appearing table/column/enum as a rename of a disappearing one,
 * pairing them positionally. Deterministic and sufficient for the single-rename scenarios
 * here; it stands in for the CLI's interactive prompt.
 */
const renameAll: RenameResolver = {
    resolveTableRenames: ({ created, deleted }) => pair(created, deleted),
    resolveColumnRenames: ({ created, deleted }) => pair(created, deleted),
    resolveEnumRenames: ({ created, deleted }) => pair(created, deleted),
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

        it('turns an enum drop+create into a rename-enum when the resolver maps it', async () => {
            const from = buildSnapshot(
                await compile(`enum Status { ACTIVE INACTIVE }  model User { ${ID}  status Status }`, provider),
            );
            const to = buildSnapshot(
                await compile(`enum State { ACTIVE INACTIVE }  model User { ${ID}  status State }`, provider),
            );

            const plan = await resolveRenames(from, to, renameAll);
            const changes = diffSnapshots(from, to, plan);

            if (provider === 'postgresql') {
                // a single ALTER TYPE ... RENAME — using columns follow the type automatically
                expect(changes).toEqual([
                    expect.objectContaining({
                        kind: 'rename-enum',
                        from: 'Status',
                        to: expect.objectContaining({ name: 'State' }),
                    }),
                ]);
            } else {
                // MySQL/SQLite don't materialize the enum name (inline enum(...) / plain text),
                // so a pure rename needs no DDL — and no spurious alter/rebuild of using columns
                expect(changes).toEqual([]);
            }
        });

        it.runIf(provider === 'postgresql')('reconciles value changes against the renamed enum', async () => {
            const from = buildSnapshot(
                await compile(`enum Status { ACTIVE INACTIVE }  model User { ${ID}  status Status }`, provider),
            );
            const to = buildSnapshot(
                await compile(`enum State { ACTIVE INACTIVE ARCHIVED }  model User { ${ID}  status State }`, provider),
            );

            const plan = await resolveRenames(from, to, renameAll);
            const changes = diffSnapshots(from, to, plan);

            expect(changes).toEqual([
                expect.objectContaining({ kind: 'rename-enum', from: 'Status' }),
                expect.objectContaining({ kind: 'alter-enum-add-values', added: ['ARCHIVED'] }),
            ]);
        });

        it.runIf(provider === 'postgresql')('renames the pk constraint along with the table', async () => {
            const from = buildSnapshot(await compile(`model User { id Int @id  key Int }`, provider));
            const to = buildSnapshot(await compile(`model Account { id Int  key Int @id }`, provider));

            const plan = await resolveRenames(from, to, renameAll);
            const changes = diffSnapshots(from, to, plan);

            // the constraint rename must come after the table rename and before the PK
            // drop (which addresses the constraint by its `<table>_pkey` convention name)
            expect(changes.map((c) => c.kind)).toEqual([
                'rename-table',
                'rename-primary-key',
                'drop-primary-key',
                'add-primary-key',
            ]);
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

    describe('rename a model and move its primary key together', () => {
        for (const flow of FLOWS) {
            it(flow, async () => {
                const db = await createTestDb(provider);
                try {
                    const from = await compile(`model User { id Int @id  key Int }`, provider);
                    const to = await compile(`model Account { id Int  key Int @id }`, provider);
                    await runFlow(db, flow, from, to, {
                        resolver: renameAll,
                        seed: () => seedRows(db, 'User', [{ id: 1, key: 10 }]),
                    });

                    const rows = await readRows(db, 'Account');
                    expect(rows).toEqual([{ id: 1, key: 10 }]);

                    // the primary key moved: `id` accepts duplicates now, `key` no longer does
                    await seedRows(db, 'Account', [{ id: 1, key: 11 }]);
                    await expect(seedRows(db, 'Account', [{ id: 2, key: 10 }])).rejects.toThrow();

                    if (provider === 'postgresql') {
                        // the constraint kept the `<table>_pkey` convention through the rename
                        const conname = await withDb(db, async (k) => {
                            const result = await sql<{ conname: string }>`
                                SELECT con.conname FROM pg_constraint con
                                JOIN pg_class rel ON rel.oid = con.conrelid
                                WHERE con.contype = 'p' AND rel.relname = 'Account'
                            `.execute(k);
                            return result.rows[0]?.conname;
                        });
                        expect(conname).toBe('Account_pkey');
                    }
                } finally {
                    await db.cleanup();
                }
            });
        }
    });

    describe('rename an enum preserves the data', () => {
        for (const flow of FLOWS) {
            it(flow, async () => {
                const db = await createTestDb(provider);
                try {
                    const from = await compile(
                        `enum Status { ACTIVE INACTIVE }  model User { ${ID}  status Status @default(ACTIVE) }`,
                        provider,
                    );
                    const to = await compile(
                        `enum State { ACTIVE INACTIVE }  model User { ${ID}  status State @default(ACTIVE) }`,
                        provider,
                    );
                    await runFlow(db, flow, from, to, {
                        resolver: renameAll,
                        seed: () => seedRows(db, 'User', [{ status: 'INACTIVE' }]),
                    });

                    const rows = await readRows(db, 'User');
                    expect(rows).toHaveLength(1);
                    expect(rows[0]!['status']).toBe('INACTIVE'); // value carried over through the rename

                    if (provider === 'postgresql') {
                        // the type itself was renamed (not dropped and recreated)
                        const values = await withDb(db, async (k) => {
                            const result = await sql<{
                                values: string[];
                            }>`SELECT enum_range(NULL::"State")::text[] AS values`.execute(k);
                            return result.rows[0]!.values;
                        });
                        expect(values).toEqual(['ACTIVE', 'INACTIVE']);
                        // the column default survived and still works
                        await withDb(db, (k) => k.insertInto('User').defaultValues().execute());
                        expect((await readRows(db, 'User')).map((r) => r['status']).sort()).toEqual([
                            'ACTIVE',
                            'INACTIVE',
                        ]);
                    }
                } finally {
                    await db.cleanup();
                }
            });
        }
    });

    // #endregion
});
