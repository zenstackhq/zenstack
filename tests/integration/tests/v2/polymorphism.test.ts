import { loadSchema } from '@zenstackhq/testtools';

describe('V2 Polymorphism Test', () => {
    const schema = `
    model User {
        id Int @id @default(autoincrement())
        assets Asset[]

        @@allow('all', true)
    }

    model Asset {
        id Int @id @default(autoincrement())
        createdAt DateTime @default(now())
        viewCount Int @default(0)
        owner User @relation(fields: [ownerId], references: [id])
        ownerId Int
        type String
        
        @@delegate(type)
        @@allow('all', true)
    }
    
    model Video extends Asset {
        duration Int
        url String
    }
    `;

    it('create', async () => {
        const { enhance } = await loadSchema(schema, { logPrismaQuery: true });
        const db = enhance();

        await db.user.create({
            data: {
                id: 1,
            },
        });

        const video = await db.video.create({
            data: { owner: { connect: { id: 1 } }, viewCount: 1, duration: 100, url: 'xyz' },
            include: { owner: true },
        });
        expect(video).toMatchObject({
            viewCount: 1,
            duration: 100,
            url: 'xyz',
            type: 'Video',
            owner: expect.objectContaining({ id: 1 }),
        });
    });

    it('read', async () => {
        const { enhance } = await loadSchema(schema, { logPrismaQuery: true });
        const db = enhance();

        await db.user.create({
            data: {
                id: 1,
            },
        });

        const video = await db.video.create({
            data: { owner: { connect: { id: 1 } }, viewCount: 1, duration: 100, url: 'xyz' },
        });

        let found = await db.video.findFirst();
        expect(found).toMatchObject(video);

        found = await db.video.findFirst({ select: { id: true, createdAt: true, url: true } });
        expect(found).toMatchObject({ id: video.id, createdAt: video.createdAt, url: video.url });
    });
});
