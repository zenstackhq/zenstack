import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Timezone handling tests for postgres', () => {
    describe.each([
        {
            name: 'DateTime without timezone',
            withTimezone: false,
        },
        {
            name: 'DateTime with timezone',
            withTimezone: true,
        },
    ])('$name', ({ withTimezone }) => {
        const schema = `
model User {
    id Int @id @default(autoincrement())
    email String @unique
    name String?
    createdAt DateTime @default(now()) ${withTimezone ? '@db.Timestamptz' : ''}
    posts Post[]
}

model Post {
    id Int @id @default(autoincrement())
    title String
    publishedAt DateTime? ${withTimezone ? '@db.Timestamptz' : ''}
    createdAt DateTime @default(now()) ${withTimezone ? '@db.Timestamptz' : ''}
    authorId Int
    author User @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
        `;

        let client: any;

        beforeEach(async () => {
            client = await createTestClient(schema, {
                usePrismaPush: true,
                provider: 'postgresql',
            });
        });

        afterEach(async () => {
            await client?.$disconnect();
        });

        it('returns DateTime fields as JS Date objects', async () => {
            const testDate = new Date('2024-06-15T14:30:00.000Z');

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                    name: 'Test User',
                },
            });

            const post = await client.post.create({
                data: {
                    title: 'Test Post',
                    publishedAt: testDate,
                    authorId: user.id,
                },
            });

            expect(post.publishedAt).toBeInstanceOf(Date);
            expect(post.createdAt).toBeInstanceOf(Date);
            expect(user.createdAt).toBeInstanceOf(Date);
        });

        it('preserves exact datetime value on create and query', async () => {
            const testDate = new Date('2024-06-15T14:30:00.000Z');

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                },
            });

            const created = await client.post.create({
                data: {
                    title: 'Test Post',
                    publishedAt: testDate,
                    authorId: user.id,
                },
            });

            expect(created.publishedAt).toBeInstanceOf(Date);
            expect(created.publishedAt.toISOString()).toBe(testDate.toISOString());

            const queried = await client.post.findUnique({
                where: { id: created.id },
            });

            expect(queried.publishedAt).toBeInstanceOf(Date);
            expect(queried.publishedAt.toISOString()).toBe(testDate.toISOString());
        });

        it('preserves exact datetime value with different timezone offsets', async () => {
            // Test with a date that has a non-UTC timezone offset
            // When created with '2024-06-15T10:30:00-04:00', it should be stored as '2024-06-15T14:30:00Z'
            const testDate = new Date('2024-06-15T10:30:00-04:00');

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                },
            });

            const created = await client.post.create({
                data: {
                    title: 'Test Post',
                    publishedAt: testDate,
                    authorId: user.id,
                },
            });

            expect(created.publishedAt).toBeInstanceOf(Date);
            expect(created.publishedAt.getTime()).toBe(testDate.getTime());
            expect(created.publishedAt.toISOString()).toBe('2024-06-15T14:30:00.000Z');

            const queried = await client.post.findUnique({
                where: { id: created.id },
            });

            expect(queried.publishedAt).toBeInstanceOf(Date);
            expect(queried.publishedAt.getTime()).toBe(testDate.getTime());
            expect(queried.publishedAt.toISOString()).toBe('2024-06-15T14:30:00.000Z');
        });

        it('stores datetime as UTC in database', async () => {
            const testDate = new Date('2024-06-15T14:30:00.000Z');

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                },
            });

            const created = await client.post.create({
                data: {
                    title: 'Test Post',
                    publishedAt: testDate,
                    authorId: user.id,
                },
            });

            // Query the database directly using Kysely to verify UTC storage
            const rawResult = await client.$qb
                .selectFrom('Post')
                .select(['publishedAt'])
                .where('id', '=', created.id)
                .executeTakeFirst();

            // The raw value from database should be a Date object with UTC time
            expect(rawResult.publishedAt).toBeInstanceOf(Date);
            expect(rawResult.publishedAt.toISOString()).toBe('2024-06-15T14:30:00.000Z');
        });

        it('handles multiple posts with different timezones correctly', async () => {
            const dates = [
                new Date('2024-01-15T09:00:00Z'), // UTC
                new Date('2024-02-15T09:00:00-05:00'), // EST
                new Date('2024-03-15T09:00:00+09:00'), // JST
                new Date('2024-04-15T09:00:00+02:00'), // CEST
            ];

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                },
            });

            const createdPosts: any[] = [];
            for (let i = 0; i < dates.length; i++) {
                const post = await client.post.create({
                    data: {
                        title: `Post ${i + 1}`,
                        publishedAt: dates[i],
                        authorId: user.id,
                    },
                });
                createdPosts.push(post);
            }

            // Verify each post
            for (let i = 0; i < dates.length; i++) {
                const queried = await client.post.findUnique({
                    where: { id: createdPosts[i].id },
                });

                expect(queried).toBeTruthy();
                expect(queried.publishedAt).toBeInstanceOf(Date);
                expect(queried.publishedAt.getTime()).toBe(dates[i]?.getTime());
            }
        });

        it('handles date filtering correctly across timezones', async () => {
            const baseDate = new Date('2024-06-15T12:00:00Z');

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                },
            });

            await client.post.create({
                data: {
                    title: 'Before Post',
                    publishedAt: new Date(baseDate.getTime() - 3600000), // 1 hour before
                    authorId: user.id,
                },
            });

            const targetPost = await client.post.create({
                data: {
                    title: 'Target Post',
                    publishedAt: baseDate,
                    authorId: user.id,
                },
            });

            await client.post.create({
                data: {
                    title: 'After Post',
                    publishedAt: new Date(baseDate.getTime() + 3600000), // 1 hour after
                    authorId: user.id,
                },
            });

            // Query for posts published at exactly the base date
            const found = await client.post.findMany({
                where: {
                    publishedAt: baseDate,
                },
            });

            expect(found).toHaveLength(1);
            expect(found[0].id).toBe(targetPost.id);
        });

        it('handles update operations with timezone-aware dates', async () => {
            const initialDate = new Date('2024-06-15T10:00:00Z');
            const updatedDate = new Date('2024-06-15T15:00:00-05:00'); // 20:00 UTC

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                },
            });

            const created = await client.post.create({
                data: {
                    title: 'Test Post',
                    publishedAt: initialDate,
                    authorId: user.id,
                },
            });

            const updated = await client.post.update({
                where: { id: created.id },
                data: { publishedAt: updatedDate },
            });

            expect(updated.publishedAt).toBeInstanceOf(Date);
            expect(updated.publishedAt.getTime()).toBe(updatedDate.getTime());
            expect(updated.publishedAt.toISOString()).toBe('2024-06-15T20:00:00.000Z');

            const queried = await client.post.findUnique({
                where: { id: created.id },
            });

            expect(queried.publishedAt.getTime()).toBe(updatedDate.getTime());
        });

        it('returns DateTime fields correctly in nested relations (include)', async () => {
            const userCreatedAt = new Date('2024-01-01T10:00:00Z');
            const postPublishedAt = new Date('2024-06-15T14:30:00-05:00');

            // Create user with a specific createdAt using raw Kysely
            const userResult = await client.$qb
                .insertInto('User')
                .values({
                    email: 'user@test.com',
                    name: 'Test User',
                    // with query builder, when dealing with no-timezone timestamp, we need to
                    // pass ISO string to avoid any timezone conversion by pg
                    createdAt: withTimezone ? userCreatedAt : userCreatedAt.toISOString(),
                })
                .returning(['id'])
                .executeTakeFirstOrThrow();

            const post = await client.post.create({
                data: {
                    title: 'Test Post',
                    publishedAt: postPublishedAt,
                    authorId: userResult.id,
                },
            });

            // Query post with author included
            const postWithAuthor = await client.post.findUnique({
                where: { id: post.id },
                include: { author: true },
            });

            expect(postWithAuthor.publishedAt).toBeInstanceOf(Date);
            expect(postWithAuthor.publishedAt.getTime()).toBe(postPublishedAt.getTime());
            expect(postWithAuthor.createdAt).toBeInstanceOf(Date);

            expect(postWithAuthor.author.createdAt).toBeInstanceOf(Date);
            expect(postWithAuthor.author.createdAt.toISOString()).toBe(userCreatedAt.toISOString());

            // Query user with posts included
            const userWithPosts = await client.user.findUnique({
                where: { id: userResult.id },
                include: { posts: true },
            });

            expect(userWithPosts.createdAt).toBeInstanceOf(Date);
            expect(userWithPosts.createdAt.toISOString()).toBe(userCreatedAt.toISOString());

            expect(userWithPosts.posts).toHaveLength(1);
            expect(userWithPosts.posts[0].publishedAt).toBeInstanceOf(Date);
            expect(userWithPosts.posts[0].publishedAt.getTime()).toBe(postPublishedAt.getTime());
            expect(userWithPosts.posts[0].createdAt).toBeInstanceOf(Date);
        });

        it('returns DateTime fields correctly in nested create operations', async () => {
            const publishedAt = new Date('2024-06-15T10:30:00-04:00');

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                    name: 'Test User',
                    posts: {
                        create: [
                            {
                                title: 'Post 1',
                                publishedAt: publishedAt,
                            },
                            {
                                title: 'Post 2',
                                publishedAt: new Date('2024-06-16T10:30:00+02:00'),
                            },
                        ],
                    },
                },
                include: { posts: true },
            });

            expect(user.createdAt).toBeInstanceOf(Date);
            expect(user.posts).toHaveLength(2);

            expect(user.posts[0].publishedAt).toBeInstanceOf(Date);
            expect(user.posts[0].publishedAt.getTime()).toBe(publishedAt.getTime());
            expect(user.posts[0].createdAt).toBeInstanceOf(Date);

            expect(user.posts[1].publishedAt).toBeInstanceOf(Date);
            expect(user.posts[1].createdAt).toBeInstanceOf(Date);
        });

        it('handles findMany with nested includes and mixed timezones', async () => {
            const user1Date = new Date('2024-01-01T08:00:00-05:00');
            const user2Date = new Date('2024-01-02T08:00:00+09:00');

            // Create users with raw Kysely to control createdAt
            const user1Result = await client.$qb
                .insertInto('User')
                .values({
                    email: 'user1@test.com',
                    name: 'User 1',
                    createdAt: withTimezone ? user1Date : user1Date.toISOString(),
                })
                .returning(['id'])
                .executeTakeFirstOrThrow();

            const user2Result = await client.$qb
                .insertInto('User')
                .values({
                    email: 'user2@test.com',
                    name: 'User 2',
                    createdAt: withTimezone ? user2Date : user2Date.toISOString(),
                })
                .returning(['id'])
                .executeTakeFirstOrThrow();

            await client.post.create({
                data: {
                    title: 'Post 1',
                    publishedAt: new Date('2024-06-15T10:00:00-07:00'),
                    authorId: user1Result.id,
                },
            });

            await client.post.create({
                data: {
                    title: 'Post 2',
                    publishedAt: new Date('2024-06-16T15:00:00+01:00'),
                    authorId: user2Result.id,
                },
            });

            const usersWithPosts = await client.user.findMany({
                include: { posts: true },
                orderBy: { id: 'asc' },
            });

            expect(usersWithPosts).toHaveLength(2);

            expect(usersWithPosts[0].createdAt).toBeInstanceOf(Date);
            expect(usersWithPosts[0].createdAt.getTime()).toBe(user1Date.getTime());
            expect(usersWithPosts[0].posts[0].publishedAt).toBeInstanceOf(Date);
            expect(usersWithPosts[0].posts[0].createdAt).toBeInstanceOf(Date);

            expect(usersWithPosts[1].createdAt).toBeInstanceOf(Date);
            expect(usersWithPosts[1].createdAt.getTime()).toBe(user2Date.getTime());
            expect(usersWithPosts[1].posts[0].publishedAt).toBeInstanceOf(Date);
            expect(usersWithPosts[1].posts[0].createdAt).toBeInstanceOf(Date);
        });

        it('query builder: handles DateTime insert with different timezones', async () => {
            const userCreatedAt = new Date('2024-01-15T08:00:00-05:00');
            const postPublishedAt = new Date('2024-06-15T15:30:00+09:00');

            // Insert using query builder
            const userResult = await client.$qb
                .insertInto('User')
                .values({
                    email: 'qb-user@test.com',
                    name: 'QB User',
                    createdAt: withTimezone ? userCreatedAt : userCreatedAt.toISOString(),
                })
                .returning(['id', 'createdAt'])
                .executeTakeFirstOrThrow();

            expect(userResult.createdAt).toBeInstanceOf(Date);
            expect(userResult.createdAt.getTime()).toBe(userCreatedAt.getTime());

            const postResult = await client.$qb
                .insertInto('Post')
                .values({
                    title: 'QB Post',
                    publishedAt: withTimezone ? postPublishedAt : postPublishedAt.toISOString(),
                    authorId: userResult.id,
                    createdAt: withTimezone ? new Date() : new Date().toISOString(),
                })
                .returning(['id', 'publishedAt', 'createdAt'])
                .executeTakeFirstOrThrow();

            expect(postResult.publishedAt).toBeInstanceOf(Date);
            expect(postResult.publishedAt.getTime()).toBe(postPublishedAt.getTime());
            expect(postResult.publishedAt.toISOString()).toBe('2024-06-15T06:30:00.000Z');
            expect(postResult.createdAt).toBeInstanceOf(Date);
        });

        it('query builder: handles DateTime select and preserves timezone', async () => {
            const testDate = new Date('2024-06-15T10:30:00-07:00');

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                },
            });

            // Insert using query builder
            const insertResult = await client.$qb
                .insertInto('Post')
                .values({
                    title: 'QB Select Test',
                    publishedAt: withTimezone ? testDate : testDate.toISOString(),
                    authorId: user.id,
                    createdAt: withTimezone ? new Date() : new Date().toISOString(),
                })
                .returning(['id'])
                .executeTakeFirstOrThrow();

            // Select using query builder
            const selectResult = await client.$qb
                .selectFrom('Post')
                .select(['id', 'title', 'publishedAt', 'createdAt'])
                .where('id', '=', insertResult.id)
                .executeTakeFirstOrThrow();

            expect(selectResult.publishedAt).toBeInstanceOf(Date);
            expect(selectResult.publishedAt.getTime()).toBe(testDate.getTime());
            expect(selectResult.publishedAt.toISOString()).toBe('2024-06-15T17:30:00.000Z');
            expect(selectResult.createdAt).toBeInstanceOf(Date);
        });

        it('query builder: handles multiple DateTime inserts with mixed timezones', async () => {
            const dates = [
                { createdAt: new Date('2024-01-15T09:00:00Z'), publishedAt: new Date('2024-06-15T10:00:00Z') },
                {
                    createdAt: new Date('2024-02-15T09:00:00-05:00'),
                    publishedAt: new Date('2024-06-16T10:00:00-05:00'),
                },
                {
                    createdAt: new Date('2024-03-15T09:00:00+09:00'),
                    publishedAt: new Date('2024-06-17T10:00:00+09:00'),
                },
            ];

            const user = await client.user.create({
                data: {
                    email: 'user@test.com',
                },
            });

            const insertedIds: any[] = [];
            for (const dateSet of dates) {
                const result = await client.$qb
                    .insertInto('Post')
                    .values({
                        title: 'Multi Insert Test',
                        publishedAt: withTimezone ? dateSet.publishedAt : dateSet.publishedAt.toISOString(),
                        authorId: user.id,
                        createdAt: withTimezone ? dateSet.createdAt : dateSet.createdAt.toISOString(),
                    })
                    .returning(['id'])
                    .executeTakeFirstOrThrow();
                insertedIds.push(result.id);
            }

            // Verify all records using query builder select
            const results = await client.$qb
                .selectFrom('Post')
                .select(['id', 'publishedAt', 'createdAt'])
                .where('id', 'in', insertedIds)
                .orderBy('id', 'asc')
                .execute();

            expect(results).toHaveLength(3);

            for (let i = 0; i < results.length; i++) {
                const row = results[i];
                const expectedDates = dates[i];
                expect(row.publishedAt).toBeTruthy();
                expect(row.publishedAt).toBeInstanceOf(Date);
                expect((row.publishedAt as Date).getTime()).toBe(expectedDates!.publishedAt.getTime());
                expect(row.createdAt).toBeTruthy();
                expect(row.createdAt).toBeInstanceOf(Date);
                expect((row.createdAt as Date).getTime()).toBe(expectedDates!.createdAt.getTime());
            }
        });
    });

    // Regression for https://github.com/zenstackhq/zenstack/issues/2589 —
    // `@db.Time` values were returned as raw strings instead of Date when fetched through
    // a nested include (the lateral-join JSON path where pg's per-OID parsers don't fire).
    describe('@db.Time fields', () => {
        const schema = `
model Exchange {
    id             Int                     @id @default(autoincrement())
    name           String
    tradingWindows ExchangeTradingWindow[]
}

model ExchangeTradingWindow {
    id          Int      @id @default(autoincrement())
    exchangeId  Int
    exchange    Exchange @relation(fields: [exchangeId], references: [id], onDelete: Cascade)
    open        DateTime @db.Time(6)
    close       DateTime @db.Time(6)
    openTz      DateTime @db.Timetz(6)
}
        `;

        let client: any;

        beforeEach(async () => {
            client = await createTestClient(schema, {
                usePrismaPush: true,
                provider: 'postgresql',
            });
        });

        afterEach(async () => {
            await client?.$disconnect();
        });

        it('returns @db.Time / @db.Timetz fields as Date via nested include', async () => {
            const exchange = await client.exchange.create({ data: { name: 'NYSE' } });

            await client.$qb
                .insertInto('ExchangeTradingWindow')
                .values({
                    exchangeId: exchange.id,
                    open: '09:30:00',
                    close: '16:00:00',
                    openTz: '09:30:00+00',
                })
                .execute();

            const result = await client.exchange.findUnique({
                where: { id: exchange.id },
                include: { tradingWindows: true },
            });

            expect(result.tradingWindows).toHaveLength(1);
            const win = result.tradingWindows[0];

            expect(win.open).toBeInstanceOf(Date);
            expect(win.open.toISOString()).toBe('1970-01-01T09:30:00.000Z');
            expect(win.close).toBeInstanceOf(Date);
            expect(win.close.toISOString()).toBe('1970-01-01T16:00:00.000Z');
            expect(win.openTz).toBeInstanceOf(Date);
            expect(win.openTz.toISOString()).toBe('1970-01-01T09:30:00.000Z');
        });

        it('returns @db.Time fields as Date on a direct select', async () => {
            const exchange = await client.exchange.create({ data: { name: 'NYSE' } });

            await client.$qb
                .insertInto('ExchangeTradingWindow')
                .values({
                    exchangeId: exchange.id,
                    open: '09:30:00',
                    close: '16:00:00',
                    openTz: '09:30:00+00',
                })
                .execute();

            const windows = await client.exchangeTradingWindow.findMany({
                where: { exchangeId: exchange.id },
            });

            expect(windows).toHaveLength(1);
            expect(windows[0].open).toBeInstanceOf(Date);
            expect(windows[0].open.toISOString()).toBe('1970-01-01T09:30:00.000Z');
            expect(windows[0].close).toBeInstanceOf(Date);
            expect(windows[0].openTz).toBeInstanceOf(Date);
        });
    });
});
