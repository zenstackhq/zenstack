import { createPolicyTestClient } from '@zenstackhq/testtools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
        await expect(
            db.$setAuth({ id: 1 }).log.create({ data: { message: 'test', createdAt: new Date(Date.now() - 1000) } }),
        ).resolves.toMatchObject({
            message: 'test',
        });
    });

    // DateTime fields hold UTC wall-clock time in `timestamp` columns, so `now()` must not depend
    // on the session's time zone (which defaults to the server's and is often not UTC)
    describe.runIf(process.env['TEST_DB_PROVIDER'] === 'postgresql').each([
        // UTC-8 (POSIX zone names have inverted signs)
        'Etc/GMT+8',
        // UTC+9
        'Asia/Tokyo',
    ])('with PostgreSQL session time zone %s', (timeZone) => {
        let originalOptions: string | undefined;

        beforeAll(() => {
            // read by node-postgres when opening connections
            originalOptions = process.env['PGOPTIONS'];
            process.env['PGOPTIONS'] = `-c TimeZone=${timeZone}`;
        });

        afterAll(() => {
            if (originalOptions === undefined) {
                delete process.env['PGOPTIONS'];
            } else {
                process.env['PGOPTIONS'] = originalOptions;
            }
        });

        const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000);
        const hourLater = () => new Date(Date.now() + 60 * 60 * 1000);

        it.each([
            ['DateTime', 'publishedAt <= now()'],
            ['DateTime', 'now() >= publishedAt'],
            ['DateTime @db.Timestamp(3)', 'publishedAt <= now()'],
            ['DateTime @db.Timestamptz', 'publishedAt <= now()'],
            ['DateTime @db.Timestamptz(3)', 'now() >= publishedAt'],
        ])('compares %s fields with now() (%s)', async (type, rule) => {
            const db = await createPolicyTestClient(
                `
model Article {
    id          Int @id
    publishedAt ${type}
    @@allow('create', true)
    @@allow('read', ${rule})
}
`,
                // native types (`@db.*`) are only applied by Prisma
                { usePrismaPush: type.includes('@db.') },
            );
            // make sure the session runs in the time zone under test
            const current: { tz: string }[] = await db
                .$unuseAll()
                .$queryRawUnsafe(`select current_setting('TimeZone') as tz`);
            expect(current[0]!.tz).toBe(timeZone);

            await db.$unuseAll().article.create({ data: { id: 1, publishedAt: hourAgo() } });
            await db.$unuseAll().article.create({ data: { id: 2, publishedAt: hourLater() } });
            await expect(db.article.findMany()).resolves.toMatchObject([{ id: 1 }]);
        });

        it('compares related fields with now()', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id          Int @id
    activeUntil DateTime
    posts       Post[]
    @@allow('all', true)
}
model Post {
    id       Int @id
    authorId Int
    author   User @relation(fields: [authorId], references: [id])
    @@allow('create', true)
    @@allow('read', author.activeUntil > now())
}
`,
            );
            const raw = db.$unuseAll();
            await raw.user.create({ data: { id: 1, activeUntil: hourLater(), posts: { create: { id: 1 } } } });
            await raw.user.create({ data: { id: 2, activeUntil: hourAgo(), posts: { create: { id: 2 } } } });
            await expect(db.post.findMany()).resolves.toMatchObject([{ id: 1 }]);
        });

        it('compares create input with now()', async () => {
            const db = await createPolicyTestClient(
                `
model Event {
    id          Int @id
    scheduledAt DateTime
    @@allow('read', true)
    @@allow('create', scheduledAt > now())
}
`,
            );
            await expect(db.event.create({ data: { id: 1, scheduledAt: hourLater() } })).resolves.toMatchObject({
                id: 1,
            });
            await expect(db.event.create({ data: { id: 2, scheduledAt: hourAgo() } })).toBeRejectedByPolicy();
        });

        it('compares auth() fields with now()', async () => {
            const db = await createPolicyTestClient(
                `
type Auth {
    id        Int
    expiresAt DateTime
    @@auth
}
model Post {
    id Int @id
    @@allow('create', true)
    @@allow('read', auth().expiresAt > now())
}
`,
            );
            await db.$unuseAll().post.create({ data: { id: 1 } });
            await expect(db.$setAuth({ id: 1, expiresAt: hourLater() }).post.findMany()).resolves.toHaveLength(1);
            await expect(db.$setAuth({ id: 1, expiresAt: hourAgo() }).post.findMany()).resolves.toHaveLength(0);
        });
    });
});
