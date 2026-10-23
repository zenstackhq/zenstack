import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { Age, Email, Post, PostId, User, UserId } from '../schemas/branded-primitive/models';
import { schema } from '../schemas/branded-primitive/schema';

const userId = (id: string) => id as UserId;
const postId = (id: string) => id as PostId;
const email = (value: string) => value as Email;
const age = (value: number) => value as Age;

describe('Branded primitive type tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('brands the generated type def types', () => {
        expectTypeOf<UserId>().toEqualTypeOf<string & { __brand: 'UserId' }>();
        expectTypeOf<PostId>().toEqualTypeOf<string & { __brand: 'PostId' }>();
        expectTypeOf<Email>().toEqualTypeOf<string & { __brand: 'Email' }>();
        expectTypeOf<Age>().toEqualTypeOf<number & { __brand: 'Age' }>();

        // brands with the same base type are not interchangeable
        expectTypeOf<UserId>().not.toEqualTypeOf<PostId>();
        expectTypeOf<string>().not.toExtend<UserId>();
        expectTypeOf<UserId>().toExtend<string>();
    });

    it('brands model fields in results', async () => {
        expectTypeOf<User['id']>().toEqualTypeOf<UserId>();
        expectTypeOf<User['email']>().toEqualTypeOf<Email>();
        expectTypeOf<User['age']>().toEqualTypeOf<Age | null>();
        expectTypeOf<Post['authorId']>().toEqualTypeOf<UserId>();

        const user = await client.user.create({
            data: { id: userId('user_1'), email: email('u1@test.com'), age: age(20) },
        });
        expectTypeOf(user.id).toEqualTypeOf<UserId>();
        expectTypeOf(user.email).toEqualTypeOf<Email>();
        expectTypeOf(user.age).toEqualTypeOf<Age | null>();

        // branding is type-only, runtime values are plain primitives
        expect(user).toMatchObject({ id: 'user_1', email: 'u1@test.com', age: 20 });
        expect(typeof user.id).toBe('string');
        expect(typeof user.age).toBe('number');

        const found = await client.user.findUniqueOrThrow({
            where: { id: user.id },
            select: { id: true, posts: true },
        });
        expectTypeOf(found.id).toEqualTypeOf<UserId>();
        expectTypeOf<(typeof found.posts)[number]['id']>().toEqualTypeOf<PostId>();
        expectTypeOf<(typeof found.posts)[number]['authorId']>().toEqualTypeOf<UserId>();
    });

    it('requires branded values for writes and unique lookups', async () => {
        // type-level checks only, never invoked
        const _typeChecks = () => {
            client.user.create({
                // @ts-expect-error plain strings are not branded
                data: { id: 'user_1', email: 'u1@test.com' },
            });

            client.user.create({
                // @ts-expect-error a PostId is not a UserId
                data: { id: postId('user_1'), email: email('u1@test.com') },
            });

            client.user.update({
                where: { id: userId('user_1') },
                // @ts-expect-error plain numbers are not branded
                data: { age: 30 },
            });

            // @ts-expect-error plain strings are not branded
            client.user.findUnique({ where: { id: 'user_1' } });
        };
        void _typeChecks;

        await client.user.create({ data: { id: userId('user_1'), email: email('u1@test.com') } });

        await expect(client.user.findUnique({ where: { id: userId('user_1') } })).resolves.toMatchObject({
            id: 'user_1',
        });
        await expect(client.user.findUnique({ where: { email: email('u1@test.com') } })).resolves.toMatchObject({
            id: 'user_1',
        });
    });

    it('requires branded values in value filters', async () => {
        await client.user.create({ data: { id: userId('user_1'), email: email('u1@test.com'), age: age(20) } });
        await client.user.create({ data: { id: userId('user_2'), email: email('u2@test.com'), age: age(40) } });

        await expect(client.user.findMany({ where: { id: userId('user_1') } })).resolves.toHaveLength(1);
        await expect(client.user.findMany({ where: { id: { equals: userId('user_1') } } })).resolves.toHaveLength(1);
        await expect(
            client.user.findMany({ where: { id: { in: [userId('user_1'), userId('user_2')] } } }),
        ).resolves.toHaveLength(2);
        await expect(client.user.findMany({ where: { id: { not: userId('user_1') } } })).resolves.toHaveLength(1);
        await expect(client.user.findMany({ where: { age: { gte: age(30) } } })).resolves.toHaveLength(1);
        await expect(client.user.findMany({ where: { age: { between: [age(10), age(30)] } } })).resolves.toHaveLength(
            1,
        );
        await expect(client.post.findMany({ where: { author: { id: userId('user_1') } } })).resolves.toHaveLength(0);

        // type-level checks only, never invoked
        const _typeChecks = () => {
            // @ts-expect-error plain strings are not branded
            client.user.findMany({ where: { id: 'user_1' } });

            // @ts-expect-error plain strings are not branded
            client.user.findMany({ where: { id: { equals: 'user_1' } } });

            // @ts-expect-error plain strings are not branded
            client.user.findMany({ where: { id: { in: ['user_1'] } } });

            // @ts-expect-error plain strings are not branded
            client.user.findMany({ where: { id: { not: 'user_1' } } });

            // @ts-expect-error a PostId is not a UserId
            client.post.findMany({ where: { authorId: postId('post_1') } });

            // @ts-expect-error plain numbers are not branded
            client.user.findMany({ where: { age: { gte: 30 } } });

            // @ts-expect-error plain numbers are not branded
            client.user.groupBy({ by: ['email'], having: { age: { _max: { gt: 30 } } } });
        };
        void _typeChecks;
    });

    it('accepts plain values in substring filters and non-value aggregations', async () => {
        await client.user.create({ data: { id: userId('user_1'), email: email('u1@test.com'), age: age(20) } });
        await client.user.create({ data: { id: userId('user_2'), email: email('u2@test.com'), age: age(40) } });

        // substrings of a branded value are not values of the branded type
        await expect(client.user.findMany({ where: { id: { startsWith: 'user_' } } })).resolves.toHaveLength(2);
        await expect(client.user.findMany({ where: { email: { endsWith: '@test.com' } } })).resolves.toHaveLength(2);

        // counts, sums and averages are not values of the branded type, min/max are
        await expect(
            client.user.groupBy({
                by: ['email'],
                having: { age: { _count: { gte: 1 }, _avg: { gt: 30 }, _max: { gt: age(30) } } },
            }),
        ).resolves.toEqual([{ email: 'u2@test.com' }]);
    });

    it('works with relations', async () => {
        const user = await client.user.create({
            data: {
                id: userId('user_1'),
                email: email('u1@test.com'),
                posts: { create: { id: postId('post_1'), title: 'Post 1' } },
            },
            include: { posts: true },
        });
        expect(user.posts).toEqual([{ id: 'post_1', title: 'Post 1', authorId: 'user_1' }]);

        // branded values read from results can be passed back into queries as-is
        const post = await client.post.create({
            data: { id: postId('post_2'), title: 'Post 2', author: { connect: { id: user.id } } },
        });
        expectTypeOf(post.authorId).toEqualTypeOf<UserId>();
        expect(post.authorId).toBe(user.id);

        await expect(
            client.post.findMany({ where: { authorId: post.authorId }, orderBy: { id: 'asc' } }),
        ).resolves.toMatchObject([{ id: 'post_1' }, { id: 'post_2' }]);
    });

    it('retains the validation rules of the primitive', async () => {
        await expect(
            client.user.create({ data: { id: userId('bad_1'), email: email('u1@test.com') } }),
        ).rejects.toThrow();

        await expect(
            client.user.create({ data: { id: userId('user_1'), email: email('not-an-email') } }),
        ).rejects.toThrow(/email/i);

        await expect(
            client.user.create({ data: { id: userId('user_1'), email: email('u1@test.com'), age: age(-1) } }),
        ).rejects.toThrow(/Too small/);

        await expect(
            client.user.create({
                data: {
                    id: userId('user_1'),
                    email: email('u1@test.com'),
                    posts: { create: { id: postId('bad_1'), title: 'Post 1' } },
                },
            }),
        ).rejects.toThrow();

        await expect(client.user.count()).resolves.toBe(0);
    });
});
