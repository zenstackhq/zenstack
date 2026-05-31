import { createTestClient } from '@zenstackhq/testtools';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SoftDeletePlugin } from '../src';

// The `@deletedAt` attribute is defined in this plugin's `plugin.zmodel`. We feed it to the
// test client explicitly so that `@zenstackhq/testtools` doesn't need to depend on this plugin.
const PLUGIN_MODEL_FILE = fileURLToPath(new URL('../plugin.zmodel', import.meta.url));

function createSoftDeleteTestClient(schema: string) {
    return createTestClient(schema, { extraPluginModelFiles: [PLUGIN_MODEL_FILE] });
}

const schema = `
model User {
    id        Int       @id @default(autoincrement())
    email     String    @unique
    posts     Post[]
    deletedAt DateTime? @deletedAt
}

model Post {
    id        Int       @id @default(autoincrement())
    title     String
    author    User      @relation(fields: [authorId], references: [id])
    authorId  Int
    deletedAt DateTime? @deletedAt
}

model Tag {
    id   Int    @id @default(autoincrement())
    name String
}
`;

async function makeClient() {
    const raw = await createSoftDeleteTestClient(schema);
    const db = raw.$use(new SoftDeletePlugin());
    return { db, raw };
}

describe('soft-delete plugin', () => {
    it('hides soft-deleted rows from reads', async () => {
        const { db } = await makeClient();

        const a = await db.user.create({ data: { email: 'a@test.com' } });
        const b = await db.user.create({ data: { email: 'b@test.com' } });

        await db.user.delete({ where: { id: a.id } });

        await expect(db.user.findMany()).resolves.toEqual([
            expect.objectContaining({ id: b.id, email: 'b@test.com', deletedAt: null }),
        ]);

        await expect(db.user.findUnique({ where: { id: a.id } })).resolves.toBeNull();
        await expect(db.user.findUnique({ where: { id: b.id } })).resolves.toMatchObject({ id: b.id });
    });

    it('rewrites delete into update on the @deletedAt column', async () => {
        const { db, raw } = await makeClient();
        const user = await db.user.create({ data: { email: 'soft@test.com' } });

        // delete returns the affected record (whether its `deletedAt` reflects the new value
        // depends on the dialect's delete-return strategy — RETURNING vs select-then-mutate —
        // so we assert the persisted state below instead)
        const deleted = await db.user.delete({ where: { id: user.id } });
        expect(deleted).toMatchObject({ id: user.id, email: 'soft@test.com' });

        // the row is still physically present, just marked deleted (peek via plugin-less client)
        const row = await raw.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(row.deletedAt).not.toBeNull();
        expect(row.deletedAt!.getTime()).not.toBeNaN();
    });

    it('skips already soft-deleted rows on subsequent deletes and updates', async () => {
        const { db, raw } = await makeClient();
        const user = await db.user.create({ data: { email: 'one@test.com' } });

        const firstDelete = await db.user.delete({ where: { id: user.id } });
        expect(firstDelete).toMatchObject({ id: user.id });

        const firstDeletedAt = (await raw.user.findUniqueOrThrow({ where: { id: user.id } })).deletedAt!;

        // a follow-up delete should be a no-op (row already soft-deleted) and report a zero count
        const secondDelete = await db.user.deleteMany({ where: { id: user.id } });
        expect(secondDelete).toEqual({ count: 0 });
        const afterSecondDelete = await raw.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(afterSecondDelete.deletedAt!.getTime()).toBe(firstDeletedAt.getTime());

        // updateMany should also skip soft-deleted rows
        await db.user.updateMany({ where: { id: user.id }, data: { email: 'updated@test.com' } });
        const afterUpdate = await raw.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(afterUpdate.email).toBe('one@test.com');
    });

    it('soft-deletes a related row via a nested delete', async () => {
        const { db, raw } = await makeClient();
        const user = await db.user.create({
            data: { email: 'nested@test.com', posts: { create: [{ title: 'a' }, { title: 'b' }] } },
            include: { posts: true },
        });
        // pick by title — `include` has no orderBy, so array position isn't guaranteed
        const postA = user.posts.find((p: any) => p.title === 'a');
        const postB = user.posts.find((p: any) => p.title === 'b');

        // nested delete of a soft-delete child runs as a soft delete
        const updated = await db.user.update({
            where: { id: user.id },
            data: { posts: { delete: { id: postA!.id } } },
            include: { posts: true },
        });

        // the returned relation only surfaces the surviving post
        expect(updated.posts).toEqual([expect.objectContaining({ id: postB!.id, title: 'b', deletedAt: null })]);

        // post A is physically present but marked deleted; post B untouched
        // (read via the plugin-less `raw` client so the soft-delete filter doesn't hide it)
        const rowA = await raw.post.findUniqueOrThrow({ where: { id: postA!.id } });
        expect(rowA.deletedAt).not.toBeNull();

        const rowB = await raw.post.findUniqueOrThrow({ where: { id: postB!.id } });
        expect(rowB.deletedAt).toBeNull();
    });

    it('soft-deletes matching rows on deleteMany and reports the live count', async () => {
        const { db, raw } = await makeClient();
        const keep = await db.user.create({ data: { email: 'keep@x.com' } });
        const drop1 = await db.user.create({ data: { email: 'drop1@y.com' } });
        const drop2 = await db.user.create({ data: { email: 'drop2@y.com' } });
        // pre-soft-deleted row that also matches the filter — must not be re-counted
        const already = await db.user.create({ data: { email: 'already@y.com' } });
        await db.user.delete({ where: { id: already.id } });

        // only the two live matching rows are counted
        const result = await db.user.deleteMany({ where: { email: { endsWith: '@y.com' } } });
        expect(result).toEqual({ count: 2 });

        // matched rows are soft-deleted (marked, not physically removed)...
        const droppedRows = await raw.user.findMany({ where: { id: { in: [drop1.id, drop2.id] } } });
        expect(droppedRows).toHaveLength(2);
        for (const row of droppedRows) {
            expect(row.deletedAt).not.toBeNull();
        }

        // ...and reads only surface the untouched row
        await expect(db.user.findMany()).resolves.toEqual([
            expect.objectContaining({ id: keep.id, email: 'keep@x.com', deletedAt: null }),
        ]);
    });

    it('filters joined relations against the @deletedAt column', async () => {
        const { db } = await makeClient();
        const user = await db.user.create({ data: { email: 'rel@test.com' } });
        const live = await db.post.create({ data: { title: 'live', authorId: user.id } });
        const tombstoned = await db.post.create({ data: { title: 'gone', authorId: user.id } });

        await db.post.delete({ where: { id: tombstoned.id } });

        const reloaded = await db.user.findUniqueOrThrow({
            where: { id: user.id },
            include: { posts: true },
        });

        expect(reloaded.posts).toEqual([expect.objectContaining({ id: live.id, title: 'live' })]);
    });

    it('leaves models without @deletedAt untouched', async () => {
        const { db, raw } = await makeClient();

        const tag = await db.tag.create({ data: { name: 'keep' } });
        await db.tag.delete({ where: { id: tag.id } });

        await expect(db.tag.findUnique({ where: { id: tag.id } })).resolves.toBeNull();

        // physically gone (confirm via the plugin-less client)
        await expect(raw.tag.findUnique({ where: { id: tag.id } })).resolves.toBeNull();
    });

    it('rejects a non-nullable @deletedAt field', async () => {
        // A non-optional marker can never be null, so the IS NULL read filter would hide every row.
        const badSchema = `
model Post {
    id        Int      @id @default(autoincrement())
    title     String
    deletedAt DateTime @default(now()) @deletedAt
}
`;
        const raw = await createSoftDeleteTestClient(badSchema);
        const db = raw.$use(new SoftDeletePlugin());
        await expect(db.post.findMany()).rejects.toThrow(/"Post\.deletedAt".*not optional/);
    });

    it('rejects a model with more than one @deletedAt field', async () => {
        const twoFieldsSchema = `
model Post {
    id        Int       @id @default(autoincrement())
    title     String
    deletedAt DateTime? @deletedAt
    removedAt DateTime? @deletedAt
}
`;
        await expect(createSoftDeleteTestClient(twoFieldsSchema)).rejects.toThrow(
            /@deletedAt.*can only be applied to one field per model/,
        );
    });

    it('rejects a joined/multi-table delete that targets a soft-delete model', async () => {
        const { db, raw } = await makeClient();
        const user = await db.user.create({ data: { email: 'spam@test.com' } });
        const post = await db.post.create({ data: { title: 'spammy', authorId: user.id } });

        // A joined delete on Post (a soft-delete model) can't be rewritten into an @deletedAt update.
        await expect(
            db.$qb
                .deleteFrom('Post')
                .using('User')
                .whereRef('Post.authorId', '=', 'User.id')
                .where('User.email', '=', 'spam@test.com')
                .execute(),
        ).rejects.toThrow(/Cannot soft-delete from "Post".*single-table delete/s);

        // the row is untouched — neither hard- nor soft-deleted
        const row = await raw.post.findUniqueOrThrow({ where: { id: post.id } });
        expect(row.deletedAt).toBeNull();
    });

    it('rewrites a single-table $qb delete on a soft-delete model into an update', async () => {
        const { db, raw } = await makeClient();
        const user = await db.user.create({ data: { email: 'qb@test.com' } });

        // low-level Kysely delete still flows through the plugin's onKyselyQuery hook;
        // the rewritten update still reports the affected-row count as a delete result
        const result = await db.$qb.deleteFrom('User').where('id', '=', user.id).execute();
        expect(result).toEqual([{ numDeletedRows: 1n }]);

        // physically present, just marked deleted
        const row = await raw.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(row.deletedAt).not.toBeNull();

        // and hidden from reads through the plugin
        await expect(db.user.findUnique({ where: { id: user.id } })).resolves.toBeNull();
    });

    it('lets a $qb delete on a model without @deletedAt delete physically', async () => {
        const { db, raw } = await makeClient();
        const tag = await db.tag.create({ data: { name: 'qb-keep' } });

        const result = await db.$qb.deleteFrom('Tag').where('id', '=', tag.id).execute();
        expect(result).toEqual([{ numDeletedRows: 1n }]);

        await expect(raw.tag.findUnique({ where: { id: tag.id } })).resolves.toBeNull();
    });

    it('does not propagate the soft-delete to children (left to the user)', async () => {
        // The plugin intentionally does not cascade soft-deletes. Children of a soft-deleted
        // parent are left untouched; managing them is the user's responsibility.
        const cascadeSchema = `
model Parent {
    id        Int       @id @default(autoincrement())
    name      String
    children  Child[]
    deletedAt DateTime? @deletedAt
}

model Child {
    id        Int       @id @default(autoincrement())
    parent    Parent    @relation(fields: [parentId], references: [id])
    parentId  Int
    deletedAt DateTime? @deletedAt
}
`;
        const raw = await createSoftDeleteTestClient(cascadeSchema);
        const db = raw.$use(new SoftDeletePlugin());

        const parent = await db.parent.create({
            data: { name: 'p', children: { create: [{}, {}] } },
        });

        await db.parent.delete({ where: { id: parent.id } });

        // parent is soft-deleted...
        const parentRow = await raw.parent.findUniqueOrThrow({ where: { id: parent.id } });
        expect(parentRow.deletedAt).not.toBeNull();

        // ...but its children are left untouched
        const childRows = await raw.child.findMany({ where: { parentId: parent.id } });
        expect(childRows).toHaveLength(2);
        for (const row of childRows) {
            expect(row.deletedAt).toBeNull();
        }
    });

    it('lets a hard-delete cascade naturally at the database', async () => {
        // The parent has no @deletedAt, so its delete is a real DELETE. The plugin does not
        // interfere, so the DB-level onDelete: Cascade hard-deletes the children too.
        const cascadeSchema = `
model Parent {
    id       Int    @id @default(autoincrement())
    name     String
    children Child[]
}

model Child {
    id        Int       @id @default(autoincrement())
    parent    Parent    @relation(fields: [parentId], references: [id], onDelete: Cascade)
    parentId  Int
    deletedAt DateTime? @deletedAt
}
`;
        const raw = await createSoftDeleteTestClient(cascadeSchema);
        const db = raw.$use(new SoftDeletePlugin());

        const parent = await db.parent.create({
            data: { name: 'p', children: { create: [{}, {}] } },
        });

        await db.parent.delete({ where: { id: parent.id } });

        // parent and its children are physically gone
        await expect(raw.parent.findUnique({ where: { id: parent.id } })).resolves.toBeNull();
        await expect(raw.child.findMany({ where: { parentId: parent.id } })).resolves.toHaveLength(0);
    });
});
