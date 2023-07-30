import { AuthUser } from '@zenstackhq/runtime';
import { loadSchemaFromFile, type WeakDbClientContract } from '@zenstackhq/testtools';
import path from 'path';
import { Pool } from 'pg';

const DB_NAME = 'refactor';

describe('With Policy: refactor tests', () => {
    let origDir: string;
    let getDb: (user?: AuthUser) => WeakDbClientContract;
    let prisma: WeakDbClientContract;
    let anonDb: WeakDbClientContract;
    let adminDb: WeakDbClientContract;
    let user1Db: WeakDbClientContract;
    let user2Db: WeakDbClientContract;

    const pool = new Pool({ user: 'postgres', password: 'abc123' });

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    beforeEach(async () => {
        await pool.query(`DROP DATABASE IF EXISTS "${DB_NAME}";`);
        await pool.query(`CREATE DATABASE "${DB_NAME}";`);

        const { prisma: _prisma, withPolicy } = await loadSchemaFromFile(
            path.join(__dirname, '../../schema/refactor-pg.zmodel'),
            {
                addPrelude: false,
                logPrismaQuery: true,
            }
        );
        getDb = withPolicy;
        prisma = _prisma;
        anonDb = getDb();
        user1Db = getDb({ id: 1 });
        user2Db = getDb({ id: 2 });
        adminDb = getDb({ id: 100, role: 'ADMIN' });
    });

    afterEach(async () => {
        process.chdir(origDir);
        await prisma.$disconnect();
        await pool.query(`DROP DATABASE IF EXISTS "${DB_NAME}";`);
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
                            comments: { create: { authorId: 1, content: 'Comment 1' } },
                        },
                        {
                            title: 'Post 2',
                            published: false,
                            comments: { create: { authorId: 1, content: 'Comment 2' } },
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
                data: { id: 1, email: 'user1@zenstack.dev' },
            })
        ).rejects.toThrow(/not allowed to be read back/);

        // success
        await expect(user1Db.user.findUnique({ where: { id: 1 } })).toResolveTruthy();

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
                            title: 'Post 2',
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
            })
        ).toResolveTruthy();

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

        // create many
        await expect(
            anonDb.user.createMany({
                data: [
                    { id: 7, email: 'user7' },
                    { id: 8, email: 'user8@zenstac.kdev' },
                ],
            })
        ).toBeRejectedByPolicy();
        // no partial success
        await expect(adminDb.user.findUnique({ where: { id: 8 } })).toResolveFalsy();
        await expect(
            anonDb.user.createMany({
                data: [
                    { id: 7, email: 'user7@zenstack.dev' },
                    { id: 8, email: 'user8@zenstack.kdev' },
                ],
            })
        ).resolves.toMatchObject({ count: 2 });
    });

    it('update', async () => {});

    it('delete', async () => {});
});
