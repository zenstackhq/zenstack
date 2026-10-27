import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/basic';

describe('Client updateMany tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('works with toplevel updateMany', async () => {
        // nothing to update
        await expect(client.user.updateMany({ data: {} })).resolves.toMatchObject({
            count: 0,
        });

        // nothing to update
        await expect(client.user.updateMany({ data: { name: 'Foo' } })).resolves.toMatchObject({
            count: 0,
        });

        await client.user.create({
            data: { id: '1', email: 'u1@test.com', name: 'User1' },
        });
        await client.user.create({
            data: { id: '2', email: 'u2@test.com', name: 'User2' },
        });

        // no matching
        await expect(
            client.user.updateMany({
                where: { email: 'foo' },
                data: { name: 'Foo' },
            }),
        ).resolves.toMatchObject({ count: 0 });
        await expect(client.user.findUnique({ where: { id: '1' } })).resolves.toMatchObject({ name: 'User1' });

        // match all
        await expect(
            client.user.updateMany({
                data: { name: 'Foo' },
            }),
        ).resolves.toMatchObject({ count: 2 });
        await expect(client.user.findUnique({ where: { id: '1' } })).resolves.toMatchObject({ name: 'Foo' });
        await expect(client.user.findUnique({ where: { id: '2' } })).resolves.toMatchObject({ name: 'Foo' });

        // match one
        await expect(
            client.user.updateMany({
                where: { id: '1' },
                data: { name: 'Bar' },
            }),
        ).resolves.toMatchObject({ count: 1 });
        await expect(client.user.findUnique({ where: { id: '1' } })).resolves.toMatchObject({ name: 'Bar' });
        await expect(client.user.findUnique({ where: { id: '2' } })).resolves.toMatchObject({ name: 'Foo' });

        // limit
        await expect(
            client.user.updateMany({
                data: { name: 'Baz' },
                limit: 1,
            }),
        ).resolves.toMatchObject({ count: 1 });
        await expect(client.user.findMany({ where: { name: 'Baz' } })).toResolveWithLength(1);

        // limit with where
        await expect(
            client.user.updateMany({
                where: { name: 'Zee' },
                data: { name: 'Baz' },
                limit: 1,
            }),
        ).resolves.toMatchObject({ count: 0 });
    });

    it('accepts FK fields in updateMany data', async () => {
        const user1 = await client.user.create({ data: { email: 'u1@test.com' } });
        const user2 = await client.user.create({ data: { email: 'u2@test.com' } });

        await client.post.create({ data: { title: 'Post1', authorId: user1.id } });
        await client.post.create({ data: { title: 'Post2', authorId: user1.id } });

        // reassign all of user1's posts to user2 via FK field
        await expect(
            client.post.updateMany({
                where: { authorId: user1.id },
                data: { authorId: user2.id },
            }),
        ).resolves.toMatchObject({ count: 2 });

        await expect(client.post.findMany({ where: { authorId: user2.id } })).toResolveWithLength(2);
        await expect(client.post.findMany({ where: { authorId: user1.id } })).toResolveWithLength(0);
    });

    it('works with updateManyAndReturn', async () => {
        if (client.$schema.provider.type === ('mysql' as any)) {
            // skip for mysql as it does not support returning
            return;
        }

        await client.user.create({
            data: { id: '1', email: 'u1@test.com', name: 'User1' },
        });
        await client.user.create({
            data: { id: '2', email: 'u2@test.com', name: 'User2' },
        });

        await expect(
            client.user.updateManyAndReturn({
                where: { email: 'u1@test.com' },
                data: { name: 'User1-new' },
            }),
        ).resolves.toMatchObject([{ id: '1', name: 'User1-new', email: 'u1@test.com' }]);

        const r1 = await client.user.updateManyAndReturn({
            where: { email: 'u1@test.com' },
            data: { name: 'User1-new1' },
            select: { id: true, name: true },
        });
        expect(r1).toMatchObject([{ id: '1', name: 'User1-new1' }]);
        // @ts-expect-error
        expect(r1[0]!.email).toBeUndefined();
    });

    describe('@updatedAt', () => {
        const OLD = new Date('2020-01-01T00:00:00.000Z');

        async function createUserWithOldUpdatedAt(id: string) {
            await client.user.create({ data: { id, email: `${id}@test.com`, name: id } });
            // an explicit value is kept by `update`
            await client.user.update({ where: { id }, data: { updatedAt: OLD } });
        }

        async function updatedAtOf(id: string) {
            const user = await client.user.findUniqueOrThrow({ where: { id } });
            return user.updatedAt.getTime();
        }

        it('sets updatedAt on the matched rows only', async () => {
            await createUserWithOldUpdatedAt('1');
            await createUserWithOldUpdatedAt('2');

            await expect(client.user.updateMany({ where: { id: '1' }, data: { name: 'Foo' } })).resolves.toMatchObject({
                count: 1,
            });

            expect(await updatedAtOf('1')).toBeGreaterThan(OLD.getTime());
            expect(await updatedAtOf('2')).toEqual(OLD.getTime());
        });

        it('keeps an explicit updatedAt', async () => {
            await createUserWithOldUpdatedAt('1');
            const explicit = new Date('2021-06-01T00:00:00.000Z');

            await client.user.updateMany({ data: { name: 'Foo', updatedAt: explicit } });

            expect(await updatedAtOf('1')).toEqual(explicit.getTime());
        });

        it('does not set updatedAt if only ignored fields are present', async () => {
            await createUserWithOldUpdatedAt('1');

            await client.user.updateMany({ data: { createdAt: new Date() } });

            expect(await updatedAtOf('1')).toEqual(OLD.getTime());
        });

        it('sets updatedAt with updateManyAndReturn', async () => {
            if (client.$schema.provider.type === ('mysql' as any)) {
                // skip for mysql as it does not support returning
                return;
            }
            await createUserWithOldUpdatedAt('1');

            const [user] = await client.user.updateManyAndReturn({ data: { name: 'Foo' } });

            expect(user!.updatedAt.getTime()).toBeGreaterThan(OLD.getTime());
            expect(await updatedAtOf('1')).toEqual(user!.updatedAt.getTime());
        });

        it('sets updatedAt with nested updateMany', async () => {
            await createUserWithOldUpdatedAt('1');
            const post = await client.post.create({ data: { title: 'Post1', authorId: '1' } });
            await client.post.update({ where: { id: post.id }, data: { updatedAt: OLD } });

            await client.user.update({
                where: { id: '1' },
                data: { posts: { updateMany: { where: {}, data: { title: 'Post2' } } } },
            });

            const updatedPost = await client.post.findUniqueOrThrow({ where: { id: post.id } });
            expect(updatedPost.title).toBe('Post2');
            expect(updatedPost.updatedAt.getTime()).toBeGreaterThan(OLD.getTime());
        });
    });
});
