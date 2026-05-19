import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2674
describe('Regression for issue #2674', () => {
    it('@deny on PK should not break include (HasMany)', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id   String @id @default(cuid())
    role String
    @@allow('all', true)
}

model Post {
    id       Int       @id @default(autoincrement()) @deny('all', auth().role != 'ADMIN')
    title    String    @unique
    comments Comment[]
    @@allow('all', true)
}

model Comment {
    id      Int    @id @default(autoincrement())
    content String
    postId  Int
    post    Post   @relation(fields: [postId], references: [id])
    @@allow('all', true)
}
            `,
        );

        const admin = { id: 'admin-1', role: 'ADMIN' };
        const user = { id: 'user-1', role: 'USER' };

        await db.$setAuth(admin).post.create({
            data: {
                title: 'Test Post',
                comments: { create: [{ content: 'Comment 1' }, { content: 'Comment 2' }] },
            },
        });

        // Admin sees everything normally
        const adminResult = await db.$setAuth(admin).post.findUnique({
            where: { title: 'Test Post' },
            include: { comments: true },
        });
        expect(adminResult?.id).toBeGreaterThan(0);
        expect(adminResult?.comments).toHaveLength(2);

        // USER role: id is denied (returns null) but include should still populate comments
        const userResult = await db.$setAuth(user).post.findUnique({
            where: { title: 'Test Post' },
            include: { comments: true },
        });
        expect(userResult?.id).toBeNull();
        expect(userResult?.comments).toHaveLength(2);
    });

    it('@deny on FK hides the BelongsTo relation (by design)', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id   String @id @default(cuid())
    role String
    @@allow('all', true)
}

model Post {
    id       Int       @id @default(autoincrement())
    title    String
    comments Comment[]
    @@allow('all', true)
}

model Comment {
    id      Int    @id @default(autoincrement())
    content String
    postId  Int    @deny('all', auth().role != 'ADMIN')
    post    Post   @relation(fields: [postId], references: [id])
    @@allow('all', true)
}
            `,
        );

        const admin = { id: 'admin-1', role: 'ADMIN' };
        const user = { id: 'user-1', role: 'USER' };

        const post = await db.$setAuth(admin).post.create({
            data: { title: 'Test Post' },
        });

        const comment = await db.$setAuth(admin).comment.create({
            data: { content: 'A comment', postId: post.id },
        });

        // Positive control: ADMIN sees the FK and resolves the relation
        const adminResult = await db.$setAuth(admin).comment.findUnique({
            where: { id: comment.id },
            include: { post: true },
        });
        expect(adminResult?.postId).toBe(post.id);
        expect(adminResult?.post).not.toBeNull();

        // USER role: postId is denied — both the FK value and the relation are hidden (by design)
        const userResult = await db.$setAuth(user).comment.findUnique({
            where: { id: comment.id },
            include: { post: true },
        });
        expect(userResult?.postId).toBeNull();
        expect(userResult?.post).toBeNull();
    });

    it('@deny on both PK and FK should not break include', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id   String @id @default(cuid())
    role String
    @@allow('all', true)
}

model Post {
    id       Int       @id @default(autoincrement()) @deny('all', auth().role != 'ADMIN')
    title    String    @unique
    comments Comment[]
    @@allow('all', true)
}

model Comment {
    id      Int    @id @default(autoincrement())
    content String
    postId  Int    @deny('all', auth().role != 'ADMIN')
    post    Post   @relation(fields: [postId], references: [id])
    @@allow('all', true)
}
            `,
        );

        const admin = { id: 'admin-1', role: 'ADMIN' };
        const user = { id: 'user-1', role: 'USER' };

        await db.$setAuth(admin).post.create({
            data: {
                title: 'Test Post',
                comments: { create: [{ content: 'C1' }, { content: 'C2' }] },
            },
        });

        // Positive control: admin sees real id and two comments
        const adminResult = await db.$setAuth(admin).post.findUnique({
            where: { title: 'Test Post' },
            include: { comments: true },
        });
        expect(adminResult?.id).toBeGreaterThan(0);
        expect(adminResult?.comments).toHaveLength(2);

        // Find by non-denied field (title) so the WHERE is not affected by @deny on id
        const userResult = await db.$setAuth(user).post.findUnique({
            where: { title: 'Test Post' },
            include: { comments: true },
        });
        expect(userResult?.id).toBeNull();
        expect(userResult?.comments).toHaveLength(2);
        expect(userResult!.comments.every((c: { postId: number | null }) => c.postId === null)).toBe(true);
    });

    it('update-only @deny on PK/FK should not affect read joins', async () => {
        // @deny('update', ...) must not cause joinKeyRef to emit a __zs_raw_* alias that
        // was never projected (only read-scoped policies produce a CASE WHEN on select).
        const db = await createPolicyTestClient(
            `
model User {
    id   String @id @default(cuid())
    role String
    @@allow('all', true)
}

model Post {
    id       Int       @id @default(autoincrement()) @deny('update', auth().role != 'ADMIN')
    title    String    @unique
    comments Comment[]
    @@allow('all', true)
}

