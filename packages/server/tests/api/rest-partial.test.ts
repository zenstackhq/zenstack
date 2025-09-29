/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { type ModelMeta } from '@zenstackhq/runtime';
import { loadSchema, run } from '@zenstackhq/testtools';
import makeHandler from '../../src/api/rest';

describe('REST server tests', () => {
    let prisma: any;
    let zodSchemas: any;
    let modelMeta: ModelMeta;
    let handler: (any: any) => Promise<{ status: number; body: any }>;

    beforeEach(async () => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    describe('REST server tests - sparse fieldsets', () => {
        const schema = `
    model User {
        myId String @id @default(cuid())
        createdAt DateTime @default (now())
        updatedAt DateTime @updatedAt
        email String @unique @email
        nickName String
        posts Post[]
    }
    
    model Post {
        id Int @id @default(autoincrement())
        createdAt DateTime @default (now())
        updatedAt DateTime @updatedAt
        title String @length(1, 10)
        content String
        author User? @relation(fields: [authorId], references: [myId])
        authorId String?
        published Boolean @default(false)
        publishedAt DateTime?
        viewCount Int @default(0)
        comments Comment[]
    }
        
    model Comment {
        id Int @id @default(autoincrement())
        post Post @relation(fields: [postId], references: [id])
        postId Int
        content String
    }
    `;

        beforeAll(async () => {
            const params = await loadSchema(schema);

            prisma = params.prisma;
            zodSchemas = params.zodSchemas;
            modelMeta = params.modelMeta;

            const _handler = makeHandler({ endpoint: 'http://localhost/api', pageSize: 5 });
            handler = (args) =>
                _handler({ ...args, zodSchemas, modelMeta, url: new URL(`http://localhost/${args.path}`) });
        });

        it('returns only the requested fields when there are some in the database', async () => {
            // Create users first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'one',
                    posts: {
                        create: { title: 'Post1', content: 'Post 1 Content' },
                    },
                },
            });
            await prisma.user.create({
                data: {
                    myId: 'user2',
                    email: 'user2@abc.com',
                    nickName: 'two',
                    posts: {
                        create: { title: 'Post2', content: 'Post 2 Content' },
                    },
                },
            });

            const r = await handler({
                method: 'get',
                path: '/user',
                prisma,
                query: { ['fields[user]']: 'email,nickName' },
            });

            expect(r.status).toBe(200);

            expect(r.body.data[0].attributes).toEqual({
                email: 'user1@abc.com',
                nickName: 'one',
            });

            expect(r.body.data[1].attributes).toEqual({
                email: 'user2@abc.com',
                nickName: 'two',
            });
        });

        it('returns collection with only the requested fields when there are includes', async () => {
            // Create users first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'one',
                    posts: {
                        create: { title: 'Post1', content: 'Post 1 Content' },
                    },
                },
            });
            await prisma.user.create({
                data: {
                    myId: 'user2',
                    email: 'user2@abc.com',
                    nickName: 'two',
                    posts: {
                        create: { title: 'Post2', content: 'Post 2 Content', published: true },
                    },
                },
            });

            const r = await handler({
                method: 'get',
                path: '/user',
                prisma,
                query: { ['fields[user]']: 'email,nickName', ['fields[post]']: 'title,published', include: 'posts' },
            });

            expect(r.status).toBe(200);

            expect(r.body.data[0].attributes).toEqual({
                email: 'user1@abc.com',
                nickName: 'one',
            });

            expect(r.body.data[1].attributes).toEqual({
                email: 'user2@abc.com',
                nickName: 'two',
            });

            expect(r.body.included[0].attributes).toEqual({
                title: 'Post1',
                published: false,
            });

            expect(r.body.included[1].attributes).toEqual({
                title: 'Post2',
                published: true,
            });
        });

        it('returns collection with only the requested fields when there are deep includes', async () => {
            // Create users first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'one',
                    posts: {
                        create: {
                            title: 'Post1',
                            content: 'Post 1 Content',
                            comments: { create: { content: 'Comment1' } },
                        },
                    },
                },
            });
            await prisma.user.create({
                data: {
                    myId: 'user2',
                    email: 'user2@abc.com',
                    nickName: 'two',
                    posts: {
                        create: {
                            title: 'Post2',
                            content: 'Post 2 Content',
                            published: true,
                            comments: { create: { content: 'Comment2' } },
                        },
                    },
                },
            });

            const r = await handler({
                method: 'get',
                path: '/user',
                prisma,
                query: {
                    ['fields[user]']: 'email,nickName',
                    ['fields[post]']: 'title,published',
                    ['fields[comment]']: 'content',
                    include: 'posts,posts.comments',
                },
            });

            expect(r.status).toBe(200);

            expect(r.body.data[0].attributes).toEqual({
                email: 'user1@abc.com',
                nickName: 'one',
            });

            expect(r.body.data[1].attributes).toEqual({
                email: 'user2@abc.com',
                nickName: 'two',
            });

            expect(r.body.included[0].attributes).toEqual({
                title: 'Post1',
                published: false,
            });

            expect(r.body.included[1].attributes).toEqual({
                title: 'Post2',
                published: true,
            });

            expect(r.body.included[2].attributes).toEqual({ content: 'Comment1' });
            expect(r.body.included[3].attributes).toEqual({ content: 'Comment2' });
        });

        it('returns collection with only the requested fields when there are sparse fields on deep includes', async () => {
            // Create users first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'one',
                    posts: {
                        create: {
                            title: 'Post1',
                            content: 'Post 1 Content',
                            comments: { create: { content: 'Comment1' } },
                        },
                    },
                },
            });
            await prisma.user.create({
                data: {
                    myId: 'user2',
                    email: 'user2@abc.com',
                    nickName: 'two',
                    posts: {
                        create: {
                            title: 'Post2',
                            content: 'Post 2 Content',
                            published: true,
                            comments: { create: { content: 'Comment2' } },
                        },
                    },
                },
            });

            const r = await handler({
                method: 'get',
                path: '/user',
                prisma,
                query: {
                    ['fields[user]']: 'email,nickName',
                    ['fields[comment]']: 'content',
                    include: 'posts,posts.comments',
                },
            });

            expect(r.status).toBe(200);

            expect(r.body.data[0].attributes).toEqual({
                email: 'user1@abc.com',
                nickName: 'one',
            });

            expect(r.body.data[1].attributes).toEqual({
                email: 'user2@abc.com',
                nickName: 'two',
            });

            //did not use sparse field on posts, only comments
            expect(r.body.included[0].attributes).toMatchObject({
                title: 'Post1',
                published: false,
            });

            //did not use sparse field on posts, only comments
            expect(r.body.included[1].attributes).toMatchObject({
                title: 'Post2',
                published: true,
            });

            expect(r.body.included[2].attributes).toEqual({ content: 'Comment1' });
            expect(r.body.included[3].attributes).toEqual({ content: 'Comment2' });
        });

        it('returns only the requested fields when the ID is specified', async () => {
            // Create a user first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'User 1',
                    posts: { create: { title: 'Post1', content: 'Post 1 Content' } },
                },
            });

            const r = await handler({
                method: 'get',
                path: '/user/user1',
                prisma,
                query: { ['fields[user]']: 'email' },
            });

            expect(r.status).toBe(200);
            expect(r.body.data.attributes).toEqual({ email: 'user1@abc.com' });
        });

        it('returns only the requested fields when the ID is specified and has an include', async () => {
            // Create a user first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'User 1',
                    posts: { create: { title: 'Post1', content: 'Post 1 Content' } },
                },
            });

            const r = await handler({
                method: 'get',
                path: '/user/user1',
                prisma,
                query: { ['fields[user]']: 'email,nickName', ['fields[post]']: 'title,published', include: 'posts' },
            });

            expect(r.status).toBe(200);
            expect(r.body.data.attributes).toEqual({ email: 'user1@abc.com', nickName: 'User 1' });

            expect(r.body.included[0].attributes).toEqual({
                title: 'Post1',
                published: false,
            });
        });

        it('fetch only requested fields on a related resource', async () => {
            // Create a user first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'one',
                    posts: {
                        create: { title: 'Post1', content: 'Post 1 Content' },
                    },
                },
            });

            const r = await handler({
                method: 'get',
                path: '/user/user1/posts',
                prisma,
                query: { ['fields[post]']: 'title,content' },
            });

            expect(r.status).toBe(200);
            expect(r.body.data[0].attributes).toEqual({
                title: 'Post1',
                content: 'Post 1 Content',
            });
        });

        it('does not efect toplevel filtering', async () => {
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'one',
                    posts: {
                        create: { id: 1, title: 'Post1', content: 'Post 1 Content' },
                    },
                },
            });
            await prisma.user.create({
                data: {
                    myId: 'user2',
                    email: 'user2@abc.com',
                    nickName: 'two',
                    posts: {
                        create: { id: 2, title: 'Post2', content: 'Post 2 Content', viewCount: 1, published: true },
                    },
                },
            });

            // id filter
            const r = await handler({
                method: 'get',
                path: '/user',
                query: { ['filter[id]']: 'user2', ['fields[user]']: 'email' },
                prisma,
            });
            expect(r.status).toBe(200);
            expect(r.body.data).toHaveLength(1);
            expect(r.body.data[0]).toMatchObject({ id: 'user2' });
            expect(r.body.data[0].attributes).not.toMatchObject({ nickName: 'two' });
        });

        it('does not efect toplevel sorting', async () => {
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'one',
                    posts: {
                        create: { id: 1, title: 'Post1', content: 'Post 1 Content', viewCount: 1, published: true },
                    },
                },
            });
            await prisma.user.create({
                data: {
                    myId: 'user2',
                    email: 'user2@abc.com',
                    nickName: 'two',
                    posts: {
                        create: { id: 2, title: 'Post2', content: 'Post 2 Content', viewCount: 2, published: false },
                    },
                },
            });

            // basic sorting
            const r = await handler({
                method: 'get',
                path: '/post',
                query: { sort: 'viewCount', ['fields[post]']: 'title' },
                prisma,
            });
            expect(r.status).toBe(200);
            expect(r.body.data[0]).toMatchObject({ id: 1 });
        });

        it('does not efect toplevel pagination', async () => {
            for (const i of Array(5).keys()) {
                await prisma.user.create({
                    data: {
                        myId: `user${i}`,
                        email: `user${i}@abc.com`,
                        nickName: `{i}`,
                    },
                });
            }

            // limit only
            const r = await handler({
                method: 'get',
                path: '/user',
                query: { ['page[limit]']: '3', ['fields[user]']: 'email' },
                prisma,
            });
            expect(r.body.data).toHaveLength(3);
            expect(r.body.meta.total).toBe(5);
            expect(r.body.links).toMatchObject({
                first: 'http://localhost/api/user?fields%5Buser%5D=email&page%5Blimit%5D=3',
                last: 'http://localhost/api/user?fields%5Buser%5D=email&page%5Boffset%5D=3',
                prev: null,
                next: 'http://localhost/api/user?fields%5Buser%5D=email&page%5Boffset%5D=3&page%5Blimit%5D=3',
            });
        });
    });
});
