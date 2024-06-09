import { loadSchema } from '@zenstackhq/testtools';

describe('Polymorphic Policy Test', () => {
    it('simple boolean', async () => {
        const booleanCondition = `
        model User {
            id Int @id @default(autoincrement())
            level Int @default(0)
            assets Asset[]
            banned Boolean @default(false)
    
            @@allow('all', true)
        }
    
        model Asset {
            id Int @id @default(autoincrement())
            createdAt DateTime @default(now())
            published Boolean @default(false)
            owner User @relation(fields: [ownerId], references: [id])
            ownerId Int
            assetType String
            viewCount Int @default(0)
            
            @@delegate(assetType)
            @@allow('create', viewCount >= 0)
            @@deny('read', !published)
            @@allow('read', true)
            @@deny('all', owner.banned)
        }
        
        model Video extends Asset {
            watched Boolean @default(false)
            videoType String
    
            @@delegate(videoType)
            @@deny('read', !watched)
            @@allow('read', true)
        }
    
        model RatedVideo extends Video {
            rated Boolean @default(false)
            @@deny('read', !rated)
            @@allow('read', true)
        }
        `;

        const booleanExpression = `
        model User {
            id Int @id @default(autoincrement())
            level Int @default(0)
            assets Asset[]
            banned Boolean @default(false)
    
            @@allow('all', true)
        }
    
        model Asset {
            id Int @id @default(autoincrement())
            createdAt DateTime @default(now())
            published Boolean @default(false)
            owner User @relation(fields: [ownerId], references: [id])
            ownerId Int
            assetType String
            viewCount Int @default(0)
            
            @@delegate(assetType)
            @@allow('create', viewCount >= 0)
            @@deny('read', published == false)
            @@allow('read', true)
            @@deny('all', owner.banned == true)
        }
        
        model Video extends Asset {
            watched Boolean @default(false)
            videoType String
    
            @@delegate(videoType)
            @@deny('read', watched == false)
            @@allow('read', true)
        }
    
        model RatedVideo extends Video {
            rated Boolean @default(false)
            @@deny('read', rated == false)
            @@allow('read', true)
        }
        `;

        for (const schema of [booleanCondition, booleanExpression]) {
            const { enhanceRaw: enhance, prisma } = await loadSchema(schema);

            const fullDb = enhance(prisma, undefined, { kinds: ['delegate'] });

            const user = await fullDb.user.create({ data: { id: 1 } });
            const userDb = enhance(prisma, { user: { id: user.id } }, { kinds: ['delegate', 'policy'] });

            // violating Asset create
            await expect(
                userDb.ratedVideo.create({
                    data: { owner: { connect: { id: user.id } }, viewCount: -1 },
                })
            ).toBeRejectedByPolicy();

            let video = await fullDb.ratedVideo.create({
                data: { owner: { connect: { id: user.id } } },
            });
            // violating all three layer read
            await expect(userDb.asset.findUnique({ where: { id: video.id } })).toResolveNull();
            await expect(userDb.video.findUnique({ where: { id: video.id } })).toResolveNull();
            await expect(userDb.ratedVideo.findUnique({ where: { id: video.id } })).toResolveNull();

            video = await fullDb.ratedVideo.create({
                data: { owner: { connect: { id: user.id } }, published: true },
            });
            // violating Video && RatedVideo read
            await expect(userDb.asset.findUnique({ where: { id: video.id } })).toResolveTruthy();
            await expect(userDb.video.findUnique({ where: { id: video.id } })).toResolveNull();
            await expect(userDb.ratedVideo.findUnique({ where: { id: video.id } })).toResolveNull();

            video = await fullDb.ratedVideo.create({
                data: { owner: { connect: { id: user.id } }, published: true, watched: true },
            });
            // violating RatedVideo read
            await expect(userDb.asset.findUnique({ where: { id: video.id } })).toResolveTruthy();
            await expect(userDb.video.findUnique({ where: { id: video.id } })).toResolveTruthy();
            await expect(userDb.ratedVideo.findUnique({ where: { id: video.id } })).toResolveNull();

            video = await fullDb.ratedVideo.create({
                data: { owner: { connect: { id: user.id } }, rated: true, watched: true, published: true },
            });
            // meeting all read conditions
            await expect(userDb.asset.findUnique({ where: { id: video.id } })).toResolveTruthy();
            await expect(userDb.video.findUnique({ where: { id: video.id } })).toResolveTruthy();
            await expect(userDb.ratedVideo.findUnique({ where: { id: video.id } })).toResolveTruthy();

            // ban the user
            await prisma.user.update({ where: { id: user.id }, data: { banned: true } });

            // banned user can't read
            await expect(userDb.asset.findUnique({ where: { id: video.id } })).toResolveNull();
            await expect(userDb.video.findUnique({ where: { id: video.id } })).toResolveNull();
            await expect(userDb.ratedVideo.findUnique({ where: { id: video.id } })).toResolveNull();

            // banned user can't create
            await expect(
                userDb.ratedVideo.create({
                    data: { owner: { connect: { id: user.id } } },
                })
            ).toBeRejectedByPolicy();
        }
    });

    it('interaction with updateMany/deleteMany', async () => {
        const schema = `
        model User {
            id Int @id @default(autoincrement())
            level Int @default(0)
            assets Asset[]
            banned Boolean @default(false)
    
            @@allow('all', true)
        }
    
        model Asset {
            id Int @id @default(autoincrement())
            createdAt DateTime @default(now())
            published Boolean @default(false)
            owner User @relation(fields: [ownerId], references: [id])
            ownerId Int
            assetType String
            viewCount Int @default(0)
            version Int @default(0)
            
            @@delegate(assetType)
            @@deny('update', viewCount > 0)
            @@deny('delete', viewCount > 0)
            @@allow('all', true)
        }
        
        model Video extends Asset {
            watched Boolean @default(false)

            @@deny('update', watched)
            @@deny('delete', watched)
        }
        `;

        const { enhance } = await loadSchema(schema);
        const db = enhance();

        const user = await db.user.create({ data: { id: 1 } });
        const vid1 = await db.video.create({
            data: { watched: false, viewCount: 0, owner: { connect: { id: user.id } } },
        });
        const vid2 = await db.video.create({
            data: { watched: true, viewCount: 1, owner: { connect: { id: user.id } } },
        });

        await expect(db.asset.updateMany({ data: { version: { increment: 1 } } })).resolves.toMatchObject({
            count: 1,
        });
        await expect(db.asset.findUnique({ where: { id: vid1.id } })).resolves.toMatchObject({ version: 1 });
        await expect(db.asset.findUnique({ where: { id: vid2.id } })).resolves.toMatchObject({ version: 0 });

        await expect(db.asset.deleteMany()).resolves.toMatchObject({
            count: 1,
        });
        await expect(db.asset.findUnique({ where: { id: vid1.id } })).toResolveNull();
        await expect(db.asset.findUnique({ where: { id: vid2.id } })).toResolveTruthy();
    });
});
