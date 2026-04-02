import { ZenStackClient } from '@zenstackhq/orm';
import SQLite from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import { schema } from './schema';

const client = new ZenStackClient(schema, {
    dialect: new SqliteDialect({ database: new SQLite('./zenstack/test.db') }),
});

async function find() {
    // delegate find should result in a discriminated union type
    const r = await client.asset.findFirstOrThrow();
    console.log(r.assetType);
    console.log(r.viewCount);
    // @ts-expect-error
    console.log(r.duration);
    // @ts-expect-error
    console.log(r.rating);

    // TODO: discriminated sub-model fields
    // if (r.assetType === 'Video') {
    //     // video
    //     console.log(r.duration);
    //     // only one choice `RatedVideo`
    //     console.log(r.rating);
    // } else {
    //     // image
    //     console.log(r.format);
    // }

    // if fields are explicitly selected, then no sub-model fields are available
    const r1 = await client.asset.findFirstOrThrow({
        select: {
            id: true,
            viewCount: true,
            assetType: true,
        },
    });
    // @ts-expect-error
    console.log(r1.duration);
    if (r1.assetType === 'Video') {
        // @ts-expect-error
        console.log(r1.duration);
    }

    // same behavior when queried as a relation
    const r2 = await client.user.findFirstOrThrow({ include: { assets: true } });
    console.log(r2.assets[0]?.assetType);
    console.log(r2.assets[0]?.viewCount);
    // @ts-expect-error
    console.log(r2.assets[0]?.duration);
    // @ts-expect-error
    console.log(r2.assets[0]?.rating);

    // TODO: discriminated sub-model fields
    // if (r2.assets[0]?.assetType === 'Video') {
    //     // video
    //     console.log(r2.assets[0]?.duration);
    //     // only one choice `RatedVideo`
    //     console.log(r2.assets[0]?.rating);
    // } else {
    //     // image
    //     console.log(r2.assets[0]?.format);
    // }

    // sub model behavior
    const r3 = await client.ratedVideo.findFirstOrThrow();
    console.log(r3.assetType);
    console.log(r3.viewCount);
    console.log(r3.videoType);
    console.log(r3.duration);
    console.log(r3.rating);
}

async function create() {
    // delegate creation is not allowed
    // @ts-expect-error
    client.asset.create({ data: { assetType: 'Video' } });
    // @ts-expect-error
    client.asset.createMany({ data: [{ assetType: 'Video' }] });
    // @ts-expect-error
    client.asset.upsert({ where: { id: 1 }, create: { assetType: 'Video' }, update: { assetType: 'Video' } });

    // nested creation is not allowed either
    // @ts-expect-error
    client.user.create({ data: { assets: { create: { assetType: 'Video' } } } });
    // @ts-expect-error
    client.user.create({ data: { assets: { connectOrCreate: { where: { id: 1 }, create: { assetType: 'Video' } } } } });
    // @ts-expect-error
    client.user.update({ where: { id: 1 }, data: { assets: { create: { assetType: 'Video' } } } });
    client.user.update({
        where: { id: 1 },
        // @ts-expect-error
        data: { assets: { connectOrCreate: { where: { id: 1 }, create: { assetType: 'Video' } } } },
    });
    client.user.update({
        where: { id: 1 },
        data: {
            // @ts-expect-error
            assets: { upsert: { where: { id: 1 }, create: { assetType: 'Video' }, update: { assetType: 'Video' } } },
        },
    });

    // discriminator fields cannot be assigned in create
    await client.ratedVideo.create({
        data: {
            url: 'abc',
            rating: 5,
            duration: 100,
            // @ts-expect-error
            assetType: 'Video',
        },
    });
}

async function update() {
    // delegate models can be updated normally
    await client.ratedVideo.update({
        where: { id: 1 },
        data: { url: 'new-url', rating: 4, duration: 200 },
    });

    await client.video.update({
        where: { id: 1 },
        data: { duration: 300, url: 'another-url' },
    });

    // discriminator fields cannot be set in updates
    await client.ratedVideo.update({
        where: { id: 1 },
        data: {
            url: 'valid-update',
            // @ts-expect-error
            assetType: 'Video',
        },
    });

    await client.image.update({
        where: { id: 1 },
        data: {
            format: 'jpg',
            // @ts-expect-error
            assetType: 'Image',
        },
    });

    // updateMany also cannot set discriminator fields
    await client.ratedVideo.updateMany({
        where: { rating: { gt: 3 } },
        data: {
            // @ts-expect-error
            assetType: 'Video',
        },
    });

    // upsert cannot set discriminator fields in update clause
    await client.ratedVideo.upsert({
        where: { id: 1 },
        create: { url: 'create-url', rating: 5, duration: 100 },
        update: {
            rating: 4,
            // @ts-expect-error
            assetType: 'Video',
        },
    });
}

async function queryBuilder() {
    // query builder API should see the raw table fields

    client.$qb.selectFrom('Asset').select(['id', 'viewCount']).execute();
    // @ts-expect-error
    client.$qb.selectFrom('Asset').select(['duration']).execute();
    client.$qb.selectFrom('Video').select(['id', 'duration']).execute();
    // @ts-expect-error
    client.$qb.selectFrom('Video').select(['viewCount']).execute();
}

async function main() {
    await create();
    await update();
    await find();
    await queryBuilder();
}

main();
