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

            const fullDb = enhance(prisma, undefined, { kinds: ['delegate'], logPrismaQuery: true });

            const user = await fullDb.user.create({ data: { id: 1 } });
            const userDb = enhance(
                prisma,
                { user: { id: user.id } },
                { kinds: ['delegate', 'policy'], logPrismaQuery: true }
            );

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
});
