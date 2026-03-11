import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('now() function in policy tests', () => {
    it('allows create when createdAt default now() is used in comparison', async () => {
        const db = await createPolicyTestClient(
            `
model Post {
    id Int @id @default(autoincrement())
    title String
    createdAt DateTime? @default(now())
    @@allow('create', createdAt != null)
    @@allow('read', true)
}
`,
        );

        // createdAt should be auto-filled with now(), satisfying the <= now() check
        await expect(db.post.create({ data: { title: 'hello' } })).resolves.toMatchObject({ title: 'hello' });
        const post = await db.post.findFirst();
        expect(post.createdAt).toBeInstanceOf(Date);
    });

    it('uses now() in update policy to compare against DateTime field', async () => {
        const db = await createPolicyTestClient(
            `
model Event {
    id Int @id @default(autoincrement())
    name String
    scheduledAt DateTime
    @@allow('create,read', true)
    @@allow('update', scheduledAt > now())
}
`,
        );

        // create an event in the future - should be updatable
        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        await db.event.create({ data: { name: 'future', scheduledAt: futureDate } });
        await expect(db.event.update({ where: { id: 1 }, data: { name: 'updated' } })).resolves.toMatchObject({
            name: 'updated',
        });

        // create an event in the past - should NOT be updatable
        const pastDate = new Date(Date.now() - 60 * 60 * 1000);
        await db.event.create({ data: { name: 'past', scheduledAt: pastDate } });
        await expect(db.event.update({ where: { id: 2 }, data: { name: 'updated' } })).toBeRejectedNotFound();
    });

    it('uses now() in read policy to filter DateTime field', async () => {
        const db = await createPolicyTestClient(
            `
model Article {
    id Int @id @default(autoincrement())
    title String
    publishedAt DateTime
    @@allow('create', true)
    @@allow('read', publishedAt <= now())
}
`,
        );

        const rawDb = db.$unuseAll();
        const pastDate = new Date(Date.now() - 60 * 60 * 1000);
        const futureDate = new Date(Date.now() + 60 * 60 * 1000);

        await rawDb.article.create({ data: { title: 'published', publishedAt: pastDate } });
        await rawDb.article.create({ data: { title: 'scheduled', publishedAt: futureDate } });

        // only the past article should be readable
        const articles = await db.article.findMany();
        expect(articles).toHaveLength(1);
        expect(articles[0].title).toBe('published');
    });

    it('uses now() in delete policy', async () => {
        const db = await createPolicyTestClient(
            `
model Task {
    id Int @id @default(autoincrement())
    name String
    expiresAt DateTime
    @@allow('create,read', true)
    @@allow('delete', expiresAt < now())
}
`,
        );

        // create an expired task - should be deletable
        const pastDate = new Date(Date.now() - 60 * 60 * 1000);
        await db.task.create({ data: { name: 'expired', expiresAt: pastDate } });
        await expect(db.task.delete({ where: { id: 1 } })).resolves.toMatchObject({ name: 'expired' });

        // create a non-expired task - should NOT be deletable
        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        await db.task.create({ data: { name: 'active', expiresAt: futureDate } });
        await expect(db.task.delete({ where: { id: 2 } })).toBeRejectedNotFound();
    });

    it('combines now() default with auth in create policy', async () => {
        const db = await createPolicyTestClient(
            `
type Auth {
    id Int
    @@auth
}

model Log {
    id Int @id @default(autoincrement())
    message String
    createdAt DateTime @default(now())
    @@allow('create', createdAt <= now() && auth() != null)
    @@allow('read', true)
}
`,
        );

        // anonymous user - rejected
        await expect(db.log.create({ data: { message: 'test' } })).toBeRejectedByPolicy();
        // authenticated user with auto-filled createdAt - allowed
        await expect(db.$setAuth({ id: 1 }).log.create({ data: { message: 'test' } })).resolves.toMatchObject({
            message: 'test',
        });
    });
});
