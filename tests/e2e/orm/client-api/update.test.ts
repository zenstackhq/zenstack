import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/basic';
import { createTestClient } from '@zenstackhq/testtools';
import { createUser } from './utils';

describe('Client update tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    describe('toplevel', () => {
        it('works with toplevel update', async () => {
            const user = await createUser(client, 'u1@test.com');

            expect(user.updatedAt).toBeInstanceOf(Date);

            // not found
            await expect(
                client.user.update({
                    where: { id: 'not-found' },
                    data: { name: 'Foo' },
                }),
            ).toBeRejectedNotFound();

            // empty data
            let updated = await client.user.update({
                where: { id: user.id },
                data: {},
            });
            expect(updated).toMatchObject({
                email: user.email,
                name: user.name,
            });
            // should not update updatedAt
            expect(updated.updatedAt.getTime()).toEqual(user.updatedAt.getTime());

            // id as filter
            updated = await client.user.update({
                where: { id: user.id },
                data: { email: 'u2.test.com', name: 'Foo' },
            });
            expect(updated).toMatchObject({
                email: 'u2.test.com',
                name: 'Foo',
            });
            expect(updated.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());

            // non-id unique as filter
            await expect(
                client.user.update({
                    where: { email: 'u2.test.com' },
                    data: { email: 'u2.test.com', name: 'Bar' },
                }),
            ).resolves.toMatchObject({
                email: 'u2.test.com',
                name: 'Bar',
            });

            // select
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: { email: 'u2.test.com', name: 'Bar1' },
                    select: { email: true, name: true },
                }),
            ).resolves.toEqual({ email: 'u2.test.com', name: 'Bar1' });

            // include
            const r = await client.user.update({
                where: { id: user.id },
                data: { email: 'u2.test.com', name: 'Bar2' },
                include: { profile: true },
            });
            expect(r.profile).toBeTruthy();
            expect(r.email).toBeTruthy();

            // include + select
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: { email: 'u2.test.com', name: 'Bar3' },
                    include: { profile: true },
                    select: { email: true, name: true },
                } as any),
            ).rejects.toThrow('cannot be used together');

            // update with non-unique filter
            await expect(
                client.user.update({
                    // @ts-expect-error
                    where: { name: 'Foo' },
                    data: { name: 'Bar' },
                }),
            ).rejects.toThrow('At least one unique field or field set must be set');
            await expect(
                client.user.update({
                    where: { id: undefined },
                    data: { name: 'Bar' },
                }),
            ).rejects.toThrow('At least one unique field or field set must be set');

            // id update
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: { id: 'user2' },
                }),
            ).resolves.toMatchObject({ id: 'user2' });
        });

        it('works with update with unchanged data or no data', async () => {
            const user = await createUser(client, 'u1@test.com');
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        email: user.email,
                        // force a no-op update
                        updatedAt: user.updatedAt,
                    },
                }),
            ).resolves.toEqual(user);

            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {},
                }),
            ).resolves.toEqual(user);

            const plain = await client.plain.create({ data: { value: 42 } });
            await expect(client.plain.update({ where: { id: plain.id }, data: { value: 42 } })).resolves.toEqual(plain);
        });

        it('does not update updatedAt if no other scalar fields are updated', async () => {
            const user = await createUser(client, 'u1@test.com');
            const originalUpdatedAt = user.updatedAt;

            await client.user.update({
                where: { id: user.id },
                data: {
                    posts: { create: { title: 'Post1' } },
                },
            });

            const updatedUser = await client.user.findUnique({ where: { id: user.id } });
            expect(updatedUser?.updatedAt).toEqual(originalUpdatedAt);
        });

        it('works with numeric incremental update', async () => {
            await createUser(client, 'u1@test.com', {
                profile: { create: { id: '1', bio: 'bio' } },
            });

            await expect(
                client.profile.update({
                    where: { id: '1' },
                    data: { age: { increment: 1 } },
                }),
            ).resolves.toMatchObject({ age: null });

            await expect(
                client.profile.update({
                    where: { id: '1' },
                    data: { age: { set: 1 } },
                }),
            ).resolves.toMatchObject({ age: 1 });

            await expect(
                client.profile.update({
                    where: { id: '1' },
                    data: { age: { increment: 1 } },
                }),
            ).resolves.toMatchObject({ age: 2 });

            await expect(
                client.profile.update({
                    where: { id: '1' },
                    data: { age: { multiply: 2 } },
                }),
            ).resolves.toMatchObject({ age: 4 });

            await expect(
                client.profile.update({
                    where: { id: '1' },
                    data: { age: { divide: 2 } },
                }),
            ).resolves.toMatchObject({ age: 2 });

            await expect(
                client.profile.update({
                    where: { id: '1' },
                    data: { age: { decrement: 1 } },
                }),
            ).resolves.toMatchObject({ age: 1 });

            await expect(
                client.profile.update({
                    where: { id: '1' },
                    data: { age: { set: null } },
                }),
            ).resolves.toMatchObject({ age: null });
        });

        it('compiles with Prisma checked/unchecked typing', async () => {
            const user = await client.user.create({
                data: {
                    email: 'u1@test.com',
                    posts: {
                        create: {
                            id: '1',
                            title: 'title',
                        },
                    },
                },
            });

            // fk and owned-relation are mutually exclusive
            // TODO: @ts-expect-error
            client.post.update({
                where: { id: '1' },
                data: {
                    authorId: user.id,
                    title: 'title',
                    author: { connect: { id: user.id } },
                },
            });

            // fk can work with non-owned relation
            const comment = await client.comment.create({
                data: {
                    content: 'comment',
                },
            });
            await expect(
                client.post.update({
                    where: { id: '1' },
                    data: {
                        authorId: user.id,
                        title: 'title',
                        comments: {
                            connect: { id: comment.id },
                        },
                    },
                }),
            ).toResolveTruthy();
        });
    });

    describe('nested to-many', () => {
        it('works with nested to-many relation simple create', async () => {
            const user = await createUser(client, 'u1@test.com');

            // create
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        posts: { create: { id: '1', title: 'Post1' } },
                    },
                    include: { posts: true },
                }),
            ).resolves.toMatchObject({
                posts: [expect.objectContaining({ id: '1', title: 'Post1' })],
            });

            // create multiple
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        posts: {
                            create: [
                                { id: '2', title: 'Post2' },
                                { id: '3', title: 'Post3' },
                            ],
                        },
                    },
                    include: { posts: true },
                }),
            ).resolves.toSatisfy((r) => r.posts.length === 3);
        });

        it('works with nested to-many relation createMany', async () => {
            const user = await createUser(client, 'u1@test.com');

            // single
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        posts: {
                            createMany: {
                                data: { id: '1', title: 'Post1' },
                            },
                        },
                    },
                    include: { posts: true },
                }),
            ).resolves.toMatchObject({
                posts: [expect.objectContaining({ id: '1', title: 'Post1' })],
            });

            // multiple
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        posts: {
                            createMany: {
                                data: [
                                    { id: '1', title: 'Post1' },
                                    { id: '2', title: 'Post2' },
                                    { id: '3', title: 'Post3' },
                                ],
                                skipDuplicates: true,
                            },
                        },
                    },
                    include: { posts: true },
                }),
            ).resolves.toSatisfy((r) => r.posts.length === 3);

            // duplicate id
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        posts: {
                            createMany: {
                                data: { id: '1', title: 'Post1-1' },
                            },
                        },
                    },
                }),
            ).rejects.toThrow();

            // duplicate id
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        posts: {
                            createMany: {
                                data: [
                                    { id: '4', title: 'Post4' },
                                    { id: '4', title: 'Post4-1' },
                                ],
                            },
                        },
                    },
                }),
            ).rejects.toThrow();
        });

        it('works with nested to-many relation set', async () => {
            const user = await createUser(client, 'u1@test.com');

            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                    comments: {
                        create: [
                            { id: '1', content: 'Comment1' },
                            { id: '2', content: 'Comment2' },
                        ],
                    },
                },
            });

            // set empty
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { set: [] } },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({ comments: [] });

            // set single
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { set: { id: '1' } } },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: '1' })],
            });
            await client.post.update({
                where: { id: post.id },
                data: { comments: { set: [] } },
            });

            // non-existing
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            set: [
                                { id: '1' },
                                { id: '2' },
                                { id: '3' }, // non-existing
                            ],
                        },
                    },
                    include: { comments: true },
                }),
            ).toBeRejectedNotFound();

            // set multiple
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            set: [{ id: '1' }, { id: '2' }],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: '1' }), expect.objectContaining({ id: '2' })],
            });
        });

        it('works with nested to-many relation simple connect', async () => {
            const user = await createUser(client, 'u1@test.com');
            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                },
            });
            const comment1 = await client.comment.create({
                data: { id: '1', content: 'Comment1' },
            });
            const comment2 = await client.comment.create({
                data: { id: '2', content: 'Comment2' },
            });

            // connect single
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { connect: { id: comment1.id } } },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: comment1.id })],
            });

            // already connected
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { connect: { id: comment1.id } } },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: comment1.id })],
            });

            // connect non existing
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            connect: [
                                { id: comment1.id },
                                { id: comment2.id },
                                { id: '3' }, // non-existing
                            ],
                        },
                    },
                    include: { comments: true },
                }),
            ).toBeRejectedNotFound();

            // connect multiple
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            connect: [{ id: comment1.id }, { id: comment2.id }],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: comment1.id }), expect.objectContaining({ id: comment2.id })],
            });
        });

        it('works with nested to-many relation connectOrCreate', async () => {
            const user = await createUser(client, 'u1@test.com');
            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                },
            });
            const comment1 = await client.comment.create({
                data: { id: '1', content: 'Comment1' },
            });
            const comment2 = await client.comment.create({
                data: { id: '2', content: 'Comment2' },
            });

            // single
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            connectOrCreate: {
                                where: {
                                    id: comment1.id,
                                },
                                create: { content: 'Comment1' },
                            },
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: comment1.id })],
            });

            // multiple
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            connectOrCreate: [
                                {
                                    // already connected
                                    where: { id: comment1.id },
                                    create: { content: 'Comment1' },
                                },
                                {
                                    // not connected
                                    where: { id: comment2.id },
                                    create: { content: 'Comment2' },
                                },
                                {
                                    // create
                                    where: { id: '3' },
                                    create: {
                                        id: '3',
                                        content: 'Comment3',
                                    },
                                },
                            ],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [
                    expect.objectContaining({ id: comment1.id }),
                    expect.objectContaining({ id: comment2.id }),
                    expect.objectContaining({ id: '3' }),
                ],
            });
        });

        it('works with nested to-many relation disconnect', async () => {
            const user = await createUser(client, 'u1@test.com');
            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                    comments: {
                        create: [
                            { id: '1', content: 'Comment1' },
                            { id: '2', content: 'Comment2' },
                            { id: '3', content: 'Comment3' },
                        ],
                    },
                },
            });

            // single
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            disconnect: { id: '1', content: 'non found' },
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [
                    expect.objectContaining({ id: '1' }),
                    expect.objectContaining({ id: '2' }),
                    expect.objectContaining({ id: '3' }),
                ],
            });
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { disconnect: { id: '1' } } },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: '2' }), expect.objectContaining({ id: '3' })],
            });

            // not connected
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { disconnect: { id: '1' } } },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: '2' }), expect.objectContaining({ id: '3' })],
            });

            // non-existing
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            disconnect: [
                                { id: '2' },
                                { id: '3' },
                                { id: '4' }, // non-existing
                            ],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [],
            });

            // multiple
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            disconnect: [{ id: '2' }, { id: '3' }],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({ comments: [] });
        });

        it('works with nested to-many relation simple delete', async () => {
            const user = await createUser(client, 'u1@test.com');
            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                    comments: {
                        create: [
                            { id: '1', content: 'Comment1' },
                            { id: '2', content: 'Comment2' },
                            { id: '3', content: 'Comment3' },
                        ],
                    },
                },
            });

            await client.comment.create({
                data: { id: '4', content: 'Comment4' },
            });

            // single
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { delete: { id: '1' } } },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: '2' }), expect.objectContaining({ id: '3' })],
            });
            await expect(client.comment.findMany()).toResolveWithLength(3);

            // not connected
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { delete: { id: '4' } } },
                    include: { comments: true },
                }),
            ).toBeRejectedNotFound();
            await expect(client.comment.findMany()).toResolveWithLength(3);

            // non-existing
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { delete: { id: '5' } } },
                    include: { comments: true },
                }),
            ).toBeRejectedNotFound();
            await expect(client.comment.findMany()).toResolveWithLength(3);

            // multiple
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            delete: [{ id: '2' }, { id: '3' }],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({ comments: [] });
            await expect(client.comment.findMany()).toResolveWithLength(1);
        });

        it('works with nested to-many relation deleteMany', async () => {
            const user = await createUser(client, 'u1@test.com');
            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                    comments: {
                        create: [
                            { id: '1', content: 'Comment1' },
                            { id: '2', content: 'Comment2' },
                            { id: '3', content: 'Comment3' },
                        ],
                    },
                },
            });

            await client.comment.create({
                data: { id: '4', content: 'Comment4' },
            });

            // none
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: { comments: { deleteMany: [] } },
                }),
            ).toResolveTruthy();
            await expect(client.comment.findMany()).toResolveWithLength(4);

            // single
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: { deleteMany: { content: 'Comment1' } },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: '2' }), expect.objectContaining({ id: '3' })],
            });
            await expect(client.comment.findMany()).toResolveWithLength(3);

            // not connected
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: { deleteMany: { content: 'Comment4' } },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: [expect.objectContaining({ id: '2' }), expect.objectContaining({ id: '3' })],
            });
            await expect(client.comment.findMany()).toResolveWithLength(3);

            // multiple
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            deleteMany: [
                                { content: 'Comment2' },
                                { content: 'Comment3' },
                                { content: 'Comment5' }, // non-existing
                            ],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({ comments: [] });
            await expect(client.comment.findMany()).toResolveWithLength(1);

            // all
            const post2 = await client.post.create({
                data: {
                    title: 'Post2',
                    author: { connect: { id: user.id } },
                    comments: {
                        create: [
                            { id: '5', content: 'Comment5' },
                            { id: '6', content: 'Comment6' },
                        ],
                    },
                },
            });
            await expect(
                client.post.update({
                    where: { id: post2.id },
                    data: { comments: { deleteMany: {} } },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({ comments: [] });
            await expect(client.comment.findMany()).resolves.toEqual([
                expect.objectContaining({ content: 'Comment4' }),
            ]);
        });

        it('works with nested to-many relation simple update', async () => {
            const user = await createUser(client, 'u1@test.com');
            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                    comments: {
                        create: [
                            { id: '1', content: 'Comment1' },
                            { id: '2', content: 'Comment2' },
                            { id: '3', content: 'Comment3' },
                        ],
                    },
                },
            });
            await client.comment.create({
                data: { id: '4', content: 'Comment4' },
            });

            // single, toplevel
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            update: {
                                where: { id: '1' },
                                data: { content: 'Comment1-1' },
                            },
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: expect.arrayContaining([
                    expect.objectContaining({ content: 'Comment1-1' }),
                    expect.objectContaining({ content: 'Comment2' }),
                    expect.objectContaining({ content: 'Comment3' }),
                ]),
            });

            // multiple, toplevel
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            update: [
                                {
                                    where: { id: '2' },
                                    data: { content: 'Comment2-1' },
                                },
                                {
                                    where: { id: '3' },
                                    data: { content: 'Comment3-1' },
                                },
                            ],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: expect.arrayContaining([
                    expect.objectContaining({ content: 'Comment1-1' }),
                    expect.objectContaining({ content: 'Comment2-1' }),
                    expect.objectContaining({ content: 'Comment3-1' }),
                ]),
            });

            // not connected
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            update: [
                                {
                                    where: { id: '1' },
                                    data: { content: 'Comment1-2' },
                                },
                                {
                                    where: { id: '4' },
                                    data: { content: 'Comment4-1' },
                                },
                            ],
                        },
                    },
                }),
            ).toBeRejectedNotFound();
            //  transaction fails as a whole
            await expect(client.comment.findUnique({ where: { id: '1' } })).resolves.toMatchObject({
                content: 'Comment1-1',
            });

            // not found
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            update: [
                                {
                                    where: { id: '1' },
                                    data: { content: 'Comment1-2' },
                                },
                                {
                                    where: { id: '5' },
                                    data: { content: 'Comment5-1' },
                                },
                            ],
                        },
                    },
                }),
            ).toBeRejectedNotFound();
            //  transaction fails as a whole
            await expect(client.comment.findUnique({ where: { id: '1' } })).resolves.toMatchObject({
                content: 'Comment1-1',
            });

            // nested
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        posts: {
                            update: [
                                {
                                    where: { id: post.id },
                                    data: {
                                        comments: {
                                            update: {
                                                where: { id: '1' },
                                                data: {
                                                    content: 'Comment1-2',
                                                },
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                }),
            ).toResolveTruthy();
            await expect(client.comment.findUnique({ where: { id: '1' } })).resolves.toMatchObject({
                content: 'Comment1-2',
            });
        });

        it('works with nested to-many relation upsert', async () => {
            const user = await createUser(client, 'u1@test.com');
            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                },
            });
            await client.comment.create({
                data: { id: '3', content: 'Comment3' },
            });

            // create, single
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            upsert: {
                                where: { id: '1' },
                                create: { id: '1', content: 'Comment1' },
                                update: { content: 'Comment1-1' },
                            },
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: expect.arrayContaining([expect.objectContaining({ content: 'Comment1' })]),
            });

            // update, single
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            upsert: {
                                where: { id: '1' },
                                create: { content: 'Comment1' },
                                update: { content: 'Comment1-1' },
                            },
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: expect.arrayContaining([expect.objectContaining({ content: 'Comment1-1' })]),
            });

            // update, multiple
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            upsert: [
                                {
                                    where: { id: '1' },
                                    create: { content: 'Comment1' },
                                    update: { content: 'Comment1-2' },
                                },
                                {
                                    where: { id: '2' },
                                    create: { content: 'Comment2' },
                                    update: { content: 'Comment2-2' },
                                },
                            ],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: expect.arrayContaining([
                    expect.objectContaining({ content: 'Comment1-2' }),
                    expect.objectContaining({ content: 'Comment2' }),
                ]),
            });

            // not connected
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            upsert: {
                                where: { id: '3' },
                                create: { id: '3', content: 'Comment3' },
                                update: { content: 'Comment3-1' },
                            },
                        },
                    },
                }),
            ).rejects.toSatisfy((e) => e.cause.message.toLowerCase().match(/(constraint)|(duplicate)/i));
            //  transaction fails as a whole
            await expect(client.comment.findUnique({ where: { id: '3' } })).resolves.toMatchObject({
                content: 'Comment3',
            });

            // not found
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            upsert: [
                                {
                                    where: { id: '1' },
                                    create: { content: 'Comment1' },
                                    update: { content: 'Comment1-2' },
                                },
                                {
                                    where: { id: '4' },
                                    create: {
                                        id: '4',
                                        content: 'Comment4',
                                    },
                                    update: { content: 'Comment4-1' },
                                },
                            ],
                        },
                    },
                }),
            ).toResolveTruthy();
            await expect(client.comment.findUnique({ where: { id: '1' } })).resolves.toMatchObject({
                content: 'Comment1-2',
            });
            await expect(client.comment.findUnique({ where: { id: '4' } })).resolves.toMatchObject({
                content: 'Comment4',
            });

            // nested
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        posts: {
                            upsert: {
                                where: { id: '2' },
                                create: {
                                    title: 'Post2',
                                    comments: {
                                        create: [
                                            {
                                                id: '5',
                                                content: 'Comment5',
                                            },
                                        ],
                                    },
                                },
                                update: {
                                    title: 'Post2-1',
                                },
                            },
                        },
                    },
                }),
            ).toResolveTruthy();
            await expect(client.comment.findUnique({ where: { id: '5' } })).resolves.toMatchObject({
                content: 'Comment5',
            });
        });

        it('works with nested to-many relation updateMany', async () => {
            const user = await createUser(client, 'u1@test.com');
            const post = await client.post.create({
                data: {
                    title: 'Post1',
                    author: { connect: { id: user.id } },
                    comments: {
                        create: [
                            { id: '1', content: 'Comment1' },
                            { id: '2', content: 'Comment2' },
                            { id: '3', content: 'Comment3' },
                        ],
                    },
                },
            });
            await client.comment.create({
                data: { id: '4', content: 'Comment4' },
            });

            // single, toplevel
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            updateMany: {
                                where: {
                                    OR: [{ content: 'Comment1' }, { id: '2' }],
                                },
                                data: { content: 'Comment-up' },
                            },
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: expect.arrayContaining([
                    expect.objectContaining({
                        id: '1',
                        content: 'Comment-up',
                    }),
                    expect.objectContaining({
                        id: '2',
                        content: 'Comment-up',
                    }),
                    expect.objectContaining({
                        id: '3',
                        content: 'Comment3',
                    }),
                ]),
            });

            // multiple, toplevel
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            updateMany: [
                                {
                                    where: { content: 'Comment-up' },
                                    data: { content: 'Comment-up1' },
                                },
                                {
                                    where: { id: '3' },
                                    data: { content: 'Comment-up2' },
                                },
                            ],
                        },
                    },
                    include: { comments: true },
                }),
            ).resolves.toMatchObject({
                comments: expect.arrayContaining([
                    expect.objectContaining({
                        id: '1',
                        content: 'Comment-up1',
                    }),
                    expect.objectContaining({
                        id: '2',
                        content: 'Comment-up1',
                    }),
                    expect.objectContaining({
                        id: '3',
                        content: 'Comment-up2',
                    }),
                ]),
            });

            // not connected
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            updateMany: {
                                where: { id: '4' },
                                data: { content: 'Comment4-1' },
                            },
                        },
                    },
                }),
            ).toResolveTruthy();
            // not updated
            await expect(client.comment.findUnique({ where: { id: '4' } })).resolves.toMatchObject({
                content: 'Comment4',
            });

            // not found
            await expect(
                client.post.update({
                    where: { id: post.id },
                    data: {
                        comments: {
                            updateMany: {
                                where: { id: '5' },
                                data: { content: 'Comment5-1' },
                            },
                        },
                    },
                }),
            ).toResolveTruthy();
        });
    });

    describe('nested to-one from non-owning side', () => {
        it('works with nested to-one relation simple create', async () => {
            const user = await createUser(client, 'u1@test.com', {});

            // create
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: { profile: { create: { id: '1', bio: 'Bio' } } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ id: '1', bio: 'Bio' }),
            });
        });

        it('works with nested to-one relation simple connect', async () => {
            const user = await createUser(client, 'u1@test.com', {});
            const profile1 = await client.profile.create({
                data: { id: '1', bio: 'Bio' },
            });

            // connect without a current connection
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            connect: { id: profile1.id },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ id: '1', bio: 'Bio' }),
            });

            // connect with a current connection
            const profile2 = await client.profile.create({
                data: { id: '2', bio: 'Bio2' },
            });
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            connect: { id: profile2.id },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ id: '2', bio: 'Bio2' }),
            });
            // old profile is disconnected
            await expect(client.profile.findUnique({ where: { id: '1' } })).resolves.toMatchObject({ userId: null });
            // new profile is connected
            await expect(client.profile.findUnique({ where: { id: '2' } })).resolves.toMatchObject({ userId: user.id });

            // connect to a non-existing entity
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            connect: { id: '3' },
                        },
                    },
                    include: { profile: true },
                }),
            ).toBeRejectedNotFound();
        });

        it('works with nested to-one relation connectOrCreate', async () => {
            const user = await createUser(client, 'u1@test.com', {});

            // create
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            connectOrCreate: {
                                where: { id: '1' },
                                create: { id: '1', bio: 'Bio' },
                            },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ id: '1', bio: 'Bio' }),
            });

            // connect
            const profile2 = await client.profile.create({
                data: { id: '2', bio: 'Bio2' },
            });
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            connectOrCreate: {
                                where: { id: profile2.id },
                                create: { id: '3', bio: 'Bio3' },
                            },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ id: '2', bio: 'Bio2' }),
            });
            // old profile is disconnected
            await expect(client.profile.findUnique({ where: { id: '1' } })).resolves.toMatchObject({ userId: null });
            // new profile is connected
            await expect(client.profile.findUnique({ where: { id: '2' } })).resolves.toMatchObject({ userId: user.id });
        });

        it('works with nested to-one relation disconnect', async () => {
            const user = await createUser(client, 'u1@test.com', {
                profile: { create: { id: '1', bio: 'Bio' } },
            });

            // disconnect false
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            disconnect: false,
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ id: '1' }),
            });

            // disconnect true
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            disconnect: true,
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: null,
            });

            // disconnect with filter
            await client.user.update({
                where: { id: user.id },
                data: {
                    profile: { connect: { id: '1' } },
                },
            });
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            disconnect: { id: '1' },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: null,
            });

            await expect(client.profile.findUnique({ where: { id: '1' } })).resolves.toMatchObject({
                userId: null,
            });

            // disconnect non-existing
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            disconnect: { id: '2' },
                        },
                    },
                    include: { profile: true },
                }),
            ).toResolveTruthy();
        });

        it('works with nested to-one relation update', async () => {
            const user = await createUser(client, 'u1@test.com', {
                profile: { create: { id: '1', bio: 'Bio' } },
            });

            // without where
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            update: {
                                bio: 'Bio1',
                            },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ bio: 'Bio1' }),
            });

            // with where
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            update: {
                                where: { id: '1' },
                                data: { bio: 'Bio2' },
                            },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ bio: 'Bio2' }),
            });

            // non-existing
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            update: {
                                where: { id: '2' },
                                data: { bio: 'Bio3' },
                            },
                        },
                    },
                }),
            ).toBeRejectedNotFound();

            // not connected
            const user2 = await createUser(client, 'u2@example.com', {});
            await expect(
                client.user.update({
                    where: { id: user2.id },
                    data: {
                        profile: {
                            update: { bio: 'Bio4' },
                        },
                    },
                }),
            ).toBeRejectedNotFound();
        });

        it('works with nested to-one relation upsert', async () => {
            const user = await createUser(client, 'u1@test.com', {});

            // create
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            upsert: {
                                where: { id: '1' },
                                create: { id: '1', bio: 'Bio' },
                                update: { bio: 'Bio1' },
                            },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ bio: 'Bio' }),
            });

            // update
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            upsert: {
                                where: { id: '1' },
                                create: { id: '1', bio: 'Bio' },
                                update: { bio: 'Bio1' },
                            },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ bio: 'Bio1' }),
            });
        });

        it('works with nested to-one relation delete', async () => {
            const user = await createUser(client, 'u1@test.com', {
                profile: { create: { id: '1', bio: 'Bio' } },
            });

            // false
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            delete: false,
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: expect.objectContaining({ id: '1' }),
            });
            await expect(client.profile.findUnique({ where: { id: '1' } })).toResolveTruthy();

            // true
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            delete: true,
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: null,
            });
            await expect(client.profile.findUnique({ where: { id: '1' } })).toResolveNull();

            // with filter
            await client.user.update({
                where: { id: user.id },
                data: {
                    profile: {
                        create: { id: '1', bio: 'Bio' },
                    },
                },
            });
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            delete: { id: '1' },
                        },
                    },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: null,
            });
            await expect(client.profile.findUnique({ where: { id: '1' } })).toResolveNull();

            // null relation
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            delete: true,
                        },
                    },
                }),
            ).toBeRejectedNotFound();

            // not connected
            await client.profile.create({
                data: { id: '2', bio: 'Bio2' },
            });
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            delete: { id: '2' },
                        },
                    },
                }),
            ).toBeRejectedNotFound();

            // non-existing
            await client.user.update({
                where: { id: user.id },
                data: {
                    profile: {
                        create: { id: '1', bio: 'Bio' },
                    },
                },
            });
            await expect(
                client.user.update({
                    where: { id: user.id },
                    data: {
                        profile: {
                            delete: { id: '3' },
                        },
                    },
                }),
            ).toBeRejectedNotFound();
        });
    });

    describe('nested to-one from owning side', () => {
        it('works with nested to-one owning relation simple create', async () => {
            // const user = await createUser(client, 'u1@test.com', {});
            const profile = await client.profile.create({
                data: { id: '1', bio: 'Bio' },
            });

            // create
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            create: {
                                id: '1',
                                email: 'u1@test.com',
                            },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({
                    id: '1',
                    email: 'u1@test.com',
                }),
            });
        });

        it('works with nested to-one owning relation simple connect', async () => {
            const user = await createUser(client, 'u1@test.com', {});
            const profile = await client.profile.create({
                data: { id: '1', bio: 'Bio' },
            });

            // connect without a current connection
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            connect: { id: user.id },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ id: user.id }),
            });

            // connect with a current connection
            const user2 = await createUser(client, 'u2@test.com', {});
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            connect: { id: user2.id },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ id: user2.id }),
            });

            // connect to a non-existing entity
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            connect: { id: '3' },
                        },
                    },
                    include: { user: true },
                }),
            ).toBeRejectedNotFound();
        });

        it('works with nested to-one owning relation connectOrCreate', async () => {
            const profile = await client.profile.create({
                data: { id: '1', bio: 'Bio' },
            });

            // create
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            connectOrCreate: {
                                where: { id: '1' },
                                create: { id: '1', email: 'u1@test.com' },
                            },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ id: '1' }),
            });

            // connect
            const user2 = await createUser(client, 'u2@test.com', {});
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            connectOrCreate: {
                                where: { id: user2.id },
                                create: { id: '3', email: 'u3@test.com' },
                            },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ id: user2.id }),
            });
        });

        it('works with nested to-one owning relation disconnect', async () => {
            const profile = await client.profile.create({
                data: {
                    id: '1',
                    bio: 'Bio',
                    user: { create: { id: '1', email: 'u1@test.com' } },
                },
            });

            // false
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            disconnect: false,
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ id: '1' }),
            });

            // true
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            disconnect: true,
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: null,
            });

            // filter
            await client.profile.update({
                where: { id: profile.id },
                data: {
                    user: { connect: { id: '1' } },
                },
            });
            // not matching filter, no-op
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            disconnect: { id: '2' },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: { id: '1' },
            });
            // connected, disconnect
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            disconnect: { id: '1' },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: null,
            });
            // not connected, no-op
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            disconnect: { id: '2' },
                        },
                    },
                }),
            ).toResolveTruthy();

            // null relation
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            disconnect: true,
                        },
                    },
                }),
            ).toResolveTruthy();

            // null relation
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            disconnect: { id: '1' },
                        },
                    },
                }),
            ).toResolveTruthy();
        });

        it('works with nested to-one owning relation update', async () => {
            const profile = await client.profile.create({
                data: {
                    id: '1',
                    bio: 'Bio',
                    user: { create: { id: '1', email: 'u1@test.com' } },
                },
            });

            // without where
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            update: {
                                role: 'ADMIN',
                            },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ role: 'ADMIN' }),
            });

            // with where
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            update: {
                                where: { id: '1' },
                                data: { role: 'USER' },
                            },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ role: 'USER' }),
            });

            // non-existing
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            update: {
                                where: { id: '2' },
                                data: { role: 'ADMIN' },
                            },
                        },
                    },
                }),
            ).toBeRejectedNotFound();

            // not connected
            const profile2 = await client.profile.create({
                data: { id: '2', bio: 'Bio2' },
            });
            await expect(
                client.profile.update({
                    where: { id: profile2.id },
                    data: {
                        user: {
                            update: { role: 'ADMIN' },
                        },
                    },
                }),
            ).toBeRejectedNotFound();
        });

        it('works with nested to-one owning relation upsert', async () => {
            const profile = await client.profile.create({
                data: { id: '1', bio: 'Bio' },
            });

            // create
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            upsert: {
                                where: { id: '1' },
                                create: { id: '1', email: 'u1@test.com' },
                                update: { email: 'u2@test.com' },
                            },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ email: 'u1@test.com' }),
            });

            // update
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            upsert: {
                                where: { id: '1' },
                                create: { id: '1', email: 'u1@test.com' },
                                update: { email: 'u2@test.com' },
                            },
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ email: 'u2@test.com' }),
            });
        });

        it('works with nested to-one owning relation delete', async () => {
            let profile = await client.profile.create({
                data: {
                    bio: 'Bio',
                    user: { create: { id: '1', email: 'u1@test.com' } },
                },
            });

            // false
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            delete: false,
                        },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                user: expect.objectContaining({ id: '1' }),
            });
            await expect(client.user.findUnique({ where: { id: '1' } })).toResolveTruthy();

            // TODO: how to return for cascade delete?
            // await expect(
            //     client.profile.update({
            //         where: { id: profile.id },
            //         data: {
            //             user: {
            //                 delete: true,
            //             },
            //         },
            //         include: { user: true },
            //     })
            // ).toResolveNull(); // cascade delete
            // await expect(
            //     client.user.findUnique({ where: { id: '1' } })
            // ).toResolveNull();
            await client.user.delete({ where: { id: '1' } });

            // with filter
            // profile = await client.profile.create({
            //     data: {
            //         bio: 'Bio',
            //         user: { create: { id: '1', email: 'u1@test.com' } },
            //     },
            // });
            // await expect(
            //     client.profile.update({
            //         where: { id: profile.id },
            //         data: {
            //             user: {
            //                 delete: { id: '1' },
            //             },
            //         },
            //         include: { user: true },
            //     })
            // ).toResolveNull();
            // await expect(
            //     client.user.findUnique({ where: { id: '1' } })
            // ).toResolveNull();

            // null relation
            profile = await client.profile.create({
                data: {
                    bio: 'Bio',
                },
            });
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            delete: true,
                        },
                    },
                }),
            ).toBeRejectedNotFound();

            // not connected
            await client.user.create({
                data: { id: '2', email: 'u2@test.com' },
            });
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            delete: { id: '2' },
                        },
                    },
                }),
            ).toBeRejectedNotFound();

            // non-existing
            await client.profile.update({
                where: { id: profile.id },
                data: {
                    user: {
                        create: { id: '1', email: 'u1@test.com' },
                    },
                },
            });
            await expect(
                client.profile.update({
                    where: { id: profile.id },
                    data: {
                        user: {
                            delete: { id: '3' },
                        },
                    },
                }),
            ).toBeRejectedNotFound();
        });
    });
});
