import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/basic';
import { createPosts, createUser } from './utils';

describe('Client find tests ', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('returns correct data rows', async () => {
        let r = await client.user.findMany();
        expect(r).toHaveLength(0);

        const user = await createUser(client, 'u1@test.com');
        await createPosts(client, user.id);

        r = await client.user.findMany();
        expect(r).toHaveLength(1);
        expect(r[0]?.createdAt).toBeInstanceOf(Date);

        r = await client.user.findMany({ where: { id: user.id } });
        expect(r).toHaveLength(1);

        const post = await client.post.findFirst();
        expect(post?.published).toBeTypeOf('boolean');

        r = await client.user.findMany({ where: { id: 'none' } });
        expect(r).toHaveLength(0);

        await createUser(client, 'u2@test.com');

        await expect(client.user.findMany()).resolves.toHaveLength(2);
        await expect(client.user.findMany({ where: { email: 'u2@test.com' } })).resolves.toHaveLength(1);
    });

    it('works with take and skip', async () => {
        await createUser(client, 'u1@test.com', { id: '1' });
        await createUser(client, 'u02@test.com', { id: '2' });
        await createUser(client, 'u3@test.com', { id: '3' });

        // take
        await expect(client.user.findMany({ take: 1 })).resolves.toHaveLength(1);
        await expect(client.user.findMany({ take: 2 })).resolves.toHaveLength(2);
        await expect(client.user.findMany({ take: 4 })).resolves.toHaveLength(3);

        // findFirst's take must be 1
        await expect(client.user.findFirst({ take: 2 })).toBeRejectedByValidation();
        await expect(client.user.findFirst({ take: 1 })).toResolveTruthy();

        // skip
        await expect(client.user.findMany({ skip: 1 })).resolves.toHaveLength(2);
        await expect(client.user.findMany({ skip: 2 })).resolves.toHaveLength(1);

        // explicit sort
        await expect(
            client.user.findFirst({
                skip: 2,
                orderBy: { email: 'desc' },
            }),
        ).resolves.toMatchObject({
            email: 'u02@test.com',
        });

        // allows duplicate sort fields
        await expect(
            client.user.findFirst({
                skip: 2,
                orderBy: [{ email: 'desc' }, { email: 'desc' }],
            }),
        ).resolves.toMatchObject({
            email: 'u02@test.com',
        });

        // take + skip
        await expect(client.user.findMany({ take: 1, skip: 1 })).resolves.toHaveLength(1);
        await expect(client.user.findMany({ take: 3, skip: 2 })).resolves.toHaveLength(1);

        // negative take, default sort is negated
        await expect(client.user.findMany({ take: -2 })).toResolveWithLength(2);
        await expect(client.user.findMany({ take: -2, orderBy: { id: 'asc' } })).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: '3' }), expect.objectContaining({ id: '2' })]),
        );
        await expect(client.user.findMany({ skip: 1, take: -1, orderBy: { id: 'asc' } })).resolves.toEqual([
            expect.objectContaining({ id: '2' }),
        ]);

        // negative take, explicit sort is negated
        await expect(
            client.user.findMany({
                skip: 1,
                take: -2,
                orderBy: { email: 'asc' },
            }),
        ).resolves.toEqual([
            expect.objectContaining({ email: 'u02@test.com' }),
            expect.objectContaining({ email: 'u1@test.com' }),
        ]);
    });

    it('works with orderBy', async () => {
        const user1 = await createUser(client, 'u1@test.com', {
            role: 'USER',
            name: null,
            profile: { create: { bio: 'My bio' } },
        });
        const user2 = await createUser(client, 'u2@test.com', {
            role: 'ADMIN',
            name: 'User2',
            profile: { create: { bio: 'My other bio' } },
        });
        await createPosts(client, user1.id);

        await expect(client.user.findFirst({ orderBy: { email: 'asc' } })).resolves.toMatchObject({
            email: 'u1@test.com',
        });

        await expect(client.user.findFirst({ orderBy: { email: 'desc' } })).resolves.toMatchObject({
            email: 'u2@test.com',
        });

        // multiple sorting conditions in array
        await expect(
            client.user.findFirst({
                orderBy: [{ role: 'asc' }, { email: 'desc' }],
            }),
        ).resolves.toMatchObject({ email: 'u2@test.com' });

        // null first
        await expect(
            client.user.findFirst({
                orderBy: { name: { sort: 'asc', nulls: 'first' } },
            }),
        ).resolves.toMatchObject({ email: 'u1@test.com' });

        // null last
        await expect(
            client.user.findFirst({
                orderBy: { name: { sort: 'asc', nulls: 'last' } },
            }),
        ).resolves.toMatchObject({ email: 'u2@test.com' });

        // by to-many relation
        await expect(
            client.user.findFirst({
                orderBy: { posts: { _count: 'desc' } },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                orderBy: { posts: { _count: 'asc' } },
            }),
        ).resolves.toMatchObject(user2);

        // by to-one relation
        await expect(
            client.user.findFirst({
                orderBy: { profile: { bio: 'asc' } },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                orderBy: [{ profile: { bio: 'asc' } }, { profile: { bio: 'asc' } }],
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                orderBy: { profile: { bio: 'desc' } },
            }),
        ).resolves.toMatchObject(user2);
    });

    it('works with cursor', async () => {
        const user1 = await createUser(client, 'u1@test.com', {
            id: '1',
            role: 'ADMIN',
        });
        const user2 = await createUser(client, 'u2@test.com', {
            id: '2',
            role: 'USER',
        });
        const user3 = await createUser(client, 'u3@test.com', {
            id: '3',
            role: 'ADMIN',
        });

        // cursor is inclusive
        await expect(
            client.user.findMany({
                cursor: { id: user2.id },
                orderBy: { id: 'asc' },
            }),
        ).resolves.toEqual([user2, user3]);

        // skip cursor
        await expect(
            client.user.findMany({
                skip: 1,
                cursor: { id: user1.id },
                orderBy: { id: 'asc' },
            }),
        ).resolves.toEqual([user2, user3]);

        // custom orderBy
        await expect(
            client.user.findMany({
                skip: 1,
                cursor: { id: user2.id },
                orderBy: { email: 'desc' },
            }),
        ).resolves.toEqual([user1]);

        // multiple orderBy
        await expect(
            client.user.findMany({
                skip: 1,
                cursor: { id: user1.id },
                orderBy: [{ role: 'desc' }, { id: 'asc' }],
            }),
        ).resolves.toEqual([user3]);

        // multiple cursor
        await expect(
            client.user.findMany({
                skip: 1,
                cursor: { id: user1.id, role: 'ADMIN' },
                orderBy: { id: 'asc' },
            }),
        ).resolves.toEqual([user2, user3]);

        // non-existing cursor
        await expect(
            client.user.findMany({
                skip: 1,
                cursor: { id: 'none' },
            }),
        ).resolves.toEqual([]);

        // backward from cursor
        await expect(
            client.user.findMany({
                skip: 1,
                take: -2,
                cursor: { id: user3.id },
                orderBy: { id: 'asc' },
            }),
        ).resolves.toEqual([user1, user2]);
    });

    it('works with distinct', async () => {
        if (['sqlite', 'mysql'].includes(client.$schema.provider.type)) {
            await expect(client.user.findMany({ distinct: ['role'] } as any)).rejects.toThrow('not supported');
            return;
        }

        const user1 = await createUser(client, 'u1@test.com', {
            name: 'Admin1',
            role: 'ADMIN',
            profile: { create: { bio: 'Bio1' } },
            posts: { create: [{ title: 'Post1' }, { title: 'Post1' }, { title: 'Post2' }] },
        });
        await createUser(client, 'u3@test.com', {
            name: 'User',
            role: 'USER',
        });
        await createUser(client, 'u2@test.com', {
            name: 'Admin2',
            role: 'ADMIN',
            profile: { create: { bio: 'Bio1' } },
        });
        await createUser(client, 'u4@test.com', {
            name: 'User',
            role: 'USER',
        });

        // single field distinct
        let r: any = await client.user.findMany({ distinct: ['role'] } as any);
        expect(r).toHaveLength(2);
        expect(r).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ role: 'ADMIN' }),
                expect.objectContaining({ role: 'USER' }),
            ]),
        );

        // distinct in relation
        r = await client.user.findUnique({
            where: { id: user1.id },
            include: { posts: { distinct: ['title'] } as any },
        });
        expect(r.posts).toHaveLength(2);

        // distinct with include
        r = await client.user.findMany({ distinct: ['role'], include: { profile: true } } as any);
        expect(r).toHaveLength(2);
        expect(r).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ role: 'ADMIN', profile: expect.any(Object) }),
                expect.objectContaining({ role: 'USER', profile: null }),
            ]),
        );

        // distinct with select
        r = await client.user.findMany({ distinct: ['role'], select: { email: true } } as any);
        expect(r).toHaveLength(2);
        expect(r).toEqual(expect.arrayContaining([{ email: expect.any(String) }, { email: expect.any(String) }]));

        // multiple fields distinct
        r = await client.user.findMany({
            distinct: ['role', 'name'],
        } as any);
        expect(r).toHaveLength(3);
        expect(r).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Admin1', role: 'ADMIN' }),
                expect.objectContaining({ name: 'Admin2', role: 'ADMIN' }),
                expect.objectContaining({ name: 'User', role: 'USER' }),
            ]),
        );
    });

    it('works with nested skip, take, orderBy', async () => {
        await createUser(client, 'u1@test.com', {
            posts: {
                create: [
                    { id: '1', title: 'Post1' },
                    { id: '2', title: 'Post2' },
                    { id: '3', title: 'Post3' },
                ],
            },
        });

        await expect(
            client.user.findFirst({
                include: {
                    posts: { orderBy: { title: 'desc' }, skip: 2, take: 1 },
                },
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                posts: [expect.objectContaining({ id: '1' })],
            }),
        );

        await expect(
            client.user.findFirst({
                include: {
                    posts: {
                        skip: 1,
                        take: -2,
                        orderBy: { id: 'asc' },
                    },
                },
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                posts: [expect.objectContaining({ id: '1' }), expect.objectContaining({ id: '2' })],
            }),
        );
    });

    it('works with unique finds', async () => {
        let r = await client.user.findUnique({ where: { id: 'none' } });
        expect(r).toBeNull();

        const user = await createUser(client);

        r = await client.user.findUnique({ where: { id: user.id } });
        expect(r).toMatchObject({ id: user.id, email: 'u1@test.com' });
        r = await client.user.findUnique({
            where: { email: 'u1@test.com' },
        });
        expect(r).toMatchObject({ id: user.id, email: 'u1@test.com' });

        r = await client.user.findUnique({ where: { id: 'none' } });
        expect(r).toBeNull();
        await expect(client.user.findUniqueOrThrow({ where: { id: 'none' } })).toBeRejectedNotFound();
    });

    it('works with non-unique finds', async () => {
        let r = await client.user.findFirst({ where: { name: 'User1' } });
        expect(r).toBeNull();

        const user = await createUser(client);

        r = await client.user.findFirst({ where: { name: 'User1' } });
        expect(r).toMatchObject({ id: user.id, email: 'u1@test.com' });

        r = await client.user.findFirst({ where: { name: 'User2' } });
        expect(r).toBeNull();
        await expect(client.user.findFirstOrThrow({ where: { name: 'User2' } })).toBeRejectedNotFound();
    });

    it('works with boolean composition', async () => {
        const user1 = await createUser(client, 'u1@test.com');
        const user2 = await createUser(client, 'u2@test.com');

        // AND
        await expect(client.user.findMany({ where: { AND: [] } })).resolves.toHaveLength(2);
        await expect(
            client.user.findFirst({
                where: {
                    AND: { id: user1.id },
                },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                where: {
                    AND: [{ id: user1.id }],
                },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                where: {
                    AND: [{ id: user1.id, email: 'u1@test.com' }],
                },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                where: {
                    AND: [{ id: user1.id }, { email: 'u1@test.com' }],
                },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                where: {
                    AND: [{ id: user1.id, email: 'u2@test.com' }],
                },
            }),
        ).toResolveFalsy();

        // OR
        await expect(client.user.findMany({ where: { OR: [] } })).resolves.toHaveLength(0);
        await expect(
            client.user.findFirst({
                where: {
                    OR: [{ id: user1.id }],
                },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                where: {
                    OR: [{ id: user1.id, email: 'u2@test.com' }],
                },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findMany({
                where: {
                    OR: [{ id: user1.id }, { email: 'u2@test.com' }],
                },
            }),
        ).resolves.toHaveLength(2);
        await expect(
            client.user.findFirst({
                where: {
                    OR: [{ id: 'foo', email: 'bar' }],
                },
            }),
        ).toResolveFalsy();

        // NOT
        await expect(client.user.findMany({ where: { NOT: [] } })).resolves.toHaveLength(2);
        await expect(
            client.user.findFirst({
                where: {
                    NOT: { id: user1.id },
                },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: {
                    NOT: [{ id: user1.id }],
                },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: {
                    NOT: [{ id: user1.id, email: 'u1@test.com' }],
                },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: {
                    NOT: [{ id: user1.id }, { email: 'u1@test.com' }],
                },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findMany({
                where: {
                    NOT: [{ id: user1.id }, { email: 'foo' }],
                },
            }),
        ).resolves.toHaveLength(2);

        // unique filter
        await expect(
            client.user.findUnique({
                where: {
                    id: user1.id,
                    AND: [{ email: user1.email }],
                },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findUnique({
                where: {
                    id: user1.id,
                    AND: [{ email: user2.email }],
                },
            }),
        ).toResolveFalsy();

        // nesting
        await expect(
            client.user.findFirst({
                where: {
                    AND: {
                        id: user1.id,
                        OR: [{ email: 'foo' }, { email: 'bar' }],
                    },
                },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: {
                    AND: {
                        id: user1.id,
                        NOT: { OR: [{ email: 'foo' }, { email: 'bar' }] },
                    },
                },
            }),
        ).resolves.toMatchObject(user1);
    });

    it('allows filtering by to-many relations', async () => {
        const user = await createUser(client);
        await createPosts(client, user.id);

        // some
        await expect(
            client.user.findFirst({
                where: { posts: { some: { title: 'Post1' } } },
            }),
        ).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { posts: { some: { title: 'Post3' } } },
            }),
        ).toResolveFalsy();

        // every
        await expect(
            client.user.findFirst({
                where: { posts: { every: { authorId: user.id } } },
            }),
        ).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { posts: { every: { published: true } } },
            }),
        ).toResolveFalsy();

        // none
        await expect(
            client.user.findFirst({
                where: { posts: { none: { title: 'Post1' } } },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { posts: { none: { title: 'Post3' } } },
            }),
        ).toResolveTruthy();
    });

    it('allows filtering by to-one relations', async () => {
        const user1 = await createUser(client, 'u1@test.com');
        await createPosts(client, user1.id);
        const user2 = await createUser(client, 'u2@test.com', {
            profile: null,
        });

        // null check from non-owner side
        await expect(
            client.user.findFirst({
                where: { profile: null },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: { profile: { is: null } },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: { profile: { isNot: null } },
            }),
        ).resolves.toMatchObject(user1);

        // null check from owner side
        await expect(client.profile.findFirst({ where: { user: null } })).toResolveFalsy();
        await expect(client.profile.findFirst({ where: { user: { is: null } } })).toResolveFalsy();
        await expect(client.profile.findFirst({ where: { user: { isNot: null } } })).toResolveTruthy();

        // field checks
        await expect(
            client.user.findFirst({
                where: { profile: { bio: 'My bio' } },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                where: { profile: { bio: 'My other bio' } },
            }),
        ).toResolveFalsy();

        // is/isNot
        await expect(
            client.user.findFirst({
                where: { profile: { is: { bio: 'My bio' } } },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                where: { profile: { isNot: { bio: 'My bio' } } },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findMany({
                where: { profile: { isNot: { bio: 'My other bio' } } },
            }),
        ).resolves.toHaveLength(2);
    });

    it('allows field selection', async () => {
        const user = await createUser(client);
        await createPosts(client, user.id);

        const r = await client.user.findUnique({
            where: { id: user.id },
            select: { id: true, email: true, posts: true },
        });
        expect(r?.id).toBeTruthy();
        expect(r?.email).toBeTruthy();
        expect('name' in r!).toBeFalsy();
        expect(r?.posts).toHaveLength(2);
        expect(r?.posts[0]?.createdAt).toBeInstanceOf(Date);
        expect(r?.posts[0]?.published).toBeTypeOf('boolean');

        await expect(
            client.user.findUnique({
                where: { id: user.id },
                select: {
                    posts: { where: { published: true }, select: { title: true }, orderBy: { createdAt: 'desc' } },
                },
            }),
        ).resolves.toMatchObject({
            posts: [expect.objectContaining({ title: 'Post1' })],
        });
        await expect(
            client.user.findUnique({
                where: { id: user.id },
                include: {
                    posts: { where: { published: true }, select: { title: true }, orderBy: { createdAt: 'desc' } },
                },
            }),
        ).resolves.toMatchObject({
            posts: [expect.objectContaining({ title: 'Post1' })],
        });

        // @ts-ignore
        if (client.$schema.provider.type === 'postgresql') {
            await expect(
                client.user.findUnique({
                    where: { id: user.id },
                    select: {
                        posts: { orderBy: { title: 'asc' }, skip: 1, take: 1, distinct: ['title'] } as any,
                    },
                }),
            ).resolves.toMatchObject({
                posts: [expect.objectContaining({ title: 'Post2' })],
            });
            await expect(
                client.user.findUnique({
                    where: { id: user.id },
                    include: {
                        posts: { orderBy: { title: 'asc' }, skip: 1, take: 1, distinct: ['title'] } as any,
                    },
                }),
            ).resolves.toMatchObject({
                posts: [expect.objectContaining({ title: 'Post2' })],
            });
        }

        await expect(
            client.post.findFirst({
                select: { author: { select: { email: true } } },
            }),
        ).resolves.toMatchObject({
            author: { email: expect.any(String) },
        });
        await expect(
            client.post.findFirst({
                include: { author: { select: { email: true } } },
            }),
        ).resolves.toMatchObject({
            author: { email: expect.any(String) },
        });

        await expect(
            client.user.findUnique({
                where: { id: user.id },
                select: {
                    profile: { where: { bio: 'My bio' } },
                },
            }),
        ).resolves.toMatchObject({ profile: expect.any(Object) });
        await expect(
            client.user.findUnique({
                where: { id: user.id },
                include: {
                    profile: { where: { bio: 'My bio' } },
                },
            }),
        ).resolves.toMatchObject({ profile: expect.any(Object) });

        await expect(
            client.user.findUnique({
                where: { id: user.id },
                select: {
                    profile: { where: { bio: 'Other bio' } },
                },
            }),
        ).resolves.toMatchObject({ profile: null });
        await expect(
            client.user.findUnique({
                where: { id: user.id },
                include: {
                    profile: { where: { bio: 'Other bio' } },
                },
            }),
        ).resolves.toMatchObject({ profile: null });

        await expect(
            client.user.findUnique({
                where: { id: user.id },
                select: { id: true, email: true },
                include: { posts: true },
            } as any),
        ).rejects.toThrow('cannot be used together');

        const r1 = await client.user.findUnique({
            where: { id: user.id },
            include: { posts: { include: { author: true } } },
        });
        expect(r1!.posts[0]!.author).toMatchObject({
            id: user.id,
            email: 'u1@test.com',
            createdAt: expect.any(Date),
        });

        const r2 = await client.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                posts: {
                    select: {
                        id: true,
                        author: {
                            select: { email: true },
                        },
                    },
                },
            },
        });
        expect(r2).toMatchObject({
            id: user.id,
            posts: expect.arrayContaining([
                expect.objectContaining({
                    id: expect.any(String),
                    author: {
                        email: 'u1@test.com',
                    },
                }),
            ]),
        });

        const r3 = await client.user.findUnique({
            where: { id: user.id },
            include: {
                posts: {
                    include: {
                        author: {
                            select: { email: true },
                        },
                    },
                },
            },
        });
        expect(r3).toMatchObject({
            id: user.id,
            posts: expect.arrayContaining([
                expect.objectContaining({
                    id: expect.any(String),
                    author: {
                        email: 'u1@test.com',
                    },
                }),
            ]),
        });
    });

    it('allows field omission', async () => {
        const user = await createUser(client);
        await createPosts(client, user.id);

        const r = await client.user.findFirstOrThrow({
            omit: { name: true },
        });
        expect('name' in r).toBeFalsy();
        expect(r.email).toBeTruthy();

        // @ts-expect-error omit and select cannot be used together
        client.user.findFirstOrThrow({
            omit: { name: true },
            select: { email: true },
        });

        const r1 = await client.user.findFirstOrThrow({
            include: { posts: { omit: { published: true } } },
        });
        expect('published' in r1.posts[0]!).toBeFalsy();
    });

    it('allows including relation', async () => {
        const user = await createUser(client);
        const [post1, post2] = await createPosts(client, user.id);

        let r = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            include: { posts: { where: { title: 'Post1' } } },
        });
        expect(r.posts).toHaveLength(1);
        expect(r.posts[0]?.title).toBe('Post1');

        r = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            include: { posts: { where: { published: true } } },
        });
        expect(r.posts).toHaveLength(1);

        r = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            include: { posts: { where: { title: 'Post3' } } },
        });
        expect(r.posts).toHaveLength(0);

        const r1 = await client.post.findFirstOrThrow({
            include: {
                author: {
                    include: { posts: { where: { title: 'Post1' } } },
                },
            },
        });
        expect(r1.author.posts).toHaveLength(1);

        let r2 = await client.user.findFirstOrThrow({
            include: {
                profile: { where: { bio: 'My bio' } },
            },
        });
        expect(r2.profile).toBeTruthy();
        r2 = await client.user.findFirstOrThrow({
            include: {
                profile: { where: { bio: 'Some bio' } },
            },
        });
        expect(r2.profile).toBeNull();

        await expect(
            client.post.findFirstOrThrow({
                // @ts-expect-error
                include: { author: { where: { email: user.email } } },
            }),
        ).rejects.toThrow(`Invalid findFirst args`);

        // sorting
        let u = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            include: {
                posts: {
                    orderBy: {
                        published: 'asc',
                    },
                },
            },
        });
        expect(u.posts[0]).toMatchObject({
            title: post2.title,
            published: post2.published,
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
        });
        u = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            include: {
                posts: {
                    orderBy: {
                        published: 'desc',
                    },
                },
            },
        });
        expect(u.posts[0]).toMatchObject({
            title: post1.title,
            published: post1.published,
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
        });

        // cursor
        u = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            include: {
                posts: {
                    orderBy: { title: 'asc' },
                    cursor: { id: post2.id },
                },
            },
        });
        expect(u.posts).toHaveLength(1);
        expect(u.posts?.[0]?.id).toBe(post2.id);

        // skip and take
        u = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            include: {
                posts: {
                    take: 1,
                    skip: 1,
                },
            },
        });
        expect(u.posts).toHaveLength(1);
        u = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            include: {
                posts: {
                    skip: 2,
                },
            },
        });
        expect(u.posts).toHaveLength(0);
    });

    it('support counting relations', async () => {
        const user1 = await createUser(client, 'u1@test.com');
        const user2 = await createUser(client, 'u2@test.com');
        await createPosts(client, user1.id);

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: { id: true, _count: true },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 2 },
        });

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: { id: true, _count: { select: { posts: true } } },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 2 },
        });

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: {
                    id: true,
                    posts: {
                        select: { _count: true },
                    },
                },
            }),
        ).resolves.toMatchObject({
            id: user1.id,
            posts: [{ _count: { comments: 0 } }, { _count: { comments: 0 } }],
        });

        client.comment.findFirst({
            // @ts-expect-error Comment has no to-many relations to count
            select: { _count: true },
        });

        client.post.findFirst({
            // @ts-expect-error Comment has no to-many relations to count
            select: { comments: { _count: true } },
        });

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: { id: true, _count: { select: { posts: { where: { published: true } } } } },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 1 },
        });

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: {
                    _count: {
                        select: { posts: { where: { title: 'Post1' } } },
                    },
                },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 1 },
        });

        await expect(
            client.user.findUnique({
                where: { id: user2.id },
                select: { _count: true },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 0 },
        });

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: {
                    _count: {
                        select: {
                            posts: true,
                        },
                    },
                },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 2 },
        });

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: {
                    _count: {
                        select: {
                            posts: { where: { published: true } },
                        },
                    },
                },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 1 },
        });

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: {
                    _count: {
                        select: {
                            posts: {
                                where: { author: { email: user1.email } },
                            },
                        },
                    },
                },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 2 },
        });

        await expect(
            client.user.findUnique({
                where: { id: user1.id },
                select: {
                    _count: {
                        select: {
                            posts: {
                                where: { author: { email: user2.email } },
                            },
                        },
                    },
                },
            }),
        ).resolves.toMatchObject({
            _count: { posts: 0 },
        });

        // typing
        // user select allows _count because it has to-many relations
        client.user.findMany({
            select: { _count: { select: { posts: true } } },
        });
        // nested author select allows _count because it has to-many relations
        client.post.findMany({
            select: {
                author: {
                    select: {
                        _count: { select: { posts: true } },
                    },
                },
            },
        });
        // comment select does not allow _count because it has no to-many relations
        client.comment.findMany({
            // @ts-expect-error
            select: { _count: {} },
        });
    });

    it('supports _count inside include', async () => {
        const user = await createUser(client, 'u1@test.com');
        await createPosts(client, user.id);

        // Test _count with select inside include
        const result = await client.user.findFirst({
            include: {
                posts: { select: { title: true } },
                _count: { select: { posts: true } },
            },
        });

        expect(result).toBeDefined();
        expect(result?.posts).toHaveLength(2);
        expect(result?.posts[0]).toHaveProperty('title');
        // TypeScript should recognize _count property exists
        expect(result?._count).toBeDefined();
        expect(result?._count.posts).toBe(2);

        // Test _count with boolean true inside include
        const result2 = await client.user.findFirst({
            include: {
                posts: true,
                _count: true,
            },
        });

        expect(result2).toBeDefined();
        expect(result2?.posts).toHaveLength(2);
        expect(result2?._count).toBeDefined();
        expect(result2?._count.posts).toBe(2);

        // Test _count with filtered posts inside include
        const result3 = await client.user.findFirst({
            include: {
                posts: { where: { published: true } },
                _count: { select: { posts: { where: { published: true } } } },
            },
        });

        expect(result3).toBeDefined();
        expect(result3?.posts).toHaveLength(1);
        expect(result3?._count).toBeDefined();
        expect(result3?._count.posts).toBe(1);
    });

    it('rejects orderBy array elements with multiple keys', async () => {
        await createUser(client, 'u1@test.com');

        // zero keys is valid
        await expect(client.user.findMany({ orderBy: [{}] })).resolves.toBeDefined();

        // single key is valid
        await expect(client.user.findMany({ orderBy: [{ email: 'asc' }] })).resolves.toBeDefined();

        // multiple keys in one element is rejected
        await expect(
            client.user.findMany({ orderBy: [{ email: 'asc', role: 'desc' }] } as any),
        ).toBeRejectedByValidation();
    });

    it('supports $expr', async () => {
        await createUser(client, 'yiming@gmail.com');
        await createUser(client, 'yiming@zenstack.dev');

        await expect(
            client.user.findMany({
                where: {
                    role: 'ADMIN',
                    $expr: (eb) => eb('email', 'like', '%@zenstack.dev'),
                },
            }),
        ).resolves.toHaveLength(1);

        await expect(
            client.user.findMany({
                where: {
                    role: 'USER',
                    $expr: (eb) => eb('email', 'like', '%@zenstack.dev'),
                },
            }),
        ).resolves.toHaveLength(0);
    });
});
