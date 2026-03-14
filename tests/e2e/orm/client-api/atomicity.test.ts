import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/basic';
import { schema as delegateSchema, type SchemaType as DelegateSchemaType } from '../schemas/delegate/schema';

describe('Atomicity tests', () => {
    describe('basic schema', () => {
        let client: ClientContract<typeof schema>;

        beforeEach(async () => {
            client = await createTestClient(schema);
        });

        afterEach(async () => {
            await client?.$disconnect();
        });

        describe('nested create atomicity', () => {
            it('rolls back nested to-one create on failure', async () => {
                // Create a user first
                await client.user.create({
                    data: { email: 'u1@test.com' },
                });

                // Attempt to create a post with a nested user create that violates unique constraint
                await expect(
                    client.post.create({
                        data: {
                            title: 'Post1',
                            author: {
                                create: { email: 'u1@test.com' }, // duplicate email
                            },
                        },
                    }),
                ).rejects.toThrow();

                // The post should not have been created either
                await expect(client.post.findMany()).toResolveWithLength(0);
                // Only the original user should exist
                await expect(client.user.findMany()).toResolveWithLength(1);
            });

            it('rolls back nested to-many create on failure', async () => {
                const user = await client.user.create({
                    data: { email: 'u1@test.com' },
                });

                // Create a post with a valid comment
                const post = await client.post.create({
                    data: {
                        title: 'Post1',
                        authorId: user.id,
                        comments: {
                            create: { content: 'comment1' },
                        },
                    },
                    include: { comments: true },
                });
                expect(post.comments).toHaveLength(1);

                // Attempt to create a user with duplicate email and nested posts
                await expect(
                    client.user.create({
                        data: {
                            email: 'u1@test.com', // duplicate email — will fail
                            posts: {
                                create: [
                                    { title: 'Post2' },
                                    { title: 'Post3' },
                                ],
                            },
                            profile: {
                                create: { bio: 'bio' },
                            },
                        },
                    }),
                ).rejects.toThrow();

                // Neither the new user, posts, nor profile should exist
                await expect(client.user.findMany()).toResolveWithLength(1);
                await expect(client.post.findMany()).toResolveWithLength(1);
                await expect(client.profile.findMany()).toResolveWithLength(0);
            });

            it('rolls back deeply nested create on failure', async () => {
                // Attempt to create a user with nested post and nested comment,
                // where the user email is duplicated
                await client.user.create({
                    data: { email: 'u1@test.com' },
                });

                await expect(
                    client.post.create({
                        data: {
                            title: 'Post1',
                            author: {
                                create: { email: 'u1@test.com' }, // duplicate
                            },
                            comments: {
                                create: [{ content: 'c1' }, { content: 'c2' }],
                            },
                        },
                    }),
                ).rejects.toThrow();

                // Nothing should have been created
                await expect(client.post.findMany()).toResolveWithLength(0);
                await expect(client.comment.findMany()).toResolveWithLength(0);
                await expect(client.user.findMany()).toResolveWithLength(1);
            });
        });

        describe('nested update atomicity', () => {
            it('rolls back nested update with nested create on unique violation', async () => {
                // Create two users, one with a post
                const user1 = await client.user.create({
                    data: {
                        email: 'u1@test.com',
                        posts: {
                            create: { title: 'Post1' },
                        },
                    },
                    include: { posts: true },
                });
                await client.user.create({
                    data: { email: 'u2@test.com' },
                });

                // Attempt to update user1: change name AND create a nested post
                // whose author is a new user with a duplicate email
                await expect(
                    client.user.update({
                        where: { id: user1.id },
                        data: {
                            name: 'should not persist',
                            posts: {
                                create: {
                                    title: 'Post2',
                                    comments: {
                                        create: { content: 'c1' },
                                    },
                                },
                            },
                            // This will fail: duplicate unique email
                            email: 'u2@test.com',
                        },
                    }),
                ).rejects.toThrow();

                // The user's name should not have been updated
                const user1After = await client.user.findFirst({ where: { id: user1.id } });
                expect(user1After!.name).toBeNull();
                expect(user1After!.email).toBe('u1@test.com');

                // Post2 and its comment should not exist
                await expect(client.post.findMany()).toResolveWithLength(1);
                await expect(client.comment.findMany()).toResolveWithLength(0);
            });

            it('rolls back nested update with delete on unique violation', async () => {
                const user1 = await client.user.create({
                    data: {
                        email: 'u1@test.com',
                        posts: {
                            create: [{ title: 'Post1' }, { title: 'Post2' }],
                        },
                    },
                    include: { posts: true },
                });
                await client.user.create({
                    data: { email: 'u2@test.com' },
                });

                // Attempt to update user1: delete a post AND change email to duplicate
                await expect(
                    client.user.update({
                        where: { id: user1.id },
                        data: {
                            email: 'u2@test.com', // duplicate — will fail
                            posts: {
                                delete: { id: user1.posts[0]!.id },
                            },
                        },
                    }),
                ).rejects.toThrow();

                // The post should NOT have been deleted (rolled back)
                await expect(client.post.findMany()).toResolveWithLength(2);

                // User email should remain unchanged
                const user1After = await client.user.findFirst({ where: { id: user1.id } });
                expect(user1After!.email).toBe('u1@test.com');
            });
        });
    });

    describe('delegate models', () => {
        let client: ClientContract<DelegateSchemaType>;

        beforeEach(async () => {
            client = await createTestClient(delegateSchema, {
                usePrismaPush: true,
                schemaFile: path.join(__dirname, '../schemas/delegate/schema.zmodel'),
            });
        });

        afterEach(async () => {
            await client?.$disconnect();
        });

        describe('cascaded create atomicity', () => {
            it('rolls back all delegate levels on unique violation', async () => {
                // Create a rated video (creates records in Asset, Video, RatedVideo tables)
                await client.ratedVideo.create({
                    data: {
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                    },
                });

                // Attempt to create another rated video with duplicate url
                await expect(
                    client.ratedVideo.create({
                        data: {
                            duration: 200,
                            url: 'abc', // duplicate unique constraint
                            rating: 3,
                        },
                    }),
                ).rejects.toSatisfy((e: any) =>
                    e.cause.message.toLowerCase().match(/(constraint)|(duplicate)/i),
                );

                // All levels should have exactly 1 record (the first one)
                await expect(client.ratedVideo.findMany()).toResolveWithLength(1);
                await expect(client.video.findMany()).toResolveWithLength(1);
                await expect(client.asset.findMany()).toResolveWithLength(1);
            });

            it('rolls back nested relation create with delegate model on failure', async () => {
                // Create a user
                await client.user.create({
                    data: { id: 1, email: 'u1@example.com' },
                });

                // Create a rated video owned by the user
                await client.ratedVideo.create({
                    data: {
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                        owner: { connect: { id: 1 } },
                    },
                });

                // Attempt to create another rated video with a nested owner create
                // that violates unique email constraint
                await expect(
                    client.ratedVideo.create({
                        data: {
                            duration: 200,
                            url: 'def',
                            rating: 3,
                            owner: {
                                create: { email: 'u1@example.com' }, // duplicate email
                            },
                        },
                    }),
                ).rejects.toThrow();

                // Only the original records should exist
                await expect(client.ratedVideo.findMany()).toResolveWithLength(1);
                await expect(client.video.findMany()).toResolveWithLength(1);
                await expect(client.asset.findMany()).toResolveWithLength(1);
                await expect(client.user.findMany()).toResolveWithLength(1);
            });
        });

        describe('cascaded update atomicity', () => {
            it('rolls back delegate model update on unique violation', async () => {
                await client.ratedVideo.create({
                    data: { id: 1, duration: 100, url: 'abc', rating: 5 },
                });
                await client.ratedVideo.create({
                    data: { id: 2, duration: 200, url: 'def', rating: 3 },
                });

                // Attempt to update second video's url to duplicate first one
                await expect(
                    client.ratedVideo.update({
                        where: { id: 2 },
                        data: {
                            url: 'abc', // duplicate
                            rating: 10,
                        },
                    }),
                ).rejects.toThrow();

                // Second video should remain unchanged across all levels
                const video = await client.ratedVideo.findFirst({ where: { id: 2 } });
                expect(video!.url).toBe('def');
                expect(video!.rating).toBe(3);
            });

            it('rolls back delegate model update with nested relation on failure', async () => {
                await client.user.create({
                    data: { id: 1, email: 'u1@example.com' },
                });
                await client.ratedVideo.create({
                    data: {
                        id: 1,
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                        owner: { connect: { id: 1 } },
                    },
                });

                // Attempt to update a rated video: change rating AND create a nested
                // owner with a duplicate email — should fail atomically
                await expect(
                    client.ratedVideo.update({
                        where: { id: 1 },
                        data: {
                            rating: 99,
                            viewCount: 999,
                            owner: {
                                create: { email: 'u1@example.com' }, // duplicate email
                            },
                        },
                    }),
                ).rejects.toThrow();

                // Rating and viewCount should remain unchanged across all delegate levels
                const video = await client.ratedVideo.findFirst({ where: { id: 1 } });
                expect(video!.rating).toBe(5);
                expect(video!.viewCount).toBe(0);

                // No extra user should have been created
                await expect(client.user.findMany()).toResolveWithLength(1);
            });
        });

        describe('cascaded delete atomicity', () => {
            it('deletes all delegate levels atomically', async () => {
                await client.ratedVideo.create({
                    data: { id: 1, duration: 100, url: 'abc', rating: 5 },
                });

                // Delete at base level should cascade to all sub-model levels
                await client.asset.delete({ where: { id: 1 } });

                await expect(client.ratedVideo.findMany()).toResolveWithLength(0);
                await expect(client.video.findMany()).toResolveWithLength(0);
                await expect(client.asset.findMany()).toResolveWithLength(0);
            });

            it('rolls back nested delete of delegate model on failure', async () => {
                await client.user.create({
                    data: { id: 1, email: 'u1@example.com' },
                });
                await client.user.create({
                    data: { id: 2, email: 'u2@example.com' },
                });
                await client.ratedVideo.create({
                    data: {
                        id: 1,
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                        owner: { connect: { id: 1 } },
                    },
                });

                // Attempt a user update that includes both a nested asset delete
                // and a field update that causes a unique violation
                await expect(
                    client.user.update({
                        where: { id: 1 },
                        data: {
                            email: 'u2@example.com', // duplicate email
                            assets: {
                                delete: { id: 1 },
                            },
                        },
                    }),
                ).rejects.toThrow();

                // The asset should still exist (delete was rolled back)
                await expect(client.ratedVideo.findMany()).toResolveWithLength(1);
                await expect(client.video.findMany()).toResolveWithLength(1);
                await expect(client.asset.findMany()).toResolveWithLength(1);

                // User email should be unchanged
                const user = await client.user.findFirst({ where: { id: 1 } });
                expect(user!.email).toBe('u1@example.com');
            });

            it('cascade delete from parent propagates through delegate hierarchy', async () => {
                await client.user.create({
                    data: { id: 1, email: 'u1@example.com' },
                });
                await client.ratedVideo.create({
                    data: {
                        id: 1,
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                        owner: { connect: { id: 1 } },
                        comments: {
                            create: [{ content: 'c1' }, { content: 'c2' }],
                        },
                    },
                });
                await client.image.create({
                    data: {
                        id: 2,
                        format: 'png',
                        owner: { connect: { id: 1 } },
                    },
                });

                // Deleting user should cascade delete all owned assets and their comments
                await client.user.delete({ where: { id: 1 } });

                await expect(client.user.findMany()).toResolveWithLength(0);
                await expect(client.asset.findMany()).toResolveWithLength(0);
                await expect(client.video.findMany()).toResolveWithLength(0);
                await expect(client.ratedVideo.findMany()).toResolveWithLength(0);
                await expect(client.image.findMany()).toResolveWithLength(0);
                await expect(client.comment.findMany()).toResolveWithLength(0);
            });
        });
    });
});
