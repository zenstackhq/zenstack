import { buildSnapshot, type RenameResolver } from '@zenstackhq/migration';
import { createTestClient } from '@zenstackhq/testtools';
import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import {
    compile,
    createTestDb,
    currentProvider,
    readRows,
    runFlow,
    seedRows,
    tableNames,
    withDb,
    type Provider,
    type TestDb,
} from './support/harness';
import { introspectPhysicalSchema } from './support/physical-schema';

/**
 * Implicit many-to-many relations (a pair of list relation fields) are backed by a join
 * table that has no model. These tests cover that the engine models it — so it is created,
 * left alone by later migrations, and never mistaken for a stray table — and that its layout
 * is the one the ORM's query builder expects. Physical parity with Prisma is covered by
 * `prisma-parity.test.ts`.
 */

const provider: Provider = currentProvider();
const ID = 'id Int @id @default(autoincrement())';

const POST_TAG = `model Post {
    ${ID}
    tags Tag[]
}
model Tag {
    ${ID}
    posts Post[]
}`;

/** Seeds one post, one tag, and the join row linking them. */
async function seedLink(db: TestDb, joinTable = '_PostToTag') {
    await seedRows(db, 'Post', [{ id: 1 }]);
    await seedRows(db, 'Tag', [{ id: 1 }]);
    await seedRows(db, joinTable, [{ A: 1, B: 1 }]);
}

