import { PrismaErrorCode } from '@zenstackhq/runtime';
import { loadSchema } from '@zenstackhq/testtools';
import { POLYMORPHIC_MANY_TO_MANY_SCHEMA, POLYMORPHIC_SCHEMA } from './utils';

describe('Polymorphism Test', () => {
    const schema = POLYMORPHIC_SCHEMA;

    async function setup() {
        const { enhance } = await loadSchema(schema, { enhancements: ['delegate'] });
        const db = enhance();

        const user = await db.user.create({ data: { id: 1 } });

        const video = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });

        const videoWithOwner = await db.ratedVideo.findUnique({ where: { id: video.id }, include: { owner: true } });

        return { db, video, user, videoWithOwner };
    }

    it('create hierarchy', async () => {
        const { enhance } = await loadSchema(schema, { enhancements: ['delegate'] });
        const db = enhance();

        const user = await db.user.create({ data: { id: 1 } });

        const video = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
            include: { owner: true },
        });

        expect(video).toMatchObject({
            viewCount: 1,
            duration: 100,
            url: 'xyz',
            rating: 100,
            assetType: 'Video',
            videoType: 'RatedVideo',
            owner: user,
        });

        await expect(db.asset.create({ data: { type: 'Video' } })).rejects.toThrow('is a delegate');
        await expect(db.video.create({ data: { type: 'RatedVideo' } })).rejects.toThrow('is a delegate');

        const image = await db.image.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, format: 'png' },
            include: { owner: true },
        });
        expect(image).toMatchObject({
            viewCount: 1,
            format: 'png',
            assetType: 'Image',
            owner: user,
        });

        // create in a nested payload
        const gallery = await db.gallery.create({
            data: {
                images: {
                    create: [
                        { owner: { connect: { id: user.id } }, format: 'png', viewCount: 1 },
                        { owner: { connect: { id: user.id } }, format: 'jpg', viewCount: 2 },
                    ],
                },
            },
            include: { images: { include: { owner: true } } },
        });
        expect(gallery.images).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    format: 'png',
                    assetType: 'Image',
                    viewCount: 1,
                    owner: user,
                }),
                expect.objectContaining({
                    format: 'jpg',
                    assetType: 'Image',
                    viewCount: 2,
                    owner: user,
                }),
            ])
        );
    });

    it('create with base all defaults', async () => {
        const { enhance } = await loadSchema(
            `
            model Base {
                id Int @id @default(autoincrement())
                createdAt DateTime @default(now())
                type String

                @@delegate(type)
            }

            model Foo extends Base {
                name String
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        const r = await db.foo.create({ data: { name: 'foo' } });
        expect(r).toMatchObject({ name: 'foo', type: 'Foo', id: expect.any(Number), createdAt: expect.any(Date) });
    });

    it('create with nesting', async () => {
        const { enhance } = await loadSchema(schema, { enhancements: ['delegate'] });
        const db = enhance();

        // nested create a relation from base
        await expect(
            db.ratedVideo.create({
                data: { owner: { create: { id: 2 } }, url: 'xyz', rating: 200, duration: 200 },
                include: { owner: true },
            })
        ).resolves.toMatchObject({ owner: { id: 2 } });
    });

    it('create many polymorphic model', async () => {
        const { enhance } = await loadSchema(schema, { enhancements: ['delegate'] });
        const db = enhance();

        await expect(
            db.ratedVideo.createMany({ data: { viewCount: 1, duration: 100, url: 'xyz', rating: 100 } })
        ).resolves.toMatchObject({ count: 1 });

        await expect(
            db.ratedVideo.createManyAndReturn({ data: { viewCount: 1, duration: 100, url: 'xyz', rating: 100 } })
        ).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    assetType: 'Video',
                    videoType: 'RatedVideo',
                    viewCount: 1,
                    duration: 100,
                    url: 'xyz',
                    rating: 100,
                }),
            ])
        );

        await expect(
            db.ratedVideo.createMany({
                data: [
                    { viewCount: 2, duration: 200, url: 'xyz', rating: 100 },
                    { viewCount: 3, duration: 300, url: 'xyz', rating: 200 },
                ],
            })
        ).resolves.toMatchObject({ count: 2 });

        await expect(
            db.ratedVideo.createManyAndReturn({
                data: [
                    { viewCount: 2, duration: 200, url: 'xyz', rating: 100 },
                    { viewCount: 3, duration: 300, url: 'xyz', rating: 200 },
                ],
                select: { videoType: true, viewCount: true, rating: true },
            })
        ).resolves.toEqual(
            expect.arrayContaining([
                { videoType: 'RatedVideo', viewCount: 2, rating: 100 },
                { videoType: 'RatedVideo', viewCount: 3, rating: 200 },
            ])
        );
    });

    it('create many polymorphic relation', async () => {
        const { enhance } = await loadSchema(schema, { enhancements: ['delegate'] });
        const db = enhance();

        const video1 = await db.ratedVideo.create({
            data: { viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        await expect(
            db.user.createMany({ data: { id: 1, assets: { connect: { id: video1.id } } } })
        ).resolves.toMatchObject({ count: 1 });

        const video2 = await db.ratedVideo.create({
            data: { viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        await expect(
            db.user.createMany({ data: [{ id: 2, assets: { connect: { id: video2.id } } }, { id: 3 }] })
        ).resolves.toMatchObject({ count: 2 });
    });

    it('create concrete with explicit id', async () => {
        const { enhance } = await loadSchema(schema, { enhancements: ['delegate'] });
        const db = enhance();

        await expect(
            db.ratedVideo.create({ data: { id: 1, duration: 100, url: 'xyz', rating: 5 } })
        ).resolves.toMatchObject({
            id: 1,
            duration: 100,
            url: 'xyz',
            rating: 5,
            assetType: 'Video',
            videoType: 'RatedVideo',
        });
    });

    it('read with concrete', async () => {
        const { db, user, video } = await setup();

        // find with include
        let found = await db.ratedVideo.findFirst({ include: { owner: true } });
        expect(found).toMatchObject(video);
        expect(found.owner).toMatchObject(user);

        // find with select
        found = await db.ratedVideo.findFirst({ select: { id: true, createdAt: true, url: true, rating: true } });
        expect(found).toMatchObject({ id: video.id, createdAt: video.createdAt, url: video.url, rating: video.rating });

        // findFirstOrThrow
        found = await db.ratedVideo.findFirstOrThrow();
        expect(found).toMatchObject(video);
        await expect(
            db.ratedVideo.findFirstOrThrow({
                where: { id: video.id + 1 },
            })
        ).rejects.toThrow();

        // findUnique
        found = await db.ratedVideo.findUnique({
            where: { id: video.id },
        });
        expect(found).toMatchObject(video);

        // findUniqueOrThrow
        found = await db.ratedVideo.findUniqueOrThrow({
            where: { id: video.id },
        });
        expect(found).toMatchObject(video);
        await expect(
            db.ratedVideo.findUniqueOrThrow({
                where: { id: video.id + 1 },
            })
        ).rejects.toThrow();

        // findMany
        let items = await db.ratedVideo.findMany();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject(video);

        // findMany not found
        items = await db.ratedVideo.findMany({ where: { id: video.id + 1 } });
        expect(items).toHaveLength(0);

        // findMany with select
        items = await db.ratedVideo.findMany({ select: { id: true, createdAt: true, url: true, rating: true } });
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            id: video.id,
            createdAt: video.createdAt,
            url: video.url,
            rating: video.rating,
        });

        // find with base filter
        found = await db.ratedVideo.findFirst({ where: { viewCount: video.viewCount } });
        expect(found).toMatchObject(video);
        found = await db.ratedVideo.findFirst({ where: { url: video.url, owner: { id: user.id } } });
        expect(found).toMatchObject(video);

        // image: single inheritance
        const image = await db.image.create({
            data: { owner: { connect: { id: 1 } }, viewCount: 1, format: 'png' },
            include: { owner: true },
        });
        const readImage = await db.image.findFirst({ include: { owner: true } });
        expect(readImage).toMatchObject(image);
        expect(readImage.owner).toMatchObject(user);
    });

    it('read with base', async () => {
        const { db, user, video: r } = await setup();

        let video = await db.video.findFirst({ where: { duration: r.duration }, include: { owner: true } });
        expect(video).toMatchObject({
            ...r,
            assetType: 'Video',
            videoType: 'RatedVideo',
        });
        expect(video.owner).toMatchObject(user);

        const asset = await db.asset.findFirst({ where: { viewCount: r.viewCount }, include: { owner: true } });
        expect(asset).toMatchObject({
            ...r,
            assetType: 'Video',
            videoType: 'RatedVideo',
            owner: expect.objectContaining(user),
        });

        const userWithAssets = await db.user.findUnique({ where: { id: user.id }, include: { assets: true } });
        expect(userWithAssets.assets[0]).toMatchObject(r);

        const image = await db.image.create({
            data: { owner: { connect: { id: 1 } }, viewCount: 1, format: 'png' },
            include: { owner: true },
        });
        const imgAsset = await db.asset.findFirst({ where: { assetType: 'Image' }, include: { owner: true } });
        expect(imgAsset).toMatchObject({
            id: image.id,
            createdAt: image.createdAt,
            assetType: 'Image',
            viewCount: image.viewCount,
            format: 'png',
            owner: expect.objectContaining(user),
        });
    });

    it('read with compound filter', async () => {
        const { enhance } = await loadSchema(
            `
            model Base {
                id Int @id @default(autoincrement())
                type String
                viewCount Int
                @@delegate(type)
            }

            model Foo extends Base {
                name String
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        await db.foo.create({ data: { name: 'foo1', viewCount: 0 } });
        await db.foo.create({ data: { name: 'foo2', viewCount: 1 } });

        await expect(db.foo.findMany({ where: { viewCount: { gt: 0 } } })).resolves.toHaveLength(1);
        await expect(db.foo.findMany({ where: { AND: { viewCount: { gt: 0 } } } })).resolves.toHaveLength(1);
        await expect(db.foo.findMany({ where: { AND: [{ viewCount: { gt: 0 } }] } })).resolves.toHaveLength(1);
        await expect(db.foo.findMany({ where: { OR: [{ viewCount: { gt: 0 } }] } })).resolves.toHaveLength(1);
        await expect(db.foo.findMany({ where: { NOT: { viewCount: { lte: 0 } } } })).resolves.toHaveLength(1);
    });

    it('read with nested filter', async () => {
        const { enhance } = await loadSchema(
            `
            model Base {
                id Int @id @default(autoincrement())
                type String
                viewCount Int
                @@delegate(type)
            }

            model Foo extends Base {
                name String
                bar Bar?
            }

            model Bar extends Base {
                foo Foo @relation(fields: [fooId], references: [id])
                fooId Int @unique
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();

        await db.bar.create({
            data: { foo: { create: { name: 'foo', viewCount: 2 } }, viewCount: 1 },
        });

        await expect(
            db.bar.findMany({
                where: { viewCount: { gt: 0 }, foo: { viewCount: { gt: 1 } } },
            })
        ).resolves.toHaveLength(1);
    });

    it('read with counting relation defined in base', async () => {
        const { enhance } = await loadSchema(
            `

        model A {
            id Int @id @default(autoincrement())
            type String
            bs B[]
            cs C[]
            @@delegate(type)
        }
            
        model A1 extends A {
            a1 Int
            type1 String
            @@delegate(type1)
        }

        model A2 extends A1 {
            a2 Int
        }

        model B {
            id Int @id @default(autoincrement())
            a A @relation(fields: [aId], references: [id])
            aId Int
            b Int
        }

        model C {
            id Int @id @default(autoincrement())
            a A @relation(fields: [aId], references: [id])
            aId Int
            c Int
        }
            `,
            { enhancements: ['delegate'] }
        );
        const db = enhance();

        const a2 = await db.a2.create({
            data: { a1: 1, a2: 2, bs: { create: [{ b: 1 }, { b: 2 }] }, cs: { create: [{ c: 1 }] } },
            include: { _count: { select: { bs: true } } },
        });
        expect(a2).toMatchObject({ a1: 1, a2: 2, _count: { bs: 2 } });

        await expect(
            db.a2.findFirst({ select: { a1: true, _count: { select: { bs: true } } } })
        ).resolves.toStrictEqual({
            a1: 1,
            _count: { bs: 2 },
        });

        await expect(db.a.findFirst({ select: { _count: { select: { bs: true, cs: true } } } })).resolves.toMatchObject(
            {
                _count: { bs: 2, cs: 1 },
            }
        );
    });

    it('order by base fields', async () => {
        const { db, user } = await setup();

        await expect(
            db.video.findMany({
                orderBy: { viewCount: 'desc' },
            })
        ).resolves.toHaveLength(1);

        await expect(
            db.ratedVideo.findMany({
                orderBy: { duration: 'asc' },
            })
        ).resolves.toHaveLength(1);

        await expect(
            db.user.findMany({
                orderBy: { assets: { _count: 'desc' } },
            })
        ).resolves.toHaveLength(1);

        await expect(
            db.user.findUnique({
                where: { id: user.id },
                include: {
                    ratedVideos: {
                        orderBy: {
                            viewCount: 'desc',
                        },
                    },
                },
            })
        ).toResolveTruthy();
    });

    it('update simple', async () => {
        const { db, videoWithOwner: video } = await setup();

        const read = await db.ratedVideo.findUnique({ where: { id: video.id } });

        // update with concrete
        let updated = await db.ratedVideo.update({
            where: { id: video.id },
            data: { rating: 200 },
            include: { owner: true },
        });
        expect(updated.rating).toBe(200);
        expect(updated.owner).toBeTruthy();
        expect(updated.updatedAt.getTime()).toBeGreaterThan(read.updatedAt.getTime());

        // update with base
        updated = await db.video.update({
            where: { id: video.id },
            data: { duration: 200 },
            select: { duration: true, createdAt: true },
        });
        expect(updated.duration).toBe(200);
        expect(updated.createdAt).toBeTruthy();

        // update with base
        updated = await db.asset.update({
            where: { id: video.id },
            data: { viewCount: 200 },
        });
        expect(updated.viewCount).toBe(200);

        // set discriminator
        await expect(db.ratedVideo.update({ where: { id: video.id }, data: { assetType: 'Image' } })).rejects.toThrow(
            'is a discriminator'
        );
        await expect(
            db.ratedVideo.update({ where: { id: video.id }, data: { videoType: 'RatedVideo' } })
        ).rejects.toThrow('is a discriminator');
    });

    it('update nested create', async () => {
        const { db, videoWithOwner: video, user } = await setup();

        // create delegate not allowed
        await expect(
            db.user.update({
                where: { id: user.id },
                data: {
                    assets: {
                        create: { viewCount: 1 },
                    },
                },
                include: { assets: true },
            })
        ).rejects.toThrow('is a delegate');

        // create concrete
        await expect(
            db.user.update({
                where: { id: user.id },
                data: {
                    ratedVideos: {
                        create: {
                            viewCount: 1,
                            duration: 100,
                            url: 'xyz',
                            rating: 100,
                            owner: { connect: { id: user.id } },
                        },
                    },
                },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([
                expect.objectContaining({ viewCount: 1, duration: 100, url: 'xyz', rating: 100 }),
            ]),
        });

        // nested create a relation from base
        const newVideo = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        await expect(
            db.ratedVideo.update({
                where: { id: newVideo.id },
                data: { owner: { create: { id: 2 } }, url: 'xyz', duration: 200, rating: 200 },
                include: { owner: true },
            })
        ).resolves.toMatchObject({ owner: { id: 2 } });
    });

    it('update nested updateOne', async () => {
        const { db, videoWithOwner: video, user } = await setup();

        // update
        let updated = await db.asset.update({
            where: { id: video.id },
            data: { owner: { update: { level: 1 } } },
            include: { owner: true },
        });
        expect(updated.owner.level).toBe(1);

        updated = await db.video.update({
            where: { id: video.id },
            data: { duration: 300, owner: { update: { level: 2 } } },
            include: { owner: true },
        });
        expect(updated.duration).toBe(300);
        expect(updated.owner.level).toBe(2);

        updated = await db.ratedVideo.update({
            where: { id: video.id },
            data: { rating: 300, owner: { update: { level: 3 } } },
            include: { owner: true },
        });
        expect(updated.rating).toBe(300);
        expect(updated.owner.level).toBe(3);
    });

    it('update nested updateMany', async () => {
        const { db } = await setup();

        const user = await db.user.create({
            data: {
                email: 'a@b.com',
                ratedVideos: {
                    create: { id: 10, url: 'xyz', duration: 1, rating: 111 },
                },
            },
        });

        // create another user and video
        await db.user.create({
            data: {
                email: 'b@c.com',
                ratedVideos: {
                    create: { id: 20, url: 'abc', duration: 2, rating: 222 },
                },
            },
        });

        // updateMany with filter
        const read = await db.ratedVideo.findFirst({ where: { duration: 1 } });
        const r = await db.user.update({
            where: { id: user.id },
            data: {
                ratedVideos: { updateMany: { where: { duration: 1 }, data: { rating: 333 } } },
            },
            include: { ratedVideos: true },
        });
        expect(r).toMatchObject({
            ratedVideos: expect.arrayContaining([expect.objectContaining({ rating: 333 })]),
        });
        expect(r.ratedVideos[0].updatedAt.getTime()).toBeGreaterThan(read.updatedAt.getTime());

        // updateMany without filter
        await expect(
            db.user.update({
                where: { email: 'a@b.com' },
                data: {
                    ratedVideos: { updateMany: { data: { duration: 3 } } },
                },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([expect.objectContaining({ duration: 3 })]),
        });

        // user2's video should not be updated
        await expect(db.ratedVideo.findUnique({ where: { id: 20 } })).resolves.toMatchObject({
            duration: 2,
            rating: 222,
        });
    });

    it('update nested deleteOne', async () => {
        const { db, videoWithOwner: video, user } = await setup();

        // delete with base
        await db.user.update({
            where: { id: user.id },
            data: { assets: { delete: { id: video.id } } },
        });
        await expect(db.asset.findUnique({ where: { id: video.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: video.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.findUnique({ where: { id: video.id } })).resolves.toBeNull();

        // delete with concrete
        let vid = await db.ratedVideo.create({
            data: {
                user: { connect: { id: user.id } },
                owner: { connect: { id: user.id } },
                url: 'xyz',
                duration: 111,
                rating: 222,
            },
        });
        await db.user.update({
            where: { id: user.id },
            data: { ratedVideos: { delete: { id: vid.id } } },
        });
        await expect(db.asset.findUnique({ where: { id: vid.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: vid.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.findUnique({ where: { id: vid.id } })).resolves.toBeNull();

        // delete with mixed filter
        vid = await db.ratedVideo.create({
            data: {
                user: { connect: { id: user.id } },
                owner: { connect: { id: user.id } },
                url: 'xyz',
                duration: 111,
                rating: 222,
            },
        });
        await db.user.update({
            where: { id: user.id },
            data: { ratedVideos: { delete: { id: vid.id, duration: 111 } } },
        });
        await expect(db.asset.findUnique({ where: { id: vid.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: vid.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.findUnique({ where: { id: vid.id } })).resolves.toBeNull();

        // delete not found
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { ratedVideos: { delete: { id: vid.id } } },
            })
        ).toBeNotFound();
    });

    it('update nested deleteMany', async () => {
        const { db, videoWithOwner: video, user } = await setup();

        // delete with base no filter
        await db.user.update({
            where: { id: user.id },
            data: { assets: { deleteMany: {} } },
        });
        await expect(db.asset.findUnique({ where: { id: video.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: video.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.findUnique({ where: { id: video.id } })).resolves.toBeNull();

        // delete with concrete
        let vid1 = await db.ratedVideo.create({
            data: {
                user: { connect: { id: user.id } },
                owner: { connect: { id: user.id } },
                url: 'abc',
                duration: 111,
                rating: 111,
            },
        });
        let vid2 = await db.ratedVideo.create({
            data: {
                user: { connect: { id: user.id } },
                owner: { connect: { id: user.id } },
                url: 'xyz',
                duration: 222,
                rating: 222,
            },
        });
        await db.user.update({
            where: { id: user.id },
            data: { ratedVideos: { deleteMany: { rating: 111 } } },
        });
        await expect(db.asset.findUnique({ where: { id: vid1.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: vid1.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.findUnique({ where: { id: vid1.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: vid2.id } })).toResolveTruthy();
        await db.asset.deleteMany();

        // delete with mixed args
        vid1 = await db.ratedVideo.create({
            data: {
                user: { connect: { id: user.id } },
                owner: { connect: { id: user.id } },
                url: 'abc',
                duration: 111,
                rating: 111,
                viewCount: 111,
            },
        });
        vid2 = await db.ratedVideo.create({
            data: {
                user: { connect: { id: user.id } },
                owner: { connect: { id: user.id } },
                url: 'xyz',
                duration: 222,
                rating: 222,
                viewCount: 222,
            },
        });
        await db.user.update({
            where: { id: user.id },
            data: { ratedVideos: { deleteMany: { url: 'abc', rating: 111, viewCount: 111 } } },
        });
        await expect(db.asset.findUnique({ where: { id: vid1.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: vid1.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.findUnique({ where: { id: vid1.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: vid2.id } })).toResolveTruthy();
        await db.asset.deleteMany();

        // delete not found
        vid1 = await db.ratedVideo.create({
            data: {
                user: { connect: { id: user.id } },
                owner: { connect: { id: user.id } },
                url: 'abc',
                duration: 111,
                rating: 111,
            },
        });
        vid2 = await db.ratedVideo.create({
            data: {
                user: { connect: { id: user.id } },
                owner: { connect: { id: user.id } },
                url: 'xyz',
                duration: 222,
                rating: 222,
            },
        });
        await db.user.update({
            where: { id: user.id },
            data: { ratedVideos: { deleteMany: { url: 'abc', rating: 222 } } },
        });
        await expect(db.asset.count()).resolves.toBe(2);
    });

    it('update nested relation manipulation', async () => {
        const { db, videoWithOwner: video, user } = await setup();

        // connect, disconnect with base
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { assets: { disconnect: { id: video.id } } },
                include: { assets: true },
            })
        ).resolves.toMatchObject({
            assets: expect.arrayContaining([]),
        });
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { assets: { connect: { id: video.id } } },
                include: { assets: true },
            })
        ).resolves.toMatchObject({
            assets: expect.arrayContaining([expect.objectContaining({ id: video.id })]),
        });

        /// connect, disconnect with concrete

        let vid1 = await db.ratedVideo.create({
            data: {
                url: 'abc',
                duration: 111,
                rating: 111,
            },
        });
        let vid2 = await db.ratedVideo.create({
            data: {
                url: 'xyz',
                duration: 222,
                rating: 222,
            },
        });

        // connect not found
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { ratedVideos: { connect: [{ id: vid2.id + 1 }] } },
                include: { ratedVideos: true },
            })
        ).toBeRejectedWithCode(PrismaErrorCode.REQUIRED_CONNECTED_RECORD_NOT_FOUND);

        // connect found
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { ratedVideos: { connect: [{ id: vid1.id, duration: vid1.duration, rating: vid1.rating }] } },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([expect.objectContaining({ id: vid1.id })]),
        });

        // connectOrCreate
        await expect(
            db.user.update({
                where: { id: user.id },
                data: {
                    ratedVideos: {
                        connectOrCreate: [
                            {
                                where: { id: vid2.id, duration: 333 },
                                create: {
                                    url: 'xyz',
                                    duration: 333,
                                    rating: 333,
                                },
                            },
                        ],
                    },
                },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([expect.objectContaining({ duration: 333 })]),
        });

        // disconnect not found
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { ratedVideos: { disconnect: [{ id: vid2.id }] } },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([expect.objectContaining({ id: vid1.id })]),
        });

        // disconnect found
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { ratedVideos: { disconnect: [{ id: vid1.id, duration: vid1.duration, rating: vid1.rating }] } },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([]),
        });

        // set
        await expect(
            db.user.update({
                where: { id: user.id },
                data: {
                    ratedVideos: {
                        set: [
                            { id: vid1.id, viewCount: vid1.viewCount },
                            { id: vid2.id, viewCount: vid2.viewCount },
                        ],
                    },
                },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([
                expect.objectContaining({ id: vid1.id }),
                expect.objectContaining({ id: vid2.id }),
            ]),
        });
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { ratedVideos: { set: [] } },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([]),
        });
        await expect(
            db.user.update({
                where: { id: user.id },
                data: {
                    ratedVideos: {
                        set: { id: vid1.id, viewCount: vid1.viewCount },
                    },
                },
                include: { ratedVideos: true },
            })
        ).resolves.toMatchObject({
            ratedVideos: expect.arrayContaining([expect.objectContaining({ id: vid1.id })]),
        });
    });

    it('updateMany', async () => {
        const { db, videoWithOwner: video, user } = await setup();
        const otherVideo = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 10000, duration: 10000, url: 'xyz', rating: 10000 },
        });

        // update only the current level
        await expect(
            db.ratedVideo.updateMany({
                where: { rating: video.rating, viewCount: video.viewCount },
                data: { rating: 100 },
            })
        ).resolves.toMatchObject({ count: 1 });
        let read = await db.ratedVideo.findUnique({ where: { id: video.id } });
        expect(read).toMatchObject({ rating: 100 });

        // update with concrete
        await expect(
            db.ratedVideo.updateMany({
                where: { id: video.id },
                data: { viewCount: 1, duration: 11, rating: 101 },
            })
        ).resolves.toMatchObject({ count: 1 });
        read = await db.ratedVideo.findUnique({ where: { id: video.id } });
        expect(read).toMatchObject({ viewCount: 1, duration: 11, rating: 101 });

        // update with base
        await db.video.updateMany({
            where: { viewCount: 1, duration: 11 },
            data: { viewCount: 2, duration: 12 },
        });
        read = await db.ratedVideo.findUnique({ where: { id: video.id } });
        expect(read).toMatchObject({ viewCount: 2, duration: 12 });

        // update with base
        await db.asset.updateMany({
            where: { viewCount: 2 },
            data: { viewCount: 3 },
        });
        read = await db.ratedVideo.findUnique({ where: { id: video.id } });
        expect(read.viewCount).toBe(3);

        // the other video is unchanged
        await expect(await db.ratedVideo.findUnique({ where: { id: otherVideo.id } })).toMatchObject(otherVideo);

        // update with concrete no where
        await expect(
            db.ratedVideo.updateMany({
                data: { viewCount: 111, duration: 111, rating: 111 },
            })
        ).resolves.toMatchObject({ count: 2 });
        await expect(db.ratedVideo.findUnique({ where: { id: video.id } })).resolves.toMatchObject({ duration: 111 });
        await expect(db.ratedVideo.findUnique({ where: { id: otherVideo.id } })).resolves.toMatchObject({
            duration: 111,
        });

        // set discriminator
        await expect(db.ratedVideo.updateMany({ data: { assetType: 'Image' } })).rejects.toThrow('is a discriminator');
        await expect(db.ratedVideo.updateMany({ data: { videoType: 'RatedVideo' } })).rejects.toThrow(
            'is a discriminator'
        );
    });

    it('upsert', async () => {
        const { db, videoWithOwner: video, user } = await setup();

        await expect(
            db.asset.upsert({
                where: { id: video.id },
                create: { id: video.id, viewCount: 1 },
                update: { viewCount: 2 },
            })
        ).rejects.toThrow('is a delegate');

        // update
        const read = await db.ratedVideo.findUnique({ where: { id: video.id } });
        const r = await db.ratedVideo.upsert({
            where: { id: video.id },
            create: {
                viewCount: 1,
                duration: 300,
                url: 'xyz',
                rating: 100,
                owner: { connect: { id: user.id } },
            },
            update: { duration: 200 },
        });
        expect(r).toMatchObject({
            id: video.id,
            duration: 200,
        });
        expect(r.updatedAt.getTime()).toBeGreaterThan(read.updatedAt.getTime());

        // create
        const created = await db.ratedVideo.upsert({
            where: { id: video.id + 1 },
            create: { viewCount: 1, duration: 300, url: 'xyz', rating: 100, owner: { connect: { id: user.id } } },
            update: { duration: 200 },
        });
        expect(created.id).not.toEqual(video.id);
        expect(created.duration).toBe(300);
    });

    it('delete simple', async () => {
        let { db, user, video: ratedVideo } = await setup();

        let deleted = await db.ratedVideo.delete({
            where: { id: ratedVideo.id },
            select: { rating: true, owner: true },
        });
        expect(deleted).toMatchObject({ rating: 100 });
        expect(deleted.owner).toMatchObject(user);
        await expect(db.ratedVideo.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();

        // delete with base
        ratedVideo = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        const video = await db.video.findUnique({ where: { id: ratedVideo.id } });
        deleted = await db.video.delete({ where: { id: ratedVideo.id }, include: { owner: true } });
        expect(deleted).toMatchObject(video);
        expect(deleted.owner).toMatchObject(user);
        await expect(db.ratedVideo.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();

        // delete with concrete
        ratedVideo = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        let asset = await db.asset.findUnique({ where: { id: ratedVideo.id } });
        deleted = await db.video.delete({ where: { id: ratedVideo.id }, include: { owner: true } });
        expect(deleted).toMatchObject(asset);
        expect(deleted.owner).toMatchObject(user);
        await expect(db.ratedVideo.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();

        // delete with combined condition
        ratedVideo = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        asset = await db.asset.findUnique({ where: { id: ratedVideo.id } });
        deleted = await db.video.delete({ where: { id: ratedVideo.id, viewCount: 1 } });
        expect(deleted).toMatchObject(asset);
        await expect(db.ratedVideo.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
    });

    it('delete cascade', async () => {
        const { prisma, enhance } = await loadSchema(
            `
    model Base {
        id Int @id @default(autoincrement())
        type String
        @@delegate(type)
    }

    model List extends Base {
        name String
        items Item[]
    }

    model Item extends Base {
        name String
        list List @relation(fields: [listId], references: [id], onDelete: Cascade)
        listId Int
        content ItemContent?
    }

    model ItemContent extends Base {
        name String
        item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)
        itemId Int @unique
    }
`,
            { enhancements: ['delegate'], logPrismaQuery: true }
        );

        const db = enhance();
        await db.list.create({
            data: {
                id: 1,
                name: 'list',
                items: {
                    create: [{ id: 2, name: 'item1', content: { create: { id: 3, name: 'content1' } } }],
                },
            },
        });

        const r = await db.list.delete({ where: { id: 1 }, include: { items: { include: { content: true } } } });
        expect(r).toMatchObject({ items: [{ id: 2 }] });
        await expect(db.item.findUnique({ where: { id: 2 } })).toResolveNull();
        await expect(prisma.base.findUnique({ where: { id: 2 } })).toResolveNull();
        await expect(db.itemContent.findUnique({ where: { id: 3 } })).toResolveNull();
        await expect(prisma.base.findUnique({ where: { id: 3 } })).toResolveNull();
    });

    it('deleteMany', async () => {
        const { enhance } = await loadSchema(schema, { enhancements: ['delegate'] });
        const db = enhance();

        const user = await db.user.create({ data: { id: 1 } });

        // no where
        let video1 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        let video2 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        await expect(db.ratedVideo.deleteMany()).resolves.toMatchObject({ count: 2 });
        await expect(db.ratedVideo.findUnique({ where: { id: video1.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: video1.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: video1.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.findUnique({ where: { id: video2.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: video2.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: video2.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.count()).resolves.toBe(0);

        // with base
        video1 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'abc', rating: 100 },
        });
        video2 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 2, duration: 200, url: 'xyz', rating: 200 },
        });
        await expect(db.asset.deleteMany({ where: { viewCount: 1 } })).resolves.toMatchObject({ count: 1 });
        await expect(db.asset.count()).resolves.toBe(1);
        await db.asset.deleteMany();

        // where current level
        video1 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'abc', rating: 100 },
        });
        video2 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 2, duration: 200, url: 'xyz', rating: 200 },
        });
        await expect(db.ratedVideo.deleteMany({ where: { rating: 100 } })).resolves.toMatchObject({ count: 1 });
        await expect(db.ratedVideo.count()).resolves.toBe(1);
        await db.ratedVideo.deleteMany();

        // where mixed with base level
        video1 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'abc', rating: 100 },
        });
        video2 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 2, duration: 200, url: 'xyz', rating: 200 },
        });
        await expect(db.ratedVideo.deleteMany({ where: { viewCount: 1, duration: 100 } })).resolves.toMatchObject({
            count: 1,
        });
        await expect(db.ratedVideo.count()).resolves.toBe(1);
        await db.ratedVideo.deleteMany();

        // delete not found
        video1 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'abc', rating: 100 },
        });
        video2 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 2, duration: 200, url: 'xyz', rating: 200 },
        });
        await expect(db.ratedVideo.deleteMany({ where: { viewCount: 2, duration: 100 } })).resolves.toMatchObject({
            count: 0,
        });
        await expect(db.ratedVideo.count()).resolves.toBe(2);
    });

    it('aggregate', async () => {
        const { db } = await setup();

        const aggregate = await db.ratedVideo.aggregate({
            _count: true,
            _sum: { rating: true },
            where: { viewCount: { gt: 0 }, rating: { gt: 10 } },
            orderBy: {
                duration: 'desc',
            },
        });
        expect(aggregate).toMatchObject({ _count: 1, _sum: { rating: 100 } });

        expect(() => db.ratedVideo.aggregate({ _count: true, _sum: { rating: true, viewCount: true } })).toThrow(
            'aggregate with fields from base type is not supported yet'
        );
    });

    it('count', async () => {
        const { db } = await setup();

        let count = await db.ratedVideo.count();
        expect(count).toBe(1);

        count = await db.ratedVideo.count({
            select: { _all: true, rating: true },
            where: { viewCount: { gt: 0 }, rating: { gt: 10 } },
        });
        expect(count).toMatchObject({ _all: 1, rating: 1 });

        count = await db.ratedVideo.count({
            select: { _all: true, rating: true },
            where: { AND: { viewCount: { gt: 0 }, rating: { gt: 10 } } },
        });
        expect(count).toMatchObject({ _all: 1, rating: 1 });

        count = await db.ratedVideo.count({
            select: { _all: true, rating: true },
            where: { AND: [{ viewCount: { gt: 0 }, rating: { gt: 10 } }] },
        });
        expect(count).toMatchObject({ _all: 1, rating: 1 });

        expect(() => db.ratedVideo.count({ select: { rating: true, viewCount: true } })).toThrow(
            'count with fields from base type is not supported yet'
        );
    });

    it('groupBy', async () => {
        const { db, video } = await setup();

        let group = await db.ratedVideo.groupBy({ by: ['rating'] });
        expect(group).toHaveLength(1);
        expect(group[0]).toMatchObject({ rating: video.rating });

        group = await db.ratedVideo.groupBy({
            by: ['id', 'rating'],
            where: { viewCount: { gt: 0 }, rating: { gt: 10 } },
        });
        expect(group).toHaveLength(1);
        expect(group[0]).toMatchObject({ id: video.id, rating: video.rating });

        group = await db.ratedVideo.groupBy({
            by: ['id'],
            _sum: { rating: true },
        });
        expect(group).toHaveLength(1);
        expect(group[0]).toMatchObject({ id: video.id, _sum: { rating: video.rating } });

        group = await db.ratedVideo.groupBy({
            by: ['id'],
            _sum: { rating: true },
            having: { rating: { _sum: { gt: video.rating } } },
        });
        expect(group).toHaveLength(0);

        expect(() => db.ratedVideo.groupBy({ by: 'viewCount' })).toThrow(
            'groupBy with fields from base type is not supported yet'
        );
        expect(() => db.ratedVideo.groupBy({ having: { rating: { gt: 0 }, viewCount: { gt: 0 } } })).toThrow(
            'groupBy with fields from base type is not supported yet'
        );
    });

    it('many to many', async () => {
        const { enhance } = await loadSchema(POLYMORPHIC_MANY_TO_MANY_SCHEMA);
        const db = enhance();

        const video = await db.video.create({ data: { viewCount: 1, duration: 100 } });
        const image = await db.image.create({ data: { viewCount: 2, format: 'png' } });

        await expect(
            db.user.create({
                data: {
                    id: 1,
                    level: 10,
                    assets: {
                        connect: [{ id: video.id }, { id: image.id }],
                    },
                },
                include: { assets: true },
            })
        ).resolves.toMatchObject({
            id: 1,
            level: 10,
            assets: expect.arrayContaining([video, image]),
        });

        await expect(db.user.findUnique({ where: { id: 1 }, include: { assets: true } })).resolves.toMatchObject({
            id: 1,
            assets: expect.arrayContaining([video, image]),
        });
        await expect(db.asset.findUnique({ where: { id: video.id }, include: { users: true } })).resolves.toMatchObject(
            {
                id: video.id,
                users: expect.arrayContaining([{ id: 1, level: 10 }]),
            }
        );
    });

    it('handles very long concrete model name', async () => {
        const { db, user } = await setup();

        await db.veryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryLongModelNameA.create({
            data: {
                owner: { connect: { id: user.id } },
                duration: 62,
                url: 'https://whatever.com/example.mp4',
                propA: 'propA',
            },
        });

        await db.veryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryLongModelNameB.create({
            data: {
                owner: { connect: { id: user.id } },
                duration: 62,
                url: 'https://whatever.com/example.mp4',
                propB: 'propB',
            },
        });

        const foundUser = await db.user.findFirst({
            where: { id: user.id },
            include: {
                assets: true,
            },
        });

        expect(foundUser).toEqual(
            expect.objectContaining({
                assets: expect.arrayContaining([
                    expect.objectContaining({
                        videoType: 'VeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryLongModelNameA',
                        propA: 'propA',
                    }),
                    expect.objectContaining({
                        videoType: 'VeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryLongModelNameB',
                        propB: 'propB',
                    }),
                ]),
            })
        );
    });

    it('typescript compilation plain prisma', async () => {
        const src = `
        import { PrismaClient } from '@prisma/client';
        import { enhance } from '.zenstack/enhance';
        
        const prisma = new PrismaClient();
        
        async function main() {
            const db = enhance(prisma);
        
            const user1 = await db.user.create({ data: { } });
        
            await db.ratedVideo.create({
                data: {
                    owner: { connect: { id: user1.id } },
                    duration: 100,
                    url: 'abc',
                    rating: 10,
                },
            });
        
            await db.image.create({
                data: {
                    owner: { connect: { id: user1.id } },
                    format: 'webp',
                },
            });
        
            const video = await db.video.findFirst({ include: { owner: true } });
            console.log(video?.duration);
            console.log(video?.viewCount);
        
            const asset = await db.asset.findFirstOrThrow();
            console.log(asset.assetType);
            console.log(asset.viewCount);
        
            if (asset.assetType === 'Video') {
                console.log('Video: duration', asset.duration);
            } else {
                console.log('Image: format', asset.format);
            }
        }
        
        main();     
        `;
        await loadSchema(schema, {
            compile: true,
            enhancements: ['delegate'],
            extraSourceFiles: [
                {
                    name: 'main.ts',
                    content: src,
                },
            ],
        });
    });

    it('typescript compilation extended prisma', async () => {
        const src = `
        import { PrismaClient } from '@prisma/client';
        import { enhance } from '.zenstack/enhance';
        
        const prisma = new PrismaClient().$extends({
            model: {
                user: {
                    async signUp() {
                        return prisma.user.create({ data: {} });
                    },
                },
            },
        });
        
        async function main() {
            const db = enhance(prisma);
        
            const user1 = await db.user.signUp();
        
            await db.ratedVideo.create({
                data: {
                    owner: { connect: { id: user1.id } },
                    duration: 100,
                    url: 'abc',
                    rating: 10,
                },
            });
        
            await db.image.create({
                data: {
                    owner: { connect: { id: user1.id } },
                    format: 'webp',
                },
            });
        
            const video = await db.video.findFirst({ include: { owner: true } });
            console.log(video?.duration);
            console.log(video?.viewCount);
        
            const asset = await db.asset.findFirstOrThrow();
            console.log(asset.assetType);
            console.log(asset.viewCount);
        
            if (asset.assetType === 'Video') {
                console.log('Video: duration', asset.duration);
            } else {
                console.log('Image: format', asset.format);
            }
        }
        
        main();     
        `;
        await loadSchema(schema, {
            compile: true,
            enhancements: ['delegate'],
            extraSourceFiles: [
                {
                    name: 'main.ts',
                    content: src,
                },
            ],
        });
    });

    it('merges hierarchy correctly', async () => {
        const { enhance } = await loadSchema(
            `
            model Asset {
              id Int @id @default(autoincrement())
              type String
              viewCount Int
              comments Comment[]
              @@delegate(type)
            }

            model Post extends Asset {
              title String
            }
            
            model Comment {
              id Int @id @default(autoincrement())
              type String
              asset Asset @relation(fields: [assetId], references: [id])
              assetId Int
              moderated Boolean
              @@delegate(type)
            }

            model TextComment extends Comment {
              text String
            }
        `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        const post = await db.post.create({ data: { title: 'Post1', viewCount: 1 } });
        const comment = await db.textComment.create({
            data: { text: 'Comment1', moderated: true, asset: { connect: { id: post.id } } },
        });

        // delegate include delegate
        let r = await db.asset.findFirst({ include: { comments: true } });
        expect(r).toMatchObject({ viewCount: 1, comments: [comment] });

        // concrete include delegate
        r = await db.post.findFirst({ include: { comments: true } });
        expect(r).toMatchObject({ ...post, comments: [comment] });
    });

    it('works with one-to-one self relation', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id          Int     @id @default(autoincrement())
                successorId Int?    @unique
                successor   User?   @relation("BlogOwnerHistory", fields: [successorId], references: [id])
                predecessor User?   @relation("BlogOwnerHistory")
                type        String
                @@delegate(type)
            }

            model Person extends User {
            }

            model Organization extends User {
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        const u1 = await db.person.create({ data: {} });
        const u2 = await db.organization.create({
            data: { predecessor: { connect: { id: u1.id } } },
            include: { predecessor: true },
        });
        expect(u2).toMatchObject({ id: u2.id, predecessor: { id: u1.id } });
        const foundP1 = await db.person.findUnique({ where: { id: u1.id }, include: { successor: true } });
        expect(foundP1).toMatchObject({ id: u1.id, successor: { id: u2.id } });
    });

    it('works with one-to-many self relation', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id        Int     @id @default(autoincrement())
                name      String?
                parentId  Int?
                parent    User?   @relation("ParentChild", fields: [parentId], references: [id])
                children  User[]  @relation("ParentChild")
                type      String
                @@delegate(type)
            }

            model Person extends User {
            }

            model Organization extends User {
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        const u1 = await db.person.create({ data: {} });
        const u2 = await db.organization.create({
            data: { parent: { connect: { id: u1.id } } },
            include: { parent: true },
        });
        expect(u2).toMatchObject({ id: u2.id, parent: { id: u1.id } });
        const foundP1 = await db.person.findUnique({ where: { id: u1.id }, include: { children: true } });
        expect(foundP1).toMatchObject({ id: u1.id, children: [{ id: u2.id }] });
    });

    it('works with many-to-many self relation', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id        Int     @id @default(autoincrement())
                name      String?
                followedBy User[] @relation("UserFollows")
                following  User[] @relation("UserFollows")
                type      String
                @@delegate(type)
            }

            model Person extends User {
            }

            model Organization extends User {
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        const u1 = await db.person.create({ data: {} });
        const u2 = await db.organization.create({
            data: { following: { connect: { id: u1.id } } },
            include: { following: true },
        });
        expect(u2).toMatchObject({ id: u2.id, following: [{ id: u1.id }] });
        const foundP1 = await db.person.findUnique({ where: { id: u1.id }, include: { followedBy: true } });
        expect(foundP1).toMatchObject({ id: u1.id, followedBy: [{ id: u2.id }] });
    });
});
