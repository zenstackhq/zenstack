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

            expect(r.body.data).toEqual([
                {
                    type: 'user',
                    id: 'user1',
                    attributes: {
                        email: 'user1@abc.com',
                        nickName: 'one',
                    },
                    links: {
                        self: 'http://localhost/api/user/user1',
                    },
                    relationships: {
                        posts: {
                            links: {
                                self: 'http://localhost/api/user/user1/relationships/posts',
                                related: 'http://localhost/api/user/user1/posts',
                            },
                            data: [
                                {
                                    type: 'post',
                                    id: 1,
                                },
                            ],
                        },
                    },
                },
                {
                    type: 'user',
                    id: 'user2',
                    attributes: {
                        email: 'user2@abc.com',
                        nickName: 'two',
                    },
                    links: {
                        self: 'http://localhost/api/user/user2',
                    },
                    relationships: {
                        posts: {
                            links: {
                                self: 'http://localhost/api/user/user2/relationships/posts',
                                related: 'http://localhost/api/user/user2/posts',
                            },
                            data: [
                                {
                                    type: 'post',
                                    id: 2,
                                },
                            ],
                        },
                    },
                },
            ]);
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

            expect(r.body.data).toEqual([
                {
                    type: 'user',
                    id: 'user1',
                    attributes: {
                        email: 'user1@abc.com',
                        nickName: 'one',
                    },
                    links: {
                        self: 'http://localhost/api/user/user1',
                    },
                    relationships: {
                        posts: {
                            links: {
                                self: 'http://localhost/api/user/user1/relationships/posts',
                                related: 'http://localhost/api/user/user1/posts',
                            },
                            data: [
                                {
                                    type: 'post',
                                    id: 1,
                                },
                            ],
                        },
                    },
                },
                {
                    type: 'user',
                    id: 'user2',
                    attributes: {
                        email: 'user2@abc.com',
                        nickName: 'two',
                    },
                    links: {
                        self: 'http://localhost/api/user/user2',
                    },
                    relationships: {
                        posts: {
                            links: {
                                self: 'http://localhost/api/user/user2/relationships/posts',
                                related: 'http://localhost/api/user/user2/posts',
                            },
                            data: [
                                {
                                    type: 'post',
                                    id: 2,
                                },
                            ],
                        },
                    },
                },
            ]);

            expect(r.body.included).toEqual([
                {
                    type: 'post',
                    id: 1,
                    attributes: {
                        title: 'Post1',
                        published: false,
                    },
                    links: {
                        self: 'http://localhost/api/post/1',
                    },
                    relationships: {
                        author: {
                            links: {
                                self: 'http://localhost/api/post/1/relationships/author',
                                related: 'http://localhost/api/post/1/author',
                            },
                        },
                    },
                },
                {
                    type: 'post',
                    id: 2,
                    attributes: {
                        title: 'Post2',
                        published: true,
                    },
                    links: {
                        self: 'http://localhost/api/post/2',
                    },
                    relationships: {
                        author: {
                            links: {
                                self: 'http://localhost/api/post/2/relationships/author',
                                related: 'http://localhost/api/post/2/author',
                            },
                        },
                    },
                },
            ]);
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
            expect(r.body.data).toEqual({
                type: 'user',
                id: 'user1',
                attributes: { email: 'user1@abc.com' },
                links: {
                    self: 'http://localhost/api/user/user1',
                },
                relationships: {
                    posts: {
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                            related: 'http://localhost/api/user/user1/posts',
                        },
                        data: [{ type: 'post', id: 1 }],
                    },
                },
            });
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
            expect(r.body.data).toEqual({
                type: 'user',
                id: 'user1',
                attributes: { email: 'user1@abc.com', nickName: 'User 1' },
                links: {
                    self: 'http://localhost/api/user/user1',
                },
                relationships: {
                    posts: {
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                            related: 'http://localhost/api/user/user1/posts',
                        },
                        data: [{ type: 'post', id: 1 }],
                    },
                },
            });

            expect(r.body.included).toEqual([
                {
                    type: 'post',
                    id: 1,
                    attributes: {
                        title: 'Post1',
                        published: false,
                    },
                    links: {
                        self: 'http://localhost/api/post/1',
                    },
                    relationships: {
                        author: {
                            links: {
                                self: 'http://localhost/api/post/1/relationships/author',
                                related: 'http://localhost/api/post/1/author',
                            },
                        },
                    },
                },
            ]);
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
            expect(r.body.data).toEqual([
                {
                    type: 'post',
                    id: 1,
                    attributes: {
                        title: 'Post1',
                        content: 'Post 1 Content',
                    },
                    links: {
                        self: 'http://localhost/api/post/1',
                    },
                    relationships: {
                        author: {
                            links: {
                                self: 'http://localhost/api/post/1/relationships/author',
                                related: 'http://localhost/api/post/1/author',
                            },
                        },
                    },
                },
            ]);
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