describe(`implicit many-to-many join tables (${provider})`, () => {
    // #region snapshot-level behavior (no database)

    describe('snapshot', () => {
        it('models the join table with A/B columns referencing both sides', async () => {
            const snapshot = buildSnapshot(await compile(POST_TAG, provider));
            const join = snapshot.tables['_PostToTag']!;

            expect(Object.keys(join.columns)).toEqual(['A', 'B']);
            expect(join.columns['A']).toMatchObject({ type: 'Int', nullable: false, autoIncrement: false });
            expect(join.foreignKeys).toEqual([
                expect.objectContaining({ name: '_PostToTag_A_fkey', columns: ['A'], refTable: 'Post' }),
                expect.objectContaining({ name: '_PostToTag_B_fkey', columns: ['B'], refTable: 'Tag' }),
            ]);
            expect(join.foreignKeys.every((fk) => fk.onDelete === 'Cascade' && fk.onUpdate === 'Cascade')).toBe(true);

            if (provider === 'postgresql') {
                // Prisma v6+ makes the pair the primary key on PostgreSQL
                expect(join.primaryKey).toEqual(['A', 'B']);
                expect(join.primaryKeyName).toBe('_PostToTag_AB_pkey');
                expect(join.indexes.map((i) => i.name)).toEqual(['_PostToTag_B_index']);
            } else {
                expect(join.primaryKey).toEqual([]);
                expect(join.indexes).toEqual([
                    { name: '_PostToTag_AB_unique', columns: ['A', 'B'], unique: true },
                    { name: '_PostToTag_B_index', columns: ['B'], unique: false },
                ]);
            }
        });

        it('orders the sides by model name, not declaration order', async () => {
            const snapshot = buildSnapshot(
                await compile(
                    `model Tag {
                        ${ID}
                        posts Post[]
                    }
                    model Post {
                        ${ID}
                        tags Tag[]
                    }`,
                    provider,
                ),
            );
            expect(snapshot.tables['_PostToTag']!.foreignKeys.map((fk) => fk.refTable)).toEqual(['Post', 'Tag']);
        });

        it('names the table after an explicit relation name and follows @@map / @map', async () => {
            const snapshot = buildSnapshot(
                await compile(
                    `model Post {
                        ${ID}
                        cats Category[] @relation("PostCats")
                    }
                    model Category {
                        key   String @id @map("cat_key")
                        posts Post[] @relation("PostCats")

                        @@map("categories")
                    }`,
                    provider,
                ),
            );
            const join = snapshot.tables['_PostCats']!;
            expect(join.columns['A']!.type).toBe('String');
            expect(join.foreignKeys[0]).toMatchObject({ refTable: 'categories', refColumns: ['cat_key'] });
            expect(join.foreignKeys[1]).toMatchObject({ refTable: 'Post', refColumns: ['id'] });
        });

        it('builds a single join table for a self-relation', async () => {
            const snapshot = buildSnapshot(
                await compile(
                    `model Person {
                        ${ID}
                        following Person[] @relation("Follows")
                        followers Person[] @relation("Follows")
                    }`,
                    provider,
                ),
            );
            expect(Object.keys(snapshot.tables).sort()).toEqual(['Person', '_Follows']);
            expect(snapshot.tables['_Follows']!.foreignKeys.map((fk) => fk.refTable)).toEqual(['Person', 'Person']);
        });

        it('attaches a relation declared on a delegate base to the base model only', async () => {
            const snapshot = buildSnapshot(
                await compile(
                    `model Content {
                        ${ID}
                        type String
                        tags Tag[]

                        @@delegate(type)
                    }
                    model Post extends Content {
                        title String
                    }
                    model Tag {
                        ${ID}
                        contents Content[]
                    }`,
                    provider,
                ),
            );
            expect(Object.keys(snapshot.tables).filter((t) => t.startsWith('_'))).toEqual(['_ContentToTag']);
        });

        it('adds no join table for one-to-many or explicit many-to-many relations', async () => {
            const snapshot = buildSnapshot(
                await compile(
                    `model User {
                        ${ID}
                        posts Post[]
                        tags  UserTag[]
                    }
                    model Post {
                        ${ID}
                        author   User @relation(fields: [authorId], references: [id])
                        authorId Int
                    }
                    model Tag {
                        ${ID}
                        users UserTag[]
                    }
                    model UserTag {
                        user   User @relation(fields: [userId], references: [id])
                        userId Int
                        tag    Tag  @relation(fields: [tagId], references: [id])
                        tagId  Int

                        @@id([userId, tagId])
                    }`,
                    provider,
                ),
            );
            expect(Object.keys(snapshot.tables).sort()).toEqual(['Post', 'Tag', 'User', 'UserTag']);
        });
    });

    // #endregion

    // #region migration flows

    describe.each(['push', 'dev', 'deploy'] as const)('%s', (flow) => {
        it('keeps the join table and its rows across an unrelated change', async () => {
            const db = await createTestDb(provider);
            try {
                const from = await compile(POST_TAG, provider);
                const to = await compile(POST_TAG.replace('tags Tag[]', 'tags Tag[]\n    title String?'), provider);
                await runFlow(db, flow, from, to, { seed: (d) => seedLink(d) });

                expect(tableNames(await db.introspect())).toContain('_PostToTag');
                expect(await readRows(db, '_PostToTag')).toEqual([{ A: 1, B: 1 }]);
            } finally {
                await db.cleanup();
            }
        });

        it('drops the join table when the relation is removed', async () => {
            const db = await createTestDb(provider);
            try {
                const from = await compile(POST_TAG, provider);
                const to = await compile(`model Post { ${ID} }  model Tag { ${ID} }`, provider);
                await runFlow(db, flow, from, to);

                expect(tableNames(await db.introspect())).not.toContain('_PostToTag');
            } finally {
                await db.cleanup();
            }
        });
    });

    // skipped on MySQL: the rename re-creates the table's indexes under their new names
    // (drop old, then create new), and MySQL refuses to drop an index that backs a foreign
    // key — "Cannot drop index '_PostToTag_AB_unique': needed in a foreign key constraint"
    it.skipIf(provider === 'mysql')(
        'renames the join table, preserving its rows, when the relation is named',
        async () => {
            const renameAll: RenameResolver = {
                resolveTableRenames: ({ created, deleted }) => [{ from: deleted[0]!, to: created[0]! }],
            };
            const db = await createTestDb(provider);
            try {
                const from = await compile(POST_TAG, provider);
                const to = await compile(
                    POST_TAG.replace('tags Tag[]', 'tags Tag[] @relation("Tagging")').replace(
                        'posts Post[]',
                        'posts Post[] @relation("Tagging")',
                    ),
                    provider,
                );
                await runFlow(db, 'dev', from, to, { seed: (d) => seedLink(d), resolver: renameAll });

                const tables = tableNames(await db.introspect());
                expect(tables).toContain('_Tagging');
                expect(tables).not.toContain('_PostToTag');
                expect(await readRows(db, '_Tagging')).toEqual([{ A: 1, B: 1 }]);

                if (provider === 'postgresql') {
                    // the primary-key constraint follows the table rename
                    const physical = await introspectPhysicalSchema(db);
                    expect(physical.tables['_Tagging']!.primaryKey).toEqual({
                        name: '_Tagging_AB_pkey',
                        columns: ['A', 'B'],
                    });
                }
            } finally {
                await db.cleanup();
            }
        },
    );

    // a database built by Prisma < 6 carries the pair's uniqueness as an index, not the primary key
    it.runIf(provider === 'postgresql')('push leaves a legacy unique index on the join table alone', async () => {
        const db = await createTestDb(provider);
        try {
            const schema = await compile(POST_TAG, provider);
            await runFlow(db, 'push', undefined, schema);
            await withDb(db, async (k) => {
                await sql`ALTER TABLE "_PostToTag" DROP CONSTRAINT "_PostToTag_AB_pkey"`.execute(k);
                await sql`CREATE UNIQUE INDEX "_PostToTag_AB_unique" ON "_PostToTag"("A", "B")`.execute(k);
            });

            await runFlow(db, 'push', undefined, schema);

            const physical = await introspectPhysicalSchema(db);
            expect(physical.tables['_PostToTag']!.indexes).toContainEqual({
                name: '_PostToTag_AB_unique',
                columns: ['A', 'B'],
                unique: true,
            });
        } finally {
            await db.cleanup();
        }
    });

    // #endregion

    // #region agreement with the ORM

    describe('orm', () => {
        let client: any;

        afterEach(async () => {
            await client?.$disconnect();
        });

        it('reads and writes through an engine-created join table', async () => {
            // the test client's schema is created by the migration engine (no Prisma push)
            client = await createTestClient(
                `model Post {
                    ${ID}
                    title String
                    tags  Tag[]
                }
                model Tag {
                    ${ID}
                    name  String
                    posts Post[]
                }`,
            );

            await client.post.create({
                data: {
                    id: 1,
                    title: 'P1',
                    tags: {
                        create: [
                            { id: 1, name: 'T1' },
                            { id: 2, name: 'T2' },
                        ],
                    },
                },
            });
            await client.post.create({ data: { id: 2, title: 'P2', tags: { connect: { id: 1 } } } });

            const tag = await client.tag.findUnique({
                where: { id: 1 },
                include: { posts: { orderBy: { id: 'asc' } } },
            });
            expect(tag.posts.map((p: any) => p.title)).toEqual(['P1', 'P2']);

            await client.post.update({ where: { id: 1 }, data: { tags: { disconnect: { id: 1 } } } });
            const post = await client.post.findUnique({ where: { id: 1 }, include: { tags: true } });
            expect(post.tags.map((t: any) => t.name)).toEqual(['T2']);

            // deleting one side cascades to the join rows
            await client.tag.delete({ where: { id: 2 } });
            await expect(client.post.findUnique({ where: { id: 1 }, include: { tags: true } })).resolves.toMatchObject({
                tags: [],
            });
        });

        it('keeps the two directions of a self-relation apart', async () => {
            client = await createTestClient(
                `model Person {
                    ${ID}
                    name      String
                    following Person[] @relation("Follows")
                    followers Person[] @relation("Follows")
                }`,
            );

            await client.person.create({ data: { id: 1, name: 'Ann' } });
            await client.person.create({ data: { id: 2, name: 'Bob', following: { connect: { id: 1 } } } });

            const ann = await client.person.findUnique({
                where: { id: 1 },
                include: { followers: true, following: true },
            });
            expect(ann.followers.map((p: any) => p.name)).toEqual(['Bob']);
            expect(ann.following).toEqual([]);
        });
    });

    // #endregion
});
