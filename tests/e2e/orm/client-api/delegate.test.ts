import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema, type SchemaType } from '../schemas/delegate/schema';

describe('Delegate model tests ', () => {
    let client: ClientContract<SchemaType>;

    beforeEach(async () => {
        client = await createTestClient(schema, {
            usePrismaPush: true,
            schemaFile: path.join(__dirname, '../schemas/delegate/schema.zmodel'),
        });
    });

    afterEach(async () => {
        await client.$disconnect();
    });

    describe('Delegate create tests', () => {
        it('works with create', async () => {
            // delegate model cannot be created directly
            await expect(
                // @ts-expect-error
                client.video.create({
                    data: {
                        duration: 100,
                        url: 'abc',
                    },
                }),
            ).rejects.toThrow('is a delegate');
            await expect(
                client.user.create({
                    data: {
                        assets: {
                            // @ts-expect-error
                            create: {},
                        },
                    },
                }),
            ).rejects.toThrow('is a delegate');

            // create entity with two levels of delegation
            await expect(
                client.ratedVideo.create({
                    data: {
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                    },
                }),
            ).resolves.toMatchObject({
                id: expect.any(Number),
                duration: 100,
                url: 'abc',
                rating: 5,
                assetType: 'Video',
                videoType: 'RatedVideo',
            });

            // create entity with relation
            await expect(
                client.ratedVideo.create({
                    data: {
                        duration: 50,
                        url: 'bcd',
                        rating: 5,
                        user: { create: { email: 'u1@example.com' } },
                    },
                    include: { user: true },
                }),
            ).resolves.toMatchObject({
                userId: expect.any(Number),
                user: {
                    email: 'u1@example.com',
                },
            });

            // create entity with one level of delegation
            await expect(
                client.image.create({
                    data: {
                        format: 'png',
                        gallery: {
                            create: {},
                        },
                    },
                }),
            ).resolves.toMatchObject({
                id: expect.any(Number),
                format: 'png',
                galleryId: expect.any(Number),
                assetType: 'Image',
            });

            // discriminator field cannot be set on create
            await expect(
                client.ratedVideo.create({
                    data: {
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                        // @ts-expect-error
                        videoType: 'RatedVideo',
                    },
                }),
            ).toBeRejectedByValidation(['videoType']);
        });

        it('works with createMany', async () => {
            await expect(
                client.ratedVideo.createMany({
                    data: [
                        { viewCount: 1, duration: 100, url: 'abc', rating: 5 },
                        { viewCount: 2, duration: 200, url: 'def', rating: 4 },
                    ],
                }),
            ).resolves.toEqual({ count: 2 });

            await expect(client.ratedVideo.findMany()).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        viewCount: 1,
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                    }),
                    expect.objectContaining({
                        viewCount: 2,
                        duration: 200,
                        url: 'def',
                        rating: 4,
                    }),
                ]),
            );

            await expect(
                client.ratedVideo.createMany({
                    data: [
                        { viewCount: 1, duration: 100, url: 'abc', rating: 5 },
                        { viewCount: 2, duration: 200, url: 'def', rating: 4 },
                    ],
                    skipDuplicates: true,
                }),
            ).rejects.toThrow('not supported');
        });

        it('works with createManyAndReturn', async () => {
            if (client.$schema.provider.type === ('mysql' as any)) {
                return;
            }

            await expect(
                client.ratedVideo.createManyAndReturn({
                    data: [
                        { viewCount: 1, duration: 100, url: 'abc', rating: 5 },
                        { viewCount: 2, duration: 200, url: 'def', rating: 4 },
                    ],
                }),
            ).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        viewCount: 1,
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                    }),
                    expect.objectContaining({
                        viewCount: 2,
                        duration: 200,
                        url: 'def',
                        rating: 4,
                    }),
                ]),
            );
        });

        it('ensures create is atomic', async () => {
            // create with a relation that fails
            await expect(
                client.ratedVideo.create({
                    data: {
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                    },
                }),
            ).toResolveTruthy();
            await expect(
                client.ratedVideo.create({
                    data: {
                        duration: 200,
                        url: 'abc',
                        rating: 3,
                    },
                }),
            ).rejects.toSatisfy((e) => e.cause.message.toLowerCase().match(/(constraint)|(duplicate)/i));

            await expect(client.ratedVideo.findMany()).toResolveWithLength(1);
            await expect(client.video.findMany()).toResolveWithLength(1);
            await expect(client.asset.findMany()).toResolveWithLength(1);
        });
    });

    it('works with find', async () => {
        const u = await client.user.create({
            data: {
                email: 'u1@example.com',
            },
        });
        const v = await client.ratedVideo.create({
            data: {
                duration: 100,
                url: 'abc',
                rating: 5,
                owner: { connect: { id: u.id } },
                user: { connect: { id: u.id } },
            },
        });

        const ratedVideoContent = {
            id: v.id,
            createdAt: expect.any(Date),
            duration: 100,
            rating: 5,
            assetType: 'Video',
            videoType: 'RatedVideo',
        };

        // include all base fields
        await expect(
            client.ratedVideo.findUnique({
                where: { id: v.id },
                include: { user: true, owner: true },
            }),
        ).resolves.toMatchObject({ ...ratedVideoContent, user: expect.any(Object), owner: expect.any(Object) });

        // select fields
        await expect(
            client.ratedVideo.findUnique({
                where: { id: v.id },
                select: {
                    id: true,
                    viewCount: true,
                    url: true,
                    rating: true,
                },
            }),
        ).resolves.toEqual({
            id: v.id,
            viewCount: 0,
            url: 'abc',
            rating: 5,
        });

        // omit fields
        const r: any = await client.ratedVideo.findUnique({
            where: { id: v.id },
            omit: {
                viewCount: true,
                url: true,
                rating: true,
            },
        });
        expect(r.viewCount).toBeUndefined();
        expect(r.url).toBeUndefined();
        expect(r.rating).toBeUndefined();
        expect(r.duration).toEqual(expect.any(Number));

        // include all sub fields
        await expect(
            client.video.findUnique({
                where: { id: v.id },
            }),
        ).resolves.toMatchObject(ratedVideoContent);

        // include all sub fields
        await expect(
            client.asset.findUnique({
                where: { id: v.id },
            }),
        ).resolves.toMatchObject(ratedVideoContent);

        // find as a relation
        await expect(
            client.user.findUnique({
                where: { id: u.id },
                include: { assets: true, ratedVideos: true },
            }),
        ).resolves.toMatchObject({
            assets: [ratedVideoContent],
            ratedVideos: [ratedVideoContent],
        });

        // find as a relation with selection
        await expect(
            client.user.findUnique({
                where: { id: u.id },
                include: {
                    assets: {
                        select: { id: true, assetType: true },
                    },
                    ratedVideos: {
                        select: {
                            url: true,
                            rating: true,
                        },
                    },
                },
            }),
        ).resolves.toMatchObject({
            assets: [{ id: v.id, assetType: 'Video' }],
            ratedVideos: [{ url: 'abc', rating: 5 }],
        });
    });

    describe('Delegate filter tests', () => {
        beforeEach(async () => {
            const u = await client.user.create({
                data: {
                    email: 'u1@example.com',
                },
            });
            await client.ratedVideo.create({
                data: {
                    viewCount: 0,
                    duration: 100,
                    url: 'v1',
                    rating: 5,
                    owner: { connect: { id: u.id } },
                    user: { connect: { id: u.id } },
                    comments: { create: { content: 'c1' } },
                },
            });
            await client.ratedVideo.create({
                data: {
                    viewCount: 1,
                    duration: 200,
                    url: 'v2',
                    rating: 4,
                    owner: { connect: { id: u.id } },
                    user: { connect: { id: u.id } },
                    comments: { create: { content: 'c2' } },
                },
            });
        });

        it('works with toplevel filters', async () => {
            await expect(
                client.asset.findMany({
                    where: { viewCount: { gt: 0 } },
                }),
            ).toResolveWithLength(1);

            await expect(
                client.video.findMany({
                    where: { viewCount: { gt: 0 }, url: 'v1' },
                }),
            ).toResolveWithLength(0);

            await expect(
                client.video.findMany({
                    where: { viewCount: { gt: 0 }, url: 'v2' },
                }),
            ).toResolveWithLength(1);

            await expect(
                client.ratedVideo.findMany({
                    where: { viewCount: { gt: 0 }, rating: 5 },
                }),
            ).toResolveWithLength(0);

            await expect(
                client.ratedVideo.findMany({
                    where: { viewCount: { gt: 0 }, rating: 4 },
                }),
            ).toResolveWithLength(1);
        });

        it('works with filtering relations', async () => {
            await expect(
                client.user.findFirst({
                    include: {
                        assets: {
                            where: { viewCount: { gt: 0 } },
                        },
                    },
                }),
            ).resolves.toSatisfy((user) => user.assets.length === 1);

            await expect(
                client.user.findFirst({
                    include: {
                        ratedVideos: {
                            where: { viewCount: { gt: 0 }, url: 'v1' },
                        },
                    },
                }),
            ).resolves.toSatisfy((user) => user.ratedVideos.length === 0);

            await expect(
                client.user.findFirst({
                    include: {
                        ratedVideos: {
                            where: { viewCount: { gt: 0 }, url: 'v2' },
                        },
                    },
                }),
            ).resolves.toSatisfy((user) => user.ratedVideos.length === 1);

            await expect(
                client.user.findFirst({
                    include: {
                        ratedVideos: {
                            where: { viewCount: { gt: 0 }, rating: 5 },
                        },
                    },
                }),
            ).resolves.toSatisfy((user) => user.ratedVideos.length === 0);

            await expect(
                client.user.findFirst({
                    include: {
                        ratedVideos: {
                            where: { viewCount: { gt: 0 }, rating: 4 },
                        },
                    },
                }),
            ).resolves.toSatisfy((user) => user.ratedVideos.length === 1);
        });

        it('works with filtering parents', async () => {
            await expect(
                client.user.findFirst({
                    where: {
                        assets: {
                            some: { viewCount: { gt: 0 } },
                        },
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.user.findFirst({
                    where: {
                        assets: {
                            some: { viewCount: { gt: 1 } },
                        },
                    },
                }),
            ).toResolveFalsy();

            await expect(
                client.user.findFirst({
                    where: {
                        ratedVideos: {
                            some: { viewCount: { gt: 0 }, url: 'v1' },
                        },
                    },
                }),
            ).toResolveFalsy();

            await expect(
                client.user.findFirst({
                    where: {
                        ratedVideos: {
                            some: { viewCount: { gt: 0 }, url: 'v2' },
                        },
                    },
                }),
            ).toResolveTruthy();
        });

        it('works with filtering with relations from base', async () => {
            await expect(
                client.video.findFirst({
                    where: {
                        owner: {
                            email: 'u1@example.com',
                        },
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.video.findFirst({
                    where: {
                        owner: {
                            email: 'u2@example.com',
                        },
                    },
                }),
            ).toResolveFalsy();

            await expect(
                client.video.findFirst({
                    where: {
                        owner: null,
                    },
                }),
            ).toResolveFalsy();

            await expect(
                client.video.findFirst({
                    where: {
                        owner: { is: null },
                    },
                }),
            ).toResolveFalsy();

            await expect(
                client.video.findFirst({
                    where: {
                        owner: { isNot: null },
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.video.findFirst({
                    where: {
                        comments: {
                            some: { content: 'c1' },
                        },
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.video.findFirst({
                    where: {
                        comments: {
                            every: { content: 'c2' },
                        },
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.video.findFirst({
                    where: {
                        comments: {
                            none: { content: 'c1' },
                        },
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.video.findFirst({
                    where: {
                        comments: {
                            none: { content: { startsWith: 'c' } },
                        },
                    },
                }),
            ).toResolveFalsy();
        });
    });

    describe('Delegate update tests', () => {
        beforeEach(async () => {
            const u = await client.user.create({
                data: {
                    id: 1,
                    email: 'u1@example.com',
                },
            });
            await client.ratedVideo.create({
                data: {
                    id: 1,
                    viewCount: 0,
                    duration: 100,
                    url: 'v1',
                    rating: 5,
                    owner: { connect: { id: u.id } },
                    user: { connect: { id: u.id } },
                },
            });
        });

        it('works with toplevel update', async () => {
            // id filter
            await expect(
                client.ratedVideo.update({
                    where: { id: 1 },
                    data: { viewCount: { increment: 1 }, duration: 200, rating: { set: 4 } },
                }),
            ).resolves.toMatchObject({
                viewCount: 1,
                duration: 200,
                rating: 4,
            });
            await expect(
                client.video.update({
                    where: { id: 1 },
                    data: { viewCount: { decrement: 1 }, duration: 100 },
                }),
            ).resolves.toMatchObject({
                viewCount: 0,
                duration: 100,
            });
            await expect(
                client.asset.update({
                    where: { id: 1 },
                    data: { viewCount: { increment: 1 } },
                }),
            ).resolves.toMatchObject({
                viewCount: 1,
            });

            // unique field filter
            await expect(
                client.ratedVideo.update({
                    where: { url: 'v1' },
                    data: { viewCount: 2, duration: 300, rating: 3 },
                }),
            ).resolves.toMatchObject({
                viewCount: 2,
                duration: 300,
                rating: 3,
            });
            await expect(
                client.video.update({
                    where: { url: 'v1' },
                    data: { viewCount: 3 },
                }),
            ).resolves.toMatchObject({
                viewCount: 3,
            });

            // not found
            await expect(
                client.ratedVideo.update({
                    where: { url: 'v2' },
                    data: { viewCount: 4 },
                }),
            ).toBeRejectedNotFound();

            // update id
            await expect(
                client.ratedVideo.update({
                    where: { id: 1 },
                    data: { id: 2 },
                }),
            ).resolves.toMatchObject({
                id: 2,
                viewCount: 3,
            });

            // discriminator field cannot be updated
            await expect(
                client.ratedVideo.update({
                    where: { id: 2 },
                    // @ts-expect-error
                    data: { videoType: 'MyVideo' },
                }),
            ).toBeRejectedByValidation(['videoType']);
        });

        it('works with nested update', async () => {
            await expect(
                client.user.update({
                    where: { id: 1 },
                    data: {
                        assets: {
                            update: {
                                where: { id: 1 },
                                data: { viewCount: { increment: 1 } },
                            },
                        },
                    },
                    include: { assets: true },
                }),
            ).resolves.toMatchObject({
                assets: [{ viewCount: 1 }],
            });

            await expect(
                client.user.update({
                    where: { id: 1 },
                    data: {
                        ratedVideos: {
                            update: {
                                where: { id: 1 },
                                data: { viewCount: 2, rating: 4, duration: 200 },
                            },
                        },
                    },
                    include: { ratedVideos: true },
                }),
            ).resolves.toMatchObject({
                ratedVideos: [{ viewCount: 2, rating: 4, duration: 200 }],
            });

            // unique filter
            await expect(
                client.user.update({
                    where: { id: 1 },
                    data: {
                        ratedVideos: {
                            update: {
                                where: { url: 'v1' },
                                data: { viewCount: 3 },
                            },
                        },
                    },
                    include: { ratedVideos: true },
                }),
            ).resolves.toMatchObject({
                ratedVideos: [{ viewCount: 3 }],
            });

            // deep nested
            await expect(
                client.user.update({
                    where: { id: 1 },
                    data: {
                        assets: {
                            update: {
                                where: { id: 1 },
                                data: { comments: { create: { content: 'c1' } } },
                            },
                        },
                    },
                    include: { assets: { include: { comments: true } } },
                }),
            ).resolves.toMatchObject({
                assets: [{ comments: [{ content: 'c1' }] }],
            });
        });

        it('works with updating a base relation', async () => {
            await expect(
                client.video.update({
                    where: { id: 1 },
                    data: {
                        owner: { update: { level: { increment: 1 } } },
                    },
                    include: { owner: true },
                }),
            ).resolves.toMatchObject({
                owner: { level: 1 },
            });
        });

        it('works with updateMany', async () => {
            await client.ratedVideo.create({
                data: { id: 2, viewCount: 1, duration: 200, url: 'abc', rating: 5 },
            });

            // update from sub model
            await expect(
                client.ratedVideo.updateMany({
                    where: { duration: { gt: 100 } },
                    data: { viewCount: { increment: 1 }, duration: { increment: 1 }, rating: { set: 3 } },
                }),
            ).resolves.toEqual({ count: 1 });

            await expect(client.ratedVideo.findMany()).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        viewCount: 2,
                        duration: 201,
                        rating: 3,
                    }),
                ]),
            );

            await expect(
                client.ratedVideo.updateMany({
                    where: { viewCount: { gt: 1 } },
                    data: { viewCount: { increment: 1 } },
                }),
            ).resolves.toEqual({ count: 1 });

            await expect(
                client.ratedVideo.updateMany({
                    where: { rating: 3 },
                    data: { viewCount: { increment: 1 } },
                }),
            ).resolves.toEqual({ count: 1 });

            // update from delegate model
            await expect(
                client.asset.updateMany({
                    where: { viewCount: { gt: 0 } },
                    data: { viewCount: 100 },
                }),
            ).resolves.toEqual({ count: 1 });
            await expect(
                client.video.updateMany({
                    where: { duration: { gt: 200 } },
                    data: { viewCount: 200, duration: 300 },
                }),
            ).resolves.toEqual({ count: 1 });
            await expect(client.ratedVideo.findMany()).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        viewCount: 200,
                        duration: 300,
                    }),
                ]),
            );

            // updateMany with limit unsupported
            await expect(
                client.ratedVideo.updateMany({
                    where: { duration: { gt: 200 } },
                    data: { viewCount: 200, duration: 300 },
                    limit: 1,
                }),
            ).rejects.toThrow('Updating with a limit is not supported for polymorphic models');
        });

        it('works with updateManyAndReturn', async () => {
            if (client.$schema.provider.type === ('mysql' as any)) {
                return;
            }

            await client.ratedVideo.create({
                data: { id: 2, viewCount: 1, duration: 200, url: 'abc', rating: 5 },
            });

            // update from sub model
            await expect(
                client.ratedVideo.updateManyAndReturn({
                    where: { duration: { gt: 100 } },
                    data: { viewCount: { increment: 1 }, duration: { increment: 1 }, rating: { set: 3 } },
                }),
            ).resolves.toEqual([
                expect.objectContaining({
                    viewCount: 2,
                    duration: 201,
                    rating: 3,
                }),
            ]);

            // update from delegate model
            await expect(
                client.asset.updateManyAndReturn({
                    where: { viewCount: { gt: 0 } },
                    data: { viewCount: 100 },
                }),
            ).resolves.toEqual([
                expect.objectContaining({
                    viewCount: 100,
                    duration: 201,
                    rating: 3,
                }),
            ]);
        });

        it('works with upsert', async () => {
            await expect(
                // @ts-expect-error
                client.asset.upsert({
                    where: { id: 2 },
                    create: {
                        viewCount: 10,
                    },
                    update: {
                        viewCount: { increment: 1 },
                    },
                }),
            ).rejects.toThrow('is a delegate');

            // create case
            await expect(
                client.ratedVideo.upsert({
                    where: { id: 2 },
                    create: {
                        id: 2,
                        viewCount: 2,
                        duration: 200,
                        url: 'v2',
                        rating: 3,
                    },
                    update: {
                        viewCount: { increment: 1 },
                    },
                }),
            ).resolves.toMatchObject({
                id: 2,
                viewCount: 2,
            });

            // update case
            await expect(
                client.ratedVideo.upsert({
                    where: { id: 2 },
                    create: {
                        id: 2,
                        viewCount: 2,
                        duration: 200,
                        url: 'v2',
                        rating: 3,
                    },
                    update: {
                        viewCount: 3,
                        duration: 300,
                        rating: 2,
                    },
                }),
            ).resolves.toMatchObject({
                id: 2,
                viewCount: 3,
                duration: 300,
                rating: 2,
            });
        });
    });

    describe('Delegate delete tests', () => {
        it('works with delete', async () => {
            // delete from sub model
            await client.ratedVideo.create({
                data: {
                    id: 1,
                    duration: 100,
                    url: 'abc',
                    rating: 5,
                },
            });
            await expect(
                client.ratedVideo.delete({
                    where: { url: 'abc' },
                }),
            ).resolves.toMatchObject({
                id: 1,
                duration: 100,
                url: 'abc',
                rating: 5,
            });
            await expect(client.ratedVideo.findMany()).toResolveWithLength(0);
            await expect(client.video.findMany()).toResolveWithLength(0);
            await expect(client.asset.findMany()).toResolveWithLength(0);

            // delete from base model
            await client.ratedVideo.create({
                data: {
                    id: 1,
                    duration: 100,
                    url: 'abc',
                    rating: 5,
                },
            });
            await expect(
                client.asset.delete({
                    where: { id: 1 },
                }),
            ).resolves.toMatchObject({
                id: 1,
                duration: 100,
                url: 'abc',
                rating: 5,
            });
            await expect(client.ratedVideo.findMany()).toResolveWithLength(0);
            await expect(client.video.findMany()).toResolveWithLength(0);
            await expect(client.asset.findMany()).toResolveWithLength(0);

            // nested delete
            await client.user.create({
                data: {
                    id: 1,
                    email: 'abc',
                },
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
            await expect(
                client.user.update({
                    where: { id: 1 },
                    data: {
                        assets: {
                            delete: { id: 1 },
                        },
                    },
                    include: { assets: true },
                }),
            ).resolves.toMatchObject({ assets: [] });
            await expect(client.ratedVideo.findMany()).toResolveWithLength(0);
            await expect(client.video.findMany()).toResolveWithLength(0);
            await expect(client.asset.findMany()).toResolveWithLength(0);

            // delete user should cascade to ratedVideo and in turn delete its bases
            await client.ratedVideo.create({
                data: {
                    id: 1,
                    duration: 100,
                    url: 'abc',
                    rating: 5,
                    user: { connect: { id: 1 } },
                },
            });
            await expect(
                client.user.delete({
                    where: { id: 1 },
                }),
            ).toResolveTruthy();
            await expect(client.ratedVideo.findMany()).toResolveWithLength(0);
            await expect(client.video.findMany()).toResolveWithLength(0);
            await expect(client.asset.findMany()).toResolveWithLength(0);
        });

        it('works with deleteMany', async () => {
            await client.ratedVideo.createMany({
                data: [
                    {
                        id: 1,
                        viewCount: 1,
                        duration: 100,
                        url: 'abc',
                        rating: 5,
                    },
                    {
                        id: 2,
                        viewCount: 2,
                        duration: 200,
                        url: 'def',
                        rating: 4,
                    },
                ],
            });

            await expect(
                client.video.deleteMany({
                    where: { duration: { gt: 150 }, viewCount: 1 },
                }),
            ).resolves.toMatchObject({ count: 0 });
            await expect(
                client.video.deleteMany({
                    where: { duration: { gt: 150 }, viewCount: 2 },
                }),
            ).resolves.toMatchObject({ count: 1 });
            await expect(client.ratedVideo.findMany()).toResolveWithLength(1);
            await expect(client.video.findMany()).toResolveWithLength(1);
            await expect(client.asset.findMany()).toResolveWithLength(1);
        });
    });

    describe('Delegate aggregation tests', () => {
        beforeEach(async () => {
            const u = await client.user.create({
                data: {
                    id: 1,
                    email: 'u1@example.com',
                },
            });
            await client.ratedVideo.create({
                data: {
                    id: 1,
                    viewCount: 0,
                    duration: 100,
                    url: 'v1',
                    rating: 5,
                    owner: { connect: { id: u.id } },
                    user: { connect: { id: u.id } },
                    comments: { create: [{ content: 'c1' }, { content: 'c2' }] },
                },
            });
            await client.ratedVideo.create({
                data: {
                    id: 2,
                    viewCount: 2,
                    duration: 200,
                    url: 'v2',
                    rating: 3,
                },
            });
        });

        it('works with count', async () => {
            await expect(
                client.ratedVideo.count({
                    where: { rating: 5 },
                }),
            ).resolves.toEqual(1);
            await expect(
                client.ratedVideo.count({
                    where: { duration: 100 },
                }),
            ).resolves.toEqual(1);
            await expect(
                client.ratedVideo.count({
                    where: { viewCount: 2 },
                }),
            ).resolves.toEqual(1);

            await expect(
                client.video.count({
                    where: { duration: 100 },
                }),
            ).resolves.toEqual(1);
            await expect(
                client.asset.count({
                    where: { viewCount: { gt: 0 } },
                }),
            ).resolves.toEqual(1);

            // field selection
            await expect(
                client.ratedVideo.count({
                    select: { _all: true, viewCount: true, url: true, rating: true },
                }),
            ).resolves.toMatchObject({
                _all: 2,
                viewCount: 2,
                url: 2,
                rating: 2,
            });
            await expect(
                client.video.count({
                    select: { _all: true, viewCount: true, url: true },
                }),
            ).resolves.toMatchObject({
                _all: 2,
                viewCount: 2,
                url: 2,
            });
            await expect(
                client.asset.count({
                    select: { _all: true, viewCount: true },
                }),
            ).resolves.toMatchObject({
                _all: 2,
                viewCount: 2,
            });
        });

        it('works with aggregate', async () => {
            await expect(
                client.ratedVideo.aggregate({
                    where: { viewCount: { gte: 0 }, duration: { gt: 0 }, rating: { gt: 0 } },
                    _avg: { viewCount: true, duration: true, rating: true },
                    _count: true,
                }),
            ).resolves.toMatchObject({
                _avg: {
                    viewCount: 1,
                    duration: 150,
                    rating: 4,
                },
                _count: 2,
            });
            await expect(
                client.video.aggregate({
                    where: { viewCount: { gte: 0 }, duration: { gt: 0 } },
                    _avg: { viewCount: true, duration: true },
                    _count: true,
                }),
            ).resolves.toMatchObject({
                _avg: {
                    viewCount: 1,
                    duration: 150,
                },
                _count: 2,
            });
            await expect(
                client.asset.aggregate({
                    where: { viewCount: { gte: 0 } },
                    _avg: { viewCount: true },
                    _count: true,
                }),
            ).resolves.toMatchObject({
                _avg: {
                    viewCount: 1,
                },
                _count: 2,
            });

            // just count
            await expect(
                client.ratedVideo.aggregate({
                    _count: true,
                }),
            ).resolves.toMatchObject({
                _count: 2,
            });
        });
    });
});
