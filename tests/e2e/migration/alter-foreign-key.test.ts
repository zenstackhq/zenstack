import { buildSnapshot, diffSnapshots } from '@zenstackhq/migration';
import { describe, expect, it } from 'vitest';
import {
    columnNames,
    compile,
    createTestDb,
    currentProvider,
    hasForeignKey,
    readRows,
    runFlow,
    seedRows,
    type Provider,
} from './support/harness';

const ID = 'id Int @id @default(autoincrement())';
const provider: Provider = currentProvider();
const FLOWS = ['dev', 'deploy'] as const;

// A relation whose FK column already exists (so the FK is added/dropped on an existing column).
const WITHOUT_FK = `model User { ${ID}  name String }  model Post { ${ID}  authorId Int }`;
const WITH_FK = `model User { ${ID}  name String  posts Post[] }  model Post { ${ID}  authorId Int  author User @relation(fields: [authorId], references: [id]) }`;
const WITH_FK_CASCADE = WITH_FK.replace('references: [id])', 'references: [id], onDelete: Cascade)');

const seedUserAndPost = async (db: Parameters<typeof seedRows>[0]) => {
    await seedRows(db, 'User', [{ name: 'U' }]); // id -> 1
    await seedRows(db, 'Post', [{ authorId: 1 }]);
};

describe(`alter foreign key (${provider})`, () => {
    it('diffs an FK added on existing columns instead of unsupported', async () => {
        const changes = diffSnapshots(
            buildSnapshot(await compile(WITHOUT_FK, provider)),
            buildSnapshot(await compile(WITH_FK, provider)),
        );
        expect(changes.some((c) => c.kind === 'unsupported')).toBe(false);
        if (provider === 'sqlite') {
            expect(changes.some((c) => c.kind === 'rebuild-table')).toBe(true);
        } else {
            expect(changes.some((c) => c.kind === 'add-foreign-key')).toBe(true);
        }
    });

    it('detects an onDelete change as a drop + re-add', async () => {
        const changes = diffSnapshots(
            buildSnapshot(await compile(WITH_FK, provider)),
            buildSnapshot(await compile(WITH_FK_CASCADE, provider)),
        );
        if (provider === 'sqlite') {
            expect(changes.some((c) => c.kind === 'rebuild-table')).toBe(true);
        } else {
            expect(changes.some((c) => c.kind === 'drop-foreign-key')).toBe(true);
            expect(changes.some((c) => c.kind === 'add-foreign-key')).toBe(true);
        }
    });

    describe.each(FLOWS)('%s', (flow) => {
        it('adds a foreign key on an existing column, preserving data', async () => {
            const db = await createTestDb(provider);
            try {
                const from = await compile(WITHOUT_FK, provider);
                const to = await compile(WITH_FK, provider);
                await runFlow(db, flow, from, to, { seed: () => seedUserAndPost(db) });

                expect(hasForeignKey(await db.introspect(), 'Post', 'User')).toBe(true);
                expect(Number((await readRows(db, 'Post'))[0]!['authorId'])).toBe(1);
            } finally {
                await db.cleanup();
            }
        });

        it('drops a foreign key while keeping its column', async () => {
            const db = await createTestDb(provider);
            try {
                const from = await compile(WITH_FK, provider);
                const to = await compile(WITHOUT_FK, provider);
                await runFlow(db, flow, from, to, { seed: () => seedUserAndPost(db) });

                const intro = await db.introspect();
                expect(hasForeignKey(intro, 'Post', 'User')).toBe(false);
                expect(columnNames(intro, 'Post')).toContain('authorId');
            } finally {
                await db.cleanup();
            }
        });
    });
});
