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

    it('interaction with connect', async () => {
        const schema = `
        model User {
            id Int @id @default(autoincrement())
        }

        model Asset {
            id Int @id @default(autoincrement())
            assetType String
            comments Comment[]
            
            @@delegate(assetType)
            @@allow('all', true)
        }
        
        model Post extends Asset {
            title String
            postType String
            @@delegate(postType)
        }

        model RatedPost extends Post {
            rating Int
        }

        model Comment {
            id Int @id @default(autoincrement())
            content String
            asset Asset? @relation(fields: [assetId], references: [id])
            assetId Int?
            @@allow('read,create', true)
            @@allow('update', auth().id == 1)
        }
        `;

        const { enhance } = await loadSchema(schema);
        const db = enhance();

        const comment1 = await db.comment.create({
            data: { content: 'Comment1' },
        });

        await expect(
            db.ratedPost.create({ data: { title: 'Post1', rating: 5, comments: { connect: { id: comment1.id } } } })
        ).toBeRejectedByPolicy();

        const post1 = await db.ratedPost.create({ data: { title: 'Post1', rating: 5 } });
        await expect(
            db.post.update({ where: { id: post1.id }, data: { comments: { connect: { id: comment1.id } } } })
        ).toBeRejectedByPolicy();
        await expect(
            db.ratedPost.update({ where: { id: post1.id }, data: { comments: { connect: { id: comment1.id } } } })
        ).toBeRejectedByPolicy();

        const user1Db = enhance({ id: 1 });
        await expect(
            user1Db.ratedPost.update({ where: { id: post1.id }, data: { comments: { connect: { id: comment1.id } } } })
        ).toResolveTruthy();
    });

    it('respects base model policies when queried from a sub', async () => {
        const { enhance, prisma } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                assets Asset[]
                @@allow('all', true)
            }

            model Asset {
                id Int @id @default(autoincrement())
                deleted Boolean @default(false)
                user User @relation(fields: [userId], references: [id])
                userId Int
                type String
                @@delegate(type)
                @@allow('all', true)
                @@deny('read', deleted)
            }

            model Post extends Asset {
                title String
            }
        `
        );

        const db = enhance();
        const user = await db.user.create({ data: { id: 1 } });
        const post = await db.post.create({ data: { id: 1, title: 'Post1', userId: user.id } });

        await expect(db.post.findUnique({ where: { id: post.id } })).toResolveTruthy();
        await expect(db.asset.findUnique({ where: { id: post.id } })).toResolveTruthy();
        let withAssets = await db.user.findUnique({ where: { id: user.id }, include: { assets: true } });
        expect(withAssets.assets).toHaveLength(1);

        await prisma.asset.update({ where: { id: post.id }, data: { deleted: true } });
        await expect(db.post.findUnique({ where: { id: post.id } })).toResolveFalsy();
        await expect(db.asset.findUnique({ where: { id: post.id } })).toResolveFalsy();
        withAssets = await db.user.findUnique({ where: { id: user.id }, include: { assets: true } });
        expect(withAssets.assets).toHaveLength(0);

        // unable to read back
        await expect(
            db.post.create({ data: { title: 'Post2', deleted: true, userId: user.id } })
        ).toBeRejectedByPolicy();
        // actually created
        await expect(prisma.post.count()).resolves.toBe(2);

        // unable to read back
        await expect(db.post.update({ where: { id: 2 }, data: { title: 'Post2-1' } })).toBeRejectedByPolicy();
        // actually updated
        await expect(prisma.post.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ title: 'Post2-1' });

        // unable to read back
        await expect(db.post.delete({ where: { id: 2 } })).toBeRejectedByPolicy();
        // actually deleted
        await expect(prisma.post.findUnique({ where: { id: 2 } })).toResolveFalsy();
    });

    it('respects sub model policies when queried from a base: case 1', async () => {
        const { enhance, prisma } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                assets Asset[]
                @@allow('all', true)
            }

            model Asset {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int
                value Int @default(0)
                deleted Boolean @default(false)
                type String
                @@delegate(type)
                @@allow('all', true)
            }

            model Post extends Asset {
                title String
                @@deny('read', deleted)
            }
        `
        );

        const db = enhance();
        const user = await db.user.create({ data: { id: 1 } });

        // create read back
        const post = await db.post.create({ data: { id: 1, title: 'Post1', userId: user.id } });
        expect(post.type).toBe('Post');
        expect(post.title).toBe('Post1');
        expect(post.value).toBe(0);

        // update read back
        const updatedPost = await db.post.update({ where: { id: post.id }, data: { value: 1 } });
        expect(updatedPost.type).toBe('Post');
        expect(updatedPost.title).toBe('Post1');
        expect(updatedPost.value).toBe(1);

        // both asset and post fields are readable
        const readPost = await db.post.findUnique({ where: { id: post.id } });
        expect(readPost.title).toBe('Post1');

        const readAsset = await db.asset.findUnique({ where: { id: post.id } });
        expect(readAsset.type).toBe('Post');
        const userWithAssets = await db.user.findUnique({ where: { id: user.id }, include: { assets: true } });
        expect(userWithAssets.assets[0].title).toBe('Post1');

        await prisma.asset.update({ where: { id: post.id }, data: { deleted: true } });

        // asset fields are readable, but not post fields
        const readAsset1 = await db.asset.findUnique({ where: { id: post.id } });
        expect(readAsset1.type).toBe('Post');
        expect(readAsset1.title).toBeUndefined();

        const userWithAssets1 = await db.user.findUnique({ where: { id: user.id }, include: { assets: true } });
        expect(userWithAssets1.assets[0].type).toBe('Post');
        expect(userWithAssets1.assets[0].title).toBeUndefined();

        // update read back
        const updateRead = await db.asset.update({ where: { id: post.id }, data: { value: 2 } });
        expect(updateRead.value).toBe(2);
        // cannot read back sub model
        expect(updateRead.title).toBeUndefined();

        // delete read back
        const deleteRead = await db.asset.delete({ where: { id: post.id } });
        expect(deleteRead.value).toBe(2);
        // cannot read back sub model
        expect(deleteRead.title).toBeUndefined();
        // actually deleted
        await expect(prisma.asset.findUnique({ where: { id: post.id } })).toResolveFalsy();
        await expect(prisma.post.findUnique({ where: { id: post.id } })).toResolveFalsy();
    });

    it('respects sub model policies when queried from a base: case 2', async () => {
        const { enhance, prisma } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                assets Asset[]
                @@allow('all', true)
            }

            model Asset {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int
                value Int @default(0)
                type String
                @@delegate(type)
                @@allow('all', true)
            }

            model Post extends Asset {
                title String
                deleted Boolean @default(false)
                @@deny('read', deleted)
            }
        `
        );

        const db = enhance();
        const user = await db.user.create({ data: { id: 1 } });

        // create read back
        const post = await db.post.create({ data: { id: 1, title: 'Post1', userId: user.id } });
        expect(post.type).toBe('Post');
        expect(post.title).toBe('Post1');
        expect(post.value).toBe(0);

        // update read back
        const updatedPost = await db.post.update({ where: { id: post.id }, data: { value: 1 } });
        expect(updatedPost.type).toBe('Post');
        expect(updatedPost.title).toBe('Post1');
        expect(updatedPost.value).toBe(1);

        // both asset and post fields are readable
        const readPost = await db.post.findUnique({ where: { id: post.id } });
        expect(readPost.title).toBe('Post1');

        const readAsset = await db.asset.findUnique({ where: { id: post.id } });
        expect(readAsset.type).toBe('Post');
        const userWithAssets = await db.user.findUnique({ where: { id: user.id }, include: { assets: true } });
        expect(userWithAssets.assets[0].title).toBe('Post1');

        await prisma.post.update({ where: { id: post.id }, data: { deleted: true } });

        // asset fields are readable, but not post fields
        const readAsset1 = await db.asset.findUnique({ where: { id: post.id } });
        expect(readAsset1.type).toBe('Post');
        expect(readAsset1.title).toBeUndefined();

        const userWithAssets1 = await db.user.findUnique({ where: { id: user.id }, include: { assets: true } });
        expect(userWithAssets1.assets[0].type).toBe('Post');
        expect(userWithAssets1.assets[0].title).toBeUndefined();

        // update read back
        const updateRead = await db.asset.update({ where: { id: post.id }, data: { value: 2 } });
        expect(updateRead.value).toBe(2);
        // cannot read back sub model
        expect(updateRead.title).toBeUndefined();

        // delete read back
        const deleteRead = await db.asset.delete({ where: { id: post.id } });
        expect(deleteRead.value).toBe(2);
        // cannot read back sub model
        expect(deleteRead.title).toBeUndefined();
        // actually deleted
        await expect(prisma.asset.findUnique({ where: { id: post.id } })).toResolveFalsy();
        await expect(prisma.post.findUnique({ where: { id: post.id } })).toResolveFalsy();
    });

    it('respects sub model policies when queried from a base: case 3', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                assets Asset[]
                @@allow('all', true)
            }

            model Asset {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int
                value Int @default(0)
                type String
                @@delegate(type)
                @@allow('all', value > 0)
            }

            model Post extends Asset {
                title String
                deleted Boolean @default(false)
                @@deny('read', deleted)
            }
        `
        );

        const db = enhance();
        const user = await db.user.create({ data: { id: 1 } });

        // can't create
        await expect(
            db.post.create({ data: { id: 1, title: 'Post1', userId: user.id, value: 0 } })
        ).toBeRejectedByPolicy();

        // can't read back
        await expect(
            db.post.create({ data: { id: 1, title: 'Post1', userId: user.id, value: 1, deleted: true } })
        ).toBeRejectedByPolicy();

        await expect(
            db.post.create({ data: { id: 2, title: 'Post1', userId: user.id, value: 1, deleted: false } })
        ).toResolveTruthy();

        await expect(db.asset.findMany()).resolves.toHaveLength(2);
    });

    it('respects field-level policies', async () => {
        const { enhance } = await loadSchema(`  
            model User {
                id Int @id @default(autoincrement())
            }          

            model Asset {
                id Int @id @default(autoincrement())
                type String
                foo String @allow('read', auth().id == 1)

                @@delegate(type)
                @@allow('all', true)
            }
            
            model Post extends Asset {
                title String
                bar String @deny('read', auth().id != 1)
            }
        `);

        const db = enhance({ id: 1 });
        const post = await db.post.create({ data: { foo: 'foo', bar: 'bar', title: 'Post1' } });
        expect(post.foo).toBeTruthy();
        expect(post.bar).toBeTruthy();

        const foundPost = await db.post.findUnique({ where: { id: post.id } });
        expect(foundPost.foo).toBeTruthy();
        expect(foundPost.bar).toBeTruthy();

        const db2 = enhance({ id: 2 });
        const post2 = await db2.post.create({ data: { foo: 'foo', bar: 'bar', title: 'Post2' } });
        expect(post2.title).toBeTruthy();
        expect(post2.foo).toBeUndefined();
        expect(post2.bar).toBeUndefined();

        const foundPost2 = await db2.post.findUnique({ where: { id: post2.id } });
        expect(foundPost2.foo).toBeUndefined();
        expect(foundPost2.bar).toBeUndefined();
    });
});
