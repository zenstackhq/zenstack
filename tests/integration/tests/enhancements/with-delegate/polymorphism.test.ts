import { loadSchema } from '@zenstackhq/testtools';

describe('V2 Polymorphism Test', () => {
    const schema = `
model User {
    id Int @id @default(autoincrement())
    level Int @default(0)
    assets Asset[]

    @@allow('all', true)
}

model Asset {
    id Int @id @default(autoincrement())
    createdAt DateTime @default(now())
    viewCount Int @default(0)
    owner User @relation(fields: [ownerId], references: [id])
    ownerId Int
    assetType String
    
    @@delegate(assetType)
    @@allow('all', true)
}

model Video extends Asset {
    duration Int
    url String
    videoType String

    @@delegate(videoType)
}

model RatedVideo extends Video {
    rating Int
}

model Image extends Asset {
    format String
}
`;

    async function setup() {
        const { enhance } = await loadSchema(schema, { logPrismaQuery: true, enhancements: ['delegate'] });
        const db = enhance();

        const user = await db.user.create({ data: { id: 1 } });

        const video = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });

        const videoWithOwner = await db.ratedVideo.findUnique({ where: { id: video.id }, include: { owner: true } });

        return { db, video, user, videoWithOwner };
    }

    it('create', async () => {
        const { db, user, videoWithOwner: video } = await setup();

        expect(video).toMatchObject({
            viewCount: 1,
            duration: 100,
            url: 'xyz',
            rating: 100,
            assetType: 'Video',
            videoType: 'RatedVideo',
            owner: user,
        });

        expect(() => db.asset.create({ data: { type: 'Video' } })).toThrow('is a delegate');
        expect(() => db.video.create({ data: { type: 'RatedVideo' } })).toThrow('is a delegate');

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
            id: video.id,
            createdAt: r.createdAt,
            viewCount: r.viewCount,
            url: r.url,
            duration: r.duration,
            assetType: 'Video',
            videoType: 'RatedVideo',
        });
        expect(video.rating).toBeUndefined();
        expect(video.owner).toMatchObject(user);

        const asset = await db.asset.findFirst({ where: { viewCount: r.viewCount }, include: { owner: true } });
        expect(asset).toMatchObject({ id: r.id, createdAt: r.createdAt, assetType: 'Video', viewCount: r.viewCount });
        expect(asset.url).toBeUndefined();
        expect(asset.duration).toBeUndefined();
        expect(asset.rating).toBeUndefined();
        expect(asset.videoType).toBeUndefined();
        expect(asset.owner).toMatchObject(user);

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
        });
        expect(imgAsset.format).toBeUndefined();
        expect(imgAsset.owner).toMatchObject(user);
    });

    it('update', async () => {
        const { db, videoWithOwner: video } = await setup();

        // update with concrete
        let updated = await db.ratedVideo.update({
            where: { id: video.id },
            data: { rating: 200 },
            include: { owner: true },
        });
        expect(updated.rating).toBe(200);
        expect(updated.owner).toBeTruthy();

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

        // update with relation
        updated = await db.asset.update({
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

        // set discriminator
        expect(() => db.ratedVideo.update({ where: { id: video.id }, data: { assetType: 'Image' } })).toThrow(
            'is a discriminator'
        );
        expect(() => db.ratedVideo.update({ where: { id: video.id }, data: { videoType: 'RatedVideo' } })).toThrow(
            'is a discriminator'
        );
    });

    it('delete', async () => {
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

        ratedVideo = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        const asset = await db.asset.findUnique({ where: { id: ratedVideo.id } });
        deleted = await db.video.delete({ where: { id: ratedVideo.id }, include: { owner: true } });
        expect(deleted).toMatchObject(asset);
        expect(deleted.owner).toMatchObject(user);
        await expect(db.ratedVideo.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: ratedVideo.id } })).resolves.toBeNull();
    });

    it('deleteMany', async () => {
        const { enhance } = await loadSchema(schema, { logPrismaQuery: true, enhancements: ['delegate'] });
        const db = enhance();

        const user = await db.user.create({ data: { id: 1 } });

        const video1 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });
        const video2 = await db.ratedVideo.create({
            data: { owner: { connect: { id: user.id } }, viewCount: 1, duration: 100, url: 'xyz', rating: 100 },
        });

        await expect(db.ratedVideo.deleteMany()).resolves.toMatchObject({ count: 2 });
        await expect(db.ratedVideo.findUnique({ where: { id: video1.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: video1.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: video1.id } })).resolves.toBeNull();
        await expect(db.ratedVideo.findUnique({ where: { id: video2.id } })).resolves.toBeNull();
        await expect(db.video.findUnique({ where: { id: video2.id } })).resolves.toBeNull();
        await expect(db.asset.findUnique({ where: { id: video2.id } })).resolves.toBeNull();
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
});
