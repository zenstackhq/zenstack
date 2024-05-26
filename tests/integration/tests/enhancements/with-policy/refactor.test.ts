import { AuthUser, PrismaErrorCode } from '@zenstackhq/runtime';
import { createPostgresDb, dropPostgresDb, loadSchemaFromFile, type FullDbClientContract } from '@zenstackhq/testtools';
import path from 'path';

const DB_NAME = 'refactor';

describe('With Policy: refactor tests', () => {
    let origDir: string;
    let dbUrl: string;
    let getDb: (user?: AuthUser) => FullDbClientContract;
    let prisma: FullDbClientContract;
    let anonDb: FullDbClientContract;
    let adminDb: FullDbClientContract;
    let user1Db: FullDbClientContract;
    let user2Db: FullDbClientContract;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    beforeEach(async () => {
        dbUrl = await createPostgresDb(DB_NAME);

        const { prisma: _prisma, enhance } = await loadSchemaFromFile(
            path.join(__dirname, '../../schema/refactor-pg.zmodel'),
            {
                provider: 'postgresql',
                dbUrl,
            }
        );
        getDb = enhance;
        prisma = _prisma;
        anonDb = getDb();
        user1Db = getDb({ id: 1 });
        user2Db = getDb({ id: 2 });
        adminDb = getDb({ id: 100, role: 'ADMIN' });
    });

    afterEach(async () => {
        process.chdir(origDir);
        if (prisma) {
            await prisma.$disconnect();
        }
        await dropPostgresDb(DB_NAME);
    });

    it('read', async () => {
        // empty table
        await expect(anonDb.user.findMany()).resolves.toHaveLength(0);
        await expect(anonDb.user.findUnique({ where: { id: 1 } })).toResolveNull();
        await expect(anonDb.user.findUniqueOrThrow({ where: { id: 1 } })).toBeNotFound();
        await expect(anonDb.user.findFirst({ where: { id: 1 } })).toResolveNull();
        await expect(anonDb.user.findFirstOrThrow({ where: { id: 1 } })).toBeNotFound();

        await prisma.user.create({
            data: {
                id: 1,
                email: 'user1@zenstack.dev',
                profile: {
                    create: {
                        name: 'User 1',
                        private: true,
                    },
                },
                posts: {
                    create: [
                        {
                            title: 'Post 1',
                            published: true,
                            comments: { create: { id: 1, authorId: 1, content: 'Comment 1' } },
                        },
                        {
                            title: 'Post 2',
                            published: false,
                            comments: { create: { id: 2, authorId: 1, content: 'Comment 2' } },
                        },
                    ],
                },
            },
        });

        // simple read
        await expect(anonDb.user.findMany()).resolves.toHaveLength(0);
        await expect(adminDb.user.findMany()).resolves.toHaveLength(1);
        await expect(user1Db.user.findMany()).resolves.toHaveLength(1);
        await expect(user2Db.user.findMany()).resolves.toHaveLength(1);
        await expect(anonDb.user.findUnique({ where: { id: 1 } })).toResolveNull();
        await expect(adminDb.user.findUnique({ where: { id: 1 } })).toResolveTruthy();
        await expect(user1Db.user.findUnique({ where: { id: 1 } })).toResolveTruthy();
        await expect(user2Db.user.findUnique({ where: { id: 1 } })).toResolveTruthy();

        // included profile got filtered
        await expect(user1Db.user.findUnique({ include: { profile: true }, where: { id: 1 } })).resolves.toMatchObject({
            email: 'user1@zenstack.dev',
            profile: expect.objectContaining({ name: 'User 1' }),
        });
        await expect(user2Db.user.findUnique({ include: { profile: true }, where: { id: 1 } })).resolves.toMatchObject({
            email: 'user1@zenstack.dev',
            profile: null,
        });

        // filter by profile
        await expect(user1Db.user.findFirst({ where: { profile: { name: 'User 1' } } })).toResolveTruthy();
        await expect(user2Db.user.findFirst({ where: { profile: { name: 'User 1' } } })).toResolveFalsy();

        // include profile cause toplevel user got filtered
        await expect(user1Db.profile.findUnique({ include: { user: true }, where: { userId: 1 } })).toResolveTruthy();
        await expect(user2Db.profile.findUnique({ include: { user: true }, where: { userId: 1 } })).toResolveNull();

        // posts got filtered
        expect((await user1Db.user.findUnique({ include: { posts: true }, where: { id: 1 } })).posts).toHaveLength(2);
        expect((await user2Db.user.findUnique({ include: { posts: true }, where: { id: 1 } })).posts).toHaveLength(1);

        // filter by posts
        await expect(
            user1Db.user.findFirst({
                where: { posts: { some: { title: 'Post 2' } } },
            })
        ).toResolveTruthy();
        await expect(
            user2Db.user.findFirst({
                where: { posts: { some: { title: 'Post 2' } } },
            })
        ).toResolveFalsy();

        // deep filter with comment
        await expect(
            user1Db.user.findFirst({ where: { posts: { some: { comments: { every: { content: 'Comment 2' } } } } } })
        ).toResolveTruthy();
        await expect(
            user2Db.user.findFirst({ where: { posts: { some: { comments: { every: { content: 'Comment 2' } } } } } })
        ).toResolveNull();
    });

    it('create', async () => {
        // validation check
        await expect(
            anonDb.user.create({
                data: { email: 'abcd' },
            })
        ).toBeRejectedByPolicy();

        // read back check
        await expect(
            anonDb.user.create({
                data: { id: 1, email: 'User1@zenstack.dev' },
            })
        ).rejects.toThrow(/not allowed to be read back/);

        // success
        await expect(user1Db.user.findUnique({ where: { id: 1 } })).resolves.toMatchObject({
            // email to lower
            email: 'user1@zenstack.dev',
        });

        // nested creation failure
        await expect(
            anonDb.user.create({
                data: {
                    id: 2,
                    email: 'user2@zenstack.dev',
                    posts: {
                        create: {
                            id: 2,
                            title: 'A very long post title',
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        // check no partial creation
        await expect(adminDb.user.findUnique({ where: { id: 2 } })).toResolveFalsy();

        // deeply nested creation failure
        await expect(
            anonDb.user.create({
                data: {
                    id: 2,
                    email: 'user2@zenstack.dev',
                    posts: {
                        create: {
                            id: 2,
                            title: 'Post 2',
                            comments: {
                                create: {
                                    authorId: 1,
                                    content: 'Comment 2',
                                },
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        // check no partial creation
        await expect(adminDb.user.findUnique({ where: { id: 2 } })).toResolveFalsy();

        // deeply nested creation success
        await expect(
            user2Db.user.create({
                data: {
                    id: 2,
                    email: 'user2@zenstack.dev',
                    posts: {
                        create: {
                            id: 2,
                            title: ' Post 2 ',
                            published: true,
                            comments: {
                                create: {
                                    authorId: 2,
                                    content: 'Comment 2',
                                },
                            },
                        },
                    },
                },
                include: { posts: true },
            })
        ).resolves.toMatchObject({
            posts: expect.arrayContaining([
                // title is trimmed
                expect.objectContaining({ title: 'Post 2' }),
            ]),
        });

        // create with connect: posts
        await expect(
            anonDb.user.create({
                data: {
                    id: 3,
                    email: 'user3@zenstack.dev',
                    posts: {
                        connect: { id: 3 },
                    },
                },
            })
        ).toBeNotFound();
        await adminDb.post.create({
            data: { id: 3, authorId: 1, title: 'Post 3' },
        });
        await expect(
            anonDb.user.create({
                data: {
                    id: 3,
                    email: 'user3@zenstack.dev',
                    posts: {
                        connect: { id: 3 },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            anonDb.user.create({
                data: {
                    id: 3,
                    email: 'user3@zenstack.dev',
                    posts: {
                        connectOrCreate: { where: { id: 3 }, create: { title: 'Post 3' } },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        // success
        await expect(
            adminDb.user.create({
                data: {
                    id: 3,
                    email: 'user3@zenstack.dev',
                    posts: {
                        connect: { id: 3 },
                    },
                },
            })
        ).toResolveTruthy();
        const r = await adminDb.user.create({
            include: { posts: true },
            data: {
                id: 4,
                email: 'user4@zenstack.dev',
                posts: {
                    connectOrCreate: { where: { id: 4 }, create: { title: 'Post 4' } },
                },
            },
        });
        expect(r.posts[0].title).toEqual('Post 4');

        // create with connect: profile
        await expect(
            anonDb.user.create({
                data: {
                    id: 5,
                    email: 'user5@zenstack.dev',
                    profile: {
                        connect: { id: 5 },
                    },
                },
            })
        ).toBeNotFound();
        await adminDb.profile.create({
            data: { id: 5, userId: 1, name: 'User 5' },
        });
        await expect(
            anonDb.user.create({
                data: {
                    id: 5,
                    email: 'user5@zenstack.dev',
                    profile: {
                        connect: { id: 5 },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            anonDb.user.create({
                data: {
                    id: 5,
                    email: 'user5@zenstack.dev',
                    profile: {
                        connectOrCreate: { where: { id: 5 }, create: { name: 'User 5' } },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        // success
        await expect(
            adminDb.user.create({
                data: {
                    id: 5,
                    email: 'user5@zenstack.dev',
                    profile: {
                        connect: { id: 5 },
                    },
                },
            })
        ).toResolveTruthy();
        const r1 = await adminDb.user.create({
            include: { profile: true },
            data: {
                id: 6,
                email: 'user6@zenstack.dev',
                profile: {
                    connectOrCreate: { where: { id: 6 }, create: { name: 'User 6' } },
                },
            },
        });
        expect(r1.profile.name).toEqual('User 6');

        // createMany, policy violation
        await expect(
            anonDb.user.create({
                data: {
                    id: 7,
                    email: 'user7@zenstack.dev',
                    posts: {
                        createMany: {
                            data: [
                                { id: 7, title: 'Post 7.1' },
                                { id: 8, title: 'Post 7.2 very long title' },
                            ],
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        // no partial success
        await expect(adminDb.user.findUnique({ where: { id: 7 } })).toResolveFalsy();

        // createMany, unique constraint violation
        await expect(
            adminDb.user.create({
                data: {
                    id: 7,
                    email: 'user7@zenstack.dev',
                    posts: {
                        createMany: {
                            data: [
                                { id: 7, title: 'Post 7.1' },
                                { id: 7, title: 'Post 7.2' },
                            ],
                        },
                    },
                },
            })
        ).toBeRejectedWithCode(PrismaErrorCode.UNIQUE_CONSTRAINT_FAILED);
        // no partial success
        await expect(adminDb.user.findUnique({ where: { id: 7 } })).toResolveFalsy();

        // createMany, skip duplicates
        await expect(
            adminDb.user.create({
                data: {
                    id: 7,
                    email: 'user7@zenstack.dev',
                    posts: {
                        createMany: {
                            data: [
                                { id: 7, title: 'Post 7.1' },
                                { id: 7, title: 'Post 7.2' },
                                { id: 8, title: ' Post 8 ' },
                            ],
                            skipDuplicates: true,
                        },
                    },
                },
            })
        ).toResolveTruthy();
        // success
        await expect(adminDb.user.findUnique({ where: { id: 7 } })).toResolveTruthy();
        await expect(adminDb.post.findUnique({ where: { id: 7 } })).toResolveTruthy();
        await expect(adminDb.post.findUnique({ where: { id: 8 } })).resolves.toMatchObject({
            // title is trimmed
            title: 'Post 8',
        });
    });

    it('createMany', async () => {
        await prisma.user.create({
            data: { id: 1, email: 'user1@zenstack.dev' },
        });

        // success
        await expect(
            user1Db.post.createMany({
                data: [
                    { id: 1, title: ' Post 1 ', authorId: 1 },
                    { id: 2, title: 'Post 2', authorId: 1 },
                ],
            })
        ).toResolveTruthy();

        await expect(user1Db.post.findMany()).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ title: 'Post 1' }), // title is trimmed
                expect.objectContaining({ title: 'Post 2' }),
            ])
        );

        // unique constraint violation
        await expect(
            user1Db.post.createMany({
                data: [
                    { id: 2, title: 'Post 2', authorId: 1 },
                    { id: 3, title: 'Post 3', authorId: 1 },
                ],
            })
        ).toBeRejectedWithCode(PrismaErrorCode.UNIQUE_CONSTRAINT_FAILED);
        await expect(user1Db.post.findFirst({ where: { id: 3 } })).toResolveNull();

        const r = await prisma.post.findMany();
        console.log('Existing:', JSON.stringify(r));

        // ignore duplicates
        await expect(
            user1Db.post.createMany({
                data: [
                    { id: 2, title: 'Post 2', authorId: 1 },
                    { id: 3, title: 'Post 3', authorId: 1 },
                ],
                skipDuplicates: true,
            })
        ).resolves.toMatchObject({ count: 1 });
        await expect(user1Db.post.findFirst({ where: { id: 3 } })).toResolveTruthy();

        // fail as a transaction
        await expect(
            user1Db.post.createMany({
                data: [
                    { id: 4, title: 'Post 4 very very long', authorId: 1 },
                    { id: 5, title: 'Post 5', authorId: 1 },
                ],
            })
        ).toBeRejectedByPolicy();
        await expect(user1Db.post.findFirst({ where: { id: { in: [4, 5] } } })).toResolveNull();
    });

    it('update single', async () => {
        await prisma.user.create({
            data: {
                id: 2,
                email: 'user2@zenstack.dev',
            },
        });
        await prisma.user.create({
            data: {
                id: 1,
                email: 'user1@zenstack.dev',
                profile: {
                    create: {
                        id: 1,
                        name: 'User 1',
                        private: true,
                    },
                },
                posts: {
                    create: [
                        {
                            id: 1,
                            title: 'Post 1',
                            published: true,
                            comments: { create: { authorId: 1, content: 'Comment 1' } },
                        },
                        {
                            id: 2,
                            title: 'Post 2',
                            published: false,
                            comments: { create: { authorId: 2, content: 'Comment 2' } },
                        },
                    ],
                },
            },
        });

        // top-level
        await expect(anonDb.user.update({ where: { id: 3 }, data: { email: 'user2@zenstack.dev' } })).toBeNotFound();
        await expect(
            anonDb.user.update({ where: { id: 1 }, data: { email: 'user2@zenstack.dev' } })
        ).toBeRejectedByPolicy();
        await expect(
            user2Db.user.update({ where: { id: 1 }, data: { email: 'user2@zenstack.dev' } })
        ).toBeRejectedByPolicy();
        await expect(
            adminDb.user.update({ where: { id: 1 }, data: { email: 'User1-nice@zenstack.dev' } })
        ).resolves.toMatchObject({ email: 'user1-nice@zenstack.dev' });

        // update nested profile
        await expect(
            anonDb.user.update({
                where: { id: 1 },
                data: { profile: { update: { private: false } } },
            })
        ).toBeRejectedByPolicy();
        // variation: with where
        await expect(
            anonDb.user.update({
                where: { id: 1 },
                data: { profile: { update: { where: { private: true }, data: { private: false } } } },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user2Db.user.update({
                where: { id: 1 },
                data: { profile: { update: { private: false } } },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: { profile: { update: { private: false } } },
            })
        ).toResolveTruthy();
        // variation: with where
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: { profile: { update: { where: { private: true }, data: { private: false } } } },
            })
        ).toBeNotFound();
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: { profile: { update: { where: { private: false }, data: { private: true } } } },
            })
        ).toResolveTruthy();

        // update nested posts
        await expect(
            anonDb.user.update({
                where: { id: 1 },
                data: { posts: { update: { where: { id: 1 }, data: { published: false } } } },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user2Db.user.update({
                where: { id: 1 },
                data: { posts: { update: { where: { id: 1 }, data: { published: false } } } },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: { posts: { update: { where: { id: 1 }, data: { title: ' New ', published: false } } } },
                include: { posts: true },
            })
        ).resolves.toMatchObject({ posts: expect.arrayContaining([expect.objectContaining({ title: 'New' })]) });

        // update nested comment prevent update of toplevel
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    email: 'user1-updated@zenstack.dev',
                    posts: {
                        update: {
                            where: { id: 2 },
                            data: {
                                comments: {
                                    update: { where: { id: 2 }, data: { content: 'Comment 2 updated' } },
                                },
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(adminDb.user.findUnique({ where: { email: 'user1-updated@zenstack.dev' } })).toResolveNull();
        await expect(adminDb.comment.findFirst({ where: { content: 'Comment 2 updated' } })).toResolveFalsy();

        // update with create
        const r1 = await user1Db.user.update({
            where: { id: 1 },
            data: {
                posts: {
                    create: {
                        id: 3,
                        title: 'Post 3',
                        published: true,
                        comments: {
                            create: { author: { connect: { id: 1 } }, content: ' Comment 3 ' },
                        },
                    },
                },
            },
            include: { posts: { include: { comments: true } } },
        });
        expect(r1.posts[r1.posts.length - 1].comments[0].content).toEqual('Comment 3');

        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        create: {
                            id: 4,
                            title: 'Post 4',
                            published: false,
                            comments: {
                                create: {
                                    // can't create comment for unpublished post
                                    author: { connect: { id: 1 } },
                                    content: 'Comment 4',
                                },
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(user1Db.post.findUnique({ where: { id: 4 } })).toResolveNull();

        // update with createMany
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        createMany: {
                            data: [
                                { id: 4, title: ' Post 4 ' },
                                { id: 5, title: 'Post 5' },
                            ],
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(user1Db.post.findUnique({ where: { id: 4 } })).resolves.toMatchObject({ title: 'Post 4' });
        await expect(
            user1Db.user.update({
                include: { posts: true },
                where: { id: 1 },
                data: {
                    posts: {
                        createMany: {
                            data: [
                                { id: 5, title: 'Post 5' },
                                { id: 6, title: 'Post 6' },
                            ],
                        },
                    },
                },
            })
        ).toBeRejectedWithCode(PrismaErrorCode.UNIQUE_CONSTRAINT_FAILED);
        const r = await user1Db.user.update({
            include: { posts: true },
            where: { id: 1 },
            data: {
                posts: {
                    createMany: {
                        data: [
                            { id: 5, title: 'Post 5' },
                            { id: 6, title: 'Post 6' },
                        ],
                        skipDuplicates: true,
                    },
                },
            },
        });
        expect(r.posts).toHaveLength(6);

        // update with update
        // profile
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    profile: {
                        update: {
                            name: 'User1 updated',
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    profile: {
                        update: {
                            homepage: 'abc', // fail field validation
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user2Db.user.update({
                where: { id: 1 },
                data: {
                    profile: {
                        update: {
                            name: 'User1 updated again',
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        // post
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        update: {
                            where: { id: 1 },
                            data: { title: ' Post1-1' },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(user1Db.post.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ title: 'Post1-1' });
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        update: {
                            where: { id: 1 },
                            data: { title: 'Post1 very long' }, // fail field validation
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user2Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        update: { where: { id: 1 }, data: { title: 'Post1-2' } },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        // deep post
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        update: {
                            where: { id: 1 },
                            data: { comments: { update: { where: { id: 1 }, data: { content: 'Comment1-1' } } } },
                        },
                    },
                },
            })
        ).toResolveTruthy();

        // update with updateMany
        // blocked by: https://github.com/prisma/prisma/issues/18371
        // await expect(
        //     user1Db.user.update({
        //         where: { id: 1 },
        //         data: { posts: { updateMany: { where: { id: { in: [1, 2, 3] } }, data: { title: 'My Post' } } } },
        //     })
        // ).resolves.toMatchObject({ count: 3 });
        // await expect(
        //     user1Db.user.update({
        //         where: { id: 1 },
        //         data: {
        //             posts: { updateMany: { where: { id: { in: [1, 2, 3] } }, data: { title: 'Very long title' } } },
        //         },
        //     })
        // ).toBeRejectedByPolicy();
        // await expect(
        //     user2Db.user.update({
        //         where: { id: 1 },
        //         data: { posts: { updateMany: { where: { id: { in: [1, 2, 3] } }, data: { title: 'My Post' } } } },
        //     })
        // ).toBeRejectedByPolicy();

        // update with upsert
        // post
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        upsert: {
                            where: { id: 1 },
                            update: { title: ' Post 2' }, // update
                            create: { id: 7, title: 'Post 1' },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(user1Db.post.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ title: 'Post 2' });
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        upsert: {
                            where: { id: 7 },
                            update: { title: 'Post 7-1' },
                            create: { id: 7, title: ' Post 7' }, // create
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(user1Db.post.findUnique({ where: { id: 7 } })).resolves.toMatchObject({ title: 'Post 7' });
        await expect(
            user2Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        upsert: {
                            where: { id: 7 },
                            update: { title: 'Post 7-1' },
                            create: { id: 1, title: 'Post 7' },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: {
                    posts: {
                        upsert: {
                            where: { id: 7 },
                            update: { title: 'Post 7 very long' },
                            create: { title: 'Post 7' },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        // update with connect
        // post
        await expect(
            user1Db.user.update({
                where: { id: 2 },
                data: {
                    posts: {
                        connect: { id: 1 },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(adminDb.post.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ authorId: 2 });
        await expect(
            user2Db.user.update({
                where: { id: 2 },
                data: {
                    posts: {
                        connect: { id: 2 }, // user2 can't update post2
                    },
                },
            })
        ).toBeRejectedByPolicy();
        // profile
        await expect(
            user1Db.user.update({ where: { id: 2 }, data: { profile: { connect: { id: 1 } } } })
        ).toResolveTruthy();
        await expect(adminDb.profile.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ userId: 2 });
        await expect(
            user1Db.user.update({
                where: { id: 1 },
                data: { profile: { connect: { id: 2 } } }, // user1 can't update profile1
            })
        ).toBeRejectedByPolicy();
        // reassign profile1 to user1
        await adminDb.user.update({
            where: { id: 1 },
            data: { profile: { connect: { id: 1 } } },
        });

        // update with connectOrCreate
        await expect(
            user1Db.profile.update({
                where: { id: 1 },
                data: {
                    image: {
                        connectOrCreate: {
                            where: { id: 1 },
                            create: { id: 1, url: 'abc' }, // validation error
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user1Db.profile.update({
                where: { id: 1 },
                data: {
                    image: {
                        connectOrCreate: {
                            where: { id: 1 },
                            create: { id: 1, url: 'http://abc.com/pic.png' }, // create
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(user1Db.image.findUnique({ where: { id: 1 } })).toResolveTruthy();
        await expect(user1Db.profile.findUnique({ include: { image: true }, where: { id: 1 } })).resolves.toMatchObject(
            { id: 1 }
        );
        await expect(
            user1Db.profile.update({
                where: { id: 1 },
                data: {
                    image: {
                        connectOrCreate: {
                            where: { id: 1 },
                            create: { id: 1, url: 'http://abc.com/pic1.png' }, // create
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await prisma.user.update({
            where: { id: 2 },
            data: { profile: { create: { id: 2, name: 'User 2' } } },
        });
        await prisma.image.create({ data: { id: 2, url: 'http://abc.com/pic2.png' } });
        await expect(
            user1Db.profile.update({
                where: { id: 2 },
                data: {
                    image: {
                        // cause update to profile which is not allowed
                        connectOrCreate: { where: { id: 2 }, create: { id: 2, url: 'http://abc.com/pic2-1.png' } },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user2Db.profile.update({
                where: { id: 2 },
                data: {
                    image: {
                        connectOrCreate: {
                            where: { id: 2 }, // connect
                            create: { id: 2, url: 'http://abc.com/pic2-1.png' },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(user2Db.profile.findUnique({ include: { image: true }, where: { id: 2 } })).resolves.toMatchObject(
            {
                image: { url: 'http://abc.com/pic2.png' },
            }
        );

        // update with disconnect
        await expect(
            user1Db.profile.update({
                where: { id: 2 },
                data: { image: { disconnect: true } },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user2Db.profile.update({
                where: { id: 2 },
                data: { image: { disconnect: true } },
            })
        ).toResolveTruthy();
        await expect(user2Db.profile.findUnique({ include: { image: true }, where: { id: 2 } })).resolves.toMatchObject(
            { image: null }
        );

        // update with set
        await prisma.image.create({ data: { id: 3, url: 'http://abc.com/pic3.png' } });
        await prisma.image.create({ data: { id: 4, url: 'http://abc.com/pic4.png' } });
        await prisma.image.create({ data: { id: 5, url: 'http://abc.com/pic5.png' } });
        await prisma.image.create({ data: { id: 6, url: 'http://abc.com/pic6.png' } });

        await expect(
            user1Db.comment.update({
                where: { id: 1 },
                data: {
                    images: { set: [{ id: 3 }, { id: 4 }] },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            adminDb.comment.update({
                where: { id: 1 },
                data: {
                    images: { set: [{ id: 3 }, { id: 4 }] },
                },
            })
        ).toResolveTruthy();
        await expect(adminDb.image.findUnique({ where: { id: 3 } })).resolves.toMatchObject({ commentId: 1 });
        await expect(adminDb.image.findUnique({ where: { id: 4 } })).resolves.toMatchObject({ commentId: 1 });
        await expect(
            adminDb.comment.update({
                where: { id: 1 },
                data: {
                    images: { set: [{ id: 5 }, { id: 6 }] },
                },
            })
        ).toResolveTruthy();
        await expect(adminDb.image.findUnique({ where: { id: 3 } })).resolves.toMatchObject({ commentId: null });
        await expect(adminDb.image.findUnique({ where: { id: 4 } })).resolves.toMatchObject({ commentId: null });
        await expect(adminDb.image.findUnique({ where: { id: 5 } })).resolves.toMatchObject({ commentId: 1 });
        await expect(adminDb.image.findUnique({ where: { id: 6 } })).resolves.toMatchObject({ commentId: 1 });

        // update with delete
        await expect(
            user1Db.comment.update({
                where: { id: 1 },
                data: {
                    images: { delete: [{ id: 5 }, { id: 6 }] },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            adminDb.comment.update({
                where: { id: 1 },
                data: {
                    images: { delete: [{ id: 5 }, { id: 6 }] },
                },
            })
        ).toResolveTruthy();
        await expect(adminDb.image.findUnique({ where: { id: 5 } })).toResolveNull();
        await expect(adminDb.image.findUnique({ where: { id: 6 } })).toResolveNull();

        // update with deleteMany
        await prisma.comment.update({
            where: { id: 1 },
            data: {
                images: { set: [{ id: 3 }, { id: 4 }] },
            },
        });
        await expect(
            user1Db.comment.update({
                where: { id: 1 },
                data: { images: { deleteMany: { url: { contains: 'pic3' } } } },
            })
        ).toBeRejectedByPolicy();
        await expect(
            adminDb.comment.update({
                where: { id: 1 },
                data: { images: { deleteMany: { url: { contains: 'pic3' } } } },
            })
        ).toResolveTruthy();
        await expect(adminDb.image.findUnique({ where: { id: 3 } })).toResolveNull();
    });

    it('updateMany', async () => {
        await prisma.user.create({
            data: {
                id: 1,
                email: 'user1@zenstack.dev',
                profile: {
                    create: { id: 1, name: 'User 1', private: true },
                },
                posts: {
                    create: [
                        { id: 1, title: 'Post 1' },
                        { id: 2, title: 'Post 2' },
                    ],
                },
            },
        });
        await expect(
            user2Db.post.updateMany({
                data: { title: 'My post' },
            })
        ).resolves.toMatchObject({ count: 0 });
        await expect(
            user1Db.post.updateMany({
                data: { title: 'My long long post' },
            })
        ).toBeRejectedByPolicy();
        await expect(
            user1Db.post.updateMany({
                data: { title: ' My post' },
            })
        ).resolves.toMatchObject({ count: 2 });
        await expect(user1Db.post.findFirst()).resolves.toMatchObject({ title: 'My post' });
    });

    it('delete single', async () => {
        await prisma.user.create({
            data: {
                id: 1,
                email: 'user1@zenstack.dev',
                profile: {
                    create: { id: 1, name: 'User 1', private: true },
                },
                posts: {
                    create: [
                        { id: 1, title: 'Post 1', published: true },
                        { id: 2, title: 'Post 2', published: false },
                    ],
                },
            },
        });

        await expect(user2Db.post.delete({ where: { id: 1 } })).toBeRejectedByPolicy();
        await expect(user1Db.post.delete({ where: { id: 1 } })).toResolveTruthy();
    });

    it('deleteMany', async () => {
        await prisma.user.create({
            data: {
                id: 1,
                email: 'user1@zenstack.dev',
                profile: {
                    create: { id: 1, name: 'User 1', private: true },
                },
                posts: {
                    create: [
                        { id: 1, title: 'Post 1', published: true },
                        { id: 2, title: 'Post 2', published: false },
                    ],
                },
            },
        });

        await expect(user2Db.post.deleteMany({ where: { published: true } })).resolves.toMatchObject({ count: 0 });
        await expect(user1Db.post.deleteMany({ where: { published: true } })).resolves.toMatchObject({ count: 1 });
    });
});