model Comment {
    id      Int    @id @default(autoincrement())
    content String
    postId  Int    @deny('update', auth().role != 'ADMIN')
    post    Post   @relation(fields: [postId], references: [id])
    @@allow('all', true)
}
            `,
        );

        const admin = { id: 'admin-1', role: 'ADMIN' };
        const user = { id: 'user-1', role: 'USER' };

        await db.$setAuth(admin).post.create({
            data: {
                title: 'Test Post',
                comments: { create: [{ content: 'C1' }, { content: 'C2' }] },
            },
        });

        const adminResult = await db.$setAuth(admin).post.findUnique({
            where: { title: 'Test Post' },
            include: { comments: true },
        });
        expect(adminResult?.id).toBeGreaterThan(0);
        expect(adminResult?.comments).toHaveLength(2);

        // Non-admin: update-scoped @deny must not affect read-time join resolution
        const userResult = await db.$setAuth(user).post.findUnique({
            where: { title: 'Test Post' },
            include: { comments: true },
        });
        expect(userResult?.id).toBeGreaterThan(0);
        expect(userResult?.comments).toHaveLength(2);
    });

    it('@allow("read", true) on PK/FK should not emit a missing raw alias', async () => {
        // @allow('read', true) collapses to a trivially-true filter so no CASE WHEN and no
        // __zs_raw_* alias is projected. joinKeyRef must use the plain column ref in this case.
        const db = await createPolicyTestClient(
            `
model User {
    id   String @id @default(cuid())
    role String
    @@allow('all', true)
}

model Post {
    id       Int       @id @default(autoincrement()) @allow('read', true)
    title    String    @unique
    comments Comment[]
    @@allow('all', true)
}

model Comment {
    id      Int    @id @default(autoincrement())
    content String
    postId  Int    @allow('read', true)
    post    Post   @relation(fields: [postId], references: [id])
    @@allow('all', true)
}
            `,
        );

        const admin = { id: 'admin-1', role: 'ADMIN' };
        const user = { id: 'user-1', role: 'USER' };

        await db.$setAuth(admin).post.create({
            data: {
                title: 'Test Post',
                comments: { create: [{ content: 'C1' }, { content: 'C2' }] },
            },
        });

        const adminResult = await db.$setAuth(admin).post.findUnique({
            where: { title: 'Test Post' },
            include: { comments: true },
        });
        expect(adminResult?.id).toBeGreaterThan(0);
        expect(adminResult?.comments).toHaveLength(2);

        // @allow('read', true) is a no-op policy; USER should see the same results
        const userResult = await db.$setAuth(user).post.findUnique({
            where: { title: 'Test Post' },
            include: { comments: true },
        });
        expect(userResult?.id).toBeGreaterThan(0);
        expect(userResult?.comments).toHaveLength(2);
    });

    it('@deny on PK should not break many-to-many include', async () => {
        // M2M join filtering uses joinKeyRef for both model PKs; verify the raw alias path is
        // exercised correctly in both the SQLite and lateral-join dialect M2M branches.
        // Explicit join model is required because SchemaDbPusher does not create implicit join tables.
        const db = await createPolicyTestClient(
            `
model User {
    id   String @id @default(cuid())
    role String
    @@allow('all', true)
}

model Post {
    id   Int         @id @default(autoincrement()) @deny('all', auth().role != 'ADMIN')
    title String     @unique
    tags  PostTag[]
    @@allow('all', true)
}

model Tag {
    id    Int       @id @default(autoincrement())
    name  String    @unique
    posts PostTag[]
    @@allow('all', true)
}

model PostTag {
    postId Int
    tagId  Int
    post   Post @relation(fields: [postId], references: [id])
    tag    Tag  @relation(fields: [tagId], references: [id])
    @@id([postId, tagId])
    @@allow('all', true)
}
            `,
        );

        const admin = { id: 'admin-1', role: 'ADMIN' };
        const user = { id: 'user-1', role: 'USER' };

        const alpha = await db.$setAuth(admin).tag.create({ data: { name: 'alpha' } });
        const beta = await db.$setAuth(admin).tag.create({ data: { name: 'beta' } });
        await db.$setAuth(admin).post.create({
            data: {
                title: 'Tagged Post',
                tags: { create: [{ tagId: alpha.id }, { tagId: beta.id }] },
            },
        });

        // Admin: PK policy compiles to a no-deny expression; raw alias still projected and join works
        const adminResult = await db.$setAuth(admin).post.findUnique({
            where: { title: 'Tagged Post' },
            include: { tags: true },
        });
        expect(adminResult?.id).toBeGreaterThan(0);
        expect(adminResult?.tags).toHaveLength(2);

        // User: PK is denied (returns null) but join through PostTag must still load the tags
        const userResult = await db.$setAuth(user).post.findUnique({
            where: { title: 'Tagged Post' },
            include: { tags: true },
        });
        expect(userResult?.id).toBeNull();
        expect(userResult?.tags).toHaveLength(2);
    });
});
