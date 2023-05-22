/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema, run } from '@zenstackhq/testtools';
import { ModelMeta } from '@zenstackhq/runtime/enhancements/types';
import makeHandler from '../../src/api/rest';
import { Response } from '../../src/types';

let prisma: any;
let zodSchemas: any;
let modelMeta: ModelMeta;
let handler: (any: any) => Promise<Response>;

export const schema = `
model User {
    myId String @id @default(cuid())
    createdAt DateTime @default (now())
    updatedAt DateTime @updatedAt
    email String @unique
    posts Post[]
    profile Profile?
}

model Profile {
    id Int @id @default(autoincrement())
    gender String
    user User @relation(fields: [userId], references: [myId])
    userId String @unique
}

model Post {
    id Int @id @default(autoincrement())
    createdAt DateTime @default (now())
    updatedAt DateTime @updatedAt
    title String
    author User? @relation(fields: [authorId], references: [myId])
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
    comments Comment[]
    setting Setting?
}

model Comment {
    id Int @id @default(autoincrement())
    post Post @relation(fields: [postId], references: [id])
    postId Int
    content String
}

model Setting {
    id Int @id @default(autoincrement())
    boost Int
    post Post @relation(fields: [postId], references: [id])
    postId Int @unique
}
`;

describe('REST server tests', () => {
    beforeAll(async () => {
        const params = await loadSchema(schema);

        prisma = params.prisma;
        zodSchemas = params.zodSchemas;
        modelMeta = params.modelMeta;

        const _handler = makeHandler({ endpoint: 'http://localhost/api', pageSize: 5 });
        handler = (args) => _handler({ ...args, zodSchemas, modelMeta, url: new URL(`http://localhost/${args.path}`) });
    });

    beforeEach(async () => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    describe('CRUD', () => {
        describe('GET', () => {
            it('returns an empty array when no item exists', async () => {
                const r = await handler({
                    method: 'get',
                    path: '/user',
                    prisma,
                });
                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    data: [],
                    links: {
                        self: 'http://localhost/api/user',
                    },
                });
            });

            it('returns all items when there are some in the database', async () => {
                // Create users first
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: { title: 'Post1' },
                        },
                    },
                });
                await prisma.user.create({
                    data: {
                        myId: 'user2',
                        email: 'user2@abc.com',
                        posts: {
                            create: { title: 'Post2' },
                        },
                    },
                });

                const r = await handler({
                    method: 'get',
                    path: '/user',
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/user',
                    },
                    data: [
                        {
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
                        },
                        {
                            type: 'user',
                            id: 'user2',
                            attributes: { email: 'user2@abc.com' },
                            links: {
                                self: 'http://localhost/api/user/user2',
                            },
                            relationships: {
                                posts: {
                                    links: {
                                        self: 'http://localhost/api/user/user2/relationships/posts',
                                        related: 'http://localhost/api/user/user2/posts',
                                    },
                                    data: [{ type: 'post', id: 2 }],
                                },
                            },
                        },
                    ],
                });
            });

            it('returns a single item when the ID is specified', async () => {
                // Create a user first
                await prisma.user.create({
                    data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { title: 'Post1' } } },
                });

                const r = await handler({
                    method: 'get',
                    path: '/user/user1',
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    data: {
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
                    },
                });
            });

            it('fetch a related resource', async () => {
                // Create a user first
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: { id: 1, title: 'Post1' },
                        },
                    },
                });

                const r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/user/user1/posts',
                    },
                    data: [
                        {
                            type: 'post',
                            id: 1,
                            attributes: {
                                title: 'Post1',
                                authorId: 'user1',
                                published: false,
                                viewCount: 0,
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
                    ],
                });
            });

            it('fetch a relationship', async () => {
                // Create a user first
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: { id: 1, title: 'Post1' },
                        },
                    },
                });

                const r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/user/user1/relationships/posts',
                    },
                    data: [{ type: 'post', id: 1 }],
                });
            });

            it('returns 404 if the specified ID does not exist', async () => {
                const r = await handler({
                    method: 'get',
                    path: '/user/nonexistentuser',
                    prisma,
                });

                expect(r.status).toBe(404);
                expect(r.body).toEqual({
                    errors: [
                        {
                            code: 'not-found',
                            status: 404,
                            title: 'Resource not found',
                        },
                    ],
                });
            });

            it('toplevel filtering', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: { id: 1, title: 'Post1' },
                        },
                    },
                });
                await prisma.user.create({
                    data: {
                        myId: 'user2',
                        email: 'user2@abc.com',
                        posts: {
                            create: { id: 2, title: 'Post2', viewCount: 1, published: true },
                        },
                    },
                });

                // id filter
                let r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[id]']: 'user2' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 'user2' });

                // String filter
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[email]']: 'user1@abc.com' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 'user1' });

                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[email$contains]']: '1@abc' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 'user1' });

                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[email$contains]']: '1@bc' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[email$startsWith]']: 'user1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 'user1' });

                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[email$startsWith]']: 'ser1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[email$endsWith]']: '1@abc.com' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 'user1' });

                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[email$endsWith]']: '1@abc' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                // Int filter
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { ['filter[viewCount]']: '1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { ['filter[viewCount$gt]']: '0' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { ['filter[viewCount$gte]']: '1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { ['filter[viewCount$lt]']: '0' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { ['filter[viewCount$lte]']: '0' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 1 });

                // Boolean filter
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { ['filter[published]']: 'true' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                // filter to empty
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[id]']: 'user3' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                // to-many relation collection filter
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[posts]']: '2' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 'user2' });

                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[posts]']: '1,2,3' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(2);

                // multi filter
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[id]']: 'user1', ['filter[posts]']: '2' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                // to-one relation filter
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { ['filter[author]']: 'user1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
                expect((r.body as any).data[0]).toMatchObject({ id: 1 });

                // invalid filter field
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[foo]']: '1' },
                    prisma,
                });
                expect(r.body).toMatchObject({
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-filter',
                            title: 'Invalid filter',
                        },
                    ],
                });

                // invalid filter value
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { ['filter[viewCount]']: 'a' },
                    prisma,
                });
                expect(r.body).toMatchObject({
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-value',
                            title: 'Invalid value for type',
                        },
                    ],
                });

                // invalid filter operation
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['filter[email$foo]']: '1' },
                    prisma,
                });
                expect(r.body).toMatchObject({
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-filter',
                            title: 'Invalid filter',
                        },
                    ],
                });
            });

            it('related data filtering', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: { id: 1, title: 'Post1' },
                        },
                    },
                });
                await prisma.user.create({
                    data: {
                        myId: 'user2',
                        email: 'user2@abc.com',
                        posts: {
                            create: { id: 2, title: 'Post2', viewCount: 1, published: true },
                        },
                    },
                });

                let r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    query: { ['filter[viewCount]']: '1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                r = await handler({
                    method: 'get',
                    path: '/user/user2/posts',
                    query: { ['filter[viewCount]']: '1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
            });

            it('relationship filtering', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: { id: 1, title: 'Post1' },
                        },
                    },
                });
                await prisma.user.create({
                    data: {
                        myId: 'user2',
                        email: 'user2@abc.com',
                        posts: {
                            create: { id: 2, title: 'Post2', viewCount: 1, published: true },
                        },
                    },
                });

                let r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    query: { ['filter[viewCount]']: '1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                r = await handler({
                    method: 'get',
                    path: '/user/user2/relationships/posts',
                    query: { ['filter[viewCount]']: '1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(1);
            });

            it('toplevel sorting', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: { id: 1, title: 'Post1', viewCount: 1, published: true },
                        },
                    },
                });
                await prisma.user.create({
                    data: {
                        myId: 'user2',
                        email: 'user2@abc.com',
                        posts: {
                            create: { id: 2, title: 'Post2', viewCount: 2, published: false },
                        },
                    },
                });

                // basic sorting
                let r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: 'viewCount' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 1 });

                // basic sorting desc
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: '-viewCount' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                // by relation id
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: '-author' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                // by relation field
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: '-author.email' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                // multi-field sorting
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: 'published,viewCount' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: 'viewCount,published' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 1 });

                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: '-viewCount,-published' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                // invalid field
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: 'foo' },
                    prisma,
                });
                expect(r.status).toBe(400);
                expect(r.body).toMatchObject({
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-sort',
                        },
                    ],
                });

                // sort with collection
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: 'comments' },
                    prisma,
                });
                expect(r.status).toBe(400);
                expect(r.body).toMatchObject({
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-sort',
                        },
                    ],
                });

                // sort with regular field in the middle
                r = await handler({
                    method: 'get',
                    path: '/post',
                    query: { sort: 'viewCount.foo' },
                    prisma,
                });
                expect(r.status).toBe(400);
                expect(r.body).toMatchObject({
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-sort',
                        },
                    ],
                });
            });

            it('related data sorting', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: [
                                {
                                    id: 1,
                                    title: 'Post1',
                                    viewCount: 1,
                                    published: true,
                                    setting: { create: { boost: 1 } },
                                },
                                {
                                    id: 2,
                                    title: 'Post2',
                                    viewCount: 2,
                                    published: false,
                                    setting: { create: { boost: 2 } },
                                },
                            ],
                        },
                    },
                });

                // asc
                let r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    query: { sort: 'viewCount' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 1 });

                // desc
                r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    query: { sort: '-viewCount' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                // relation field
                r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    query: { sort: '-setting.boost' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });
            });

            it('relationship sorting', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: [
                                {
                                    id: 1,
                                    title: 'Post1',
                                    viewCount: 1,
                                    published: true,
                                    setting: { create: { boost: 1 } },
                                },
                                {
                                    id: 2,
                                    title: 'Post2',
                                    viewCount: 2,
                                    published: false,
                                    setting: { create: { boost: 2 } },
                                },
                            ],
                        },
                    },
                });

                // asc
                let r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    query: { sort: 'viewCount' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 1 });

                // desc
                r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    query: { sort: '-viewCount' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });

                // relation field
                r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    query: { sort: '-setting.boost' },
                    prisma,
                });
                expect(r.status).toBe(200);
                expect((r.body as any).data[0]).toMatchObject({ id: 2 });
            });

            it('including', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: { id: 1, title: 'Post1', comments: { create: { content: 'Comment1' } } },
                        },
                        profile: {
                            create: { gender: 'male' },
                        },
                    },
                });
                await prisma.user.create({
                    data: {
                        myId: 'user2',
                        email: 'user2@abc.com',
                        posts: {
                            create: {
                                id: 2,
                                title: 'Post2',
                                viewCount: 1,
                                published: true,
                                comments: { create: { content: 'Comment2' } },
                            },
                        },
                    },
                });

                // collection query include
                let r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { include: 'posts' },
                    prisma,
                });
                expect((r.body as any).included).toHaveLength(2);
                expect((r.body as any).included[0]).toMatchObject({
                    type: 'post',
                    id: 1,
                    attributes: { title: 'Post1' },
                });

                // single query include
                r = await handler({
                    method: 'get',
                    path: '/user/user1',
                    query: { include: 'posts' },
                    prisma,
                });
                expect((r.body as any).included).toHaveLength(1);
                expect((r.body as any).included[0]).toMatchObject({
                    type: 'post',
                    id: 1,
                    attributes: { title: 'Post1' },
                });

                // related query include
                r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    query: { include: 'posts.comments' },
                    prisma,
                });
                expect((r.body as any).included).toHaveLength(1);
                expect((r.body as any).included[0]).toMatchObject({
                    type: 'comment',
                    attributes: { content: 'Comment1' },
                });

                // related query include with filter
                r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    query: { include: 'posts.comments', ['filter[published]']: 'true' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);

                // deep include
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { include: 'posts.comments' },
                    prisma,
                });
                expect((r.body as any).included).toHaveLength(3);
                expect((r.body as any).included[2]).toMatchObject({
                    type: 'comment',
                    attributes: { content: 'Comment1' },
                });

                // multiple include
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { include: 'posts.comments,profile' },
                    prisma,
                });
                expect((r.body as any).included).toHaveLength(4);
                const profile = (r.body as any).included.find((item: any) => item.type === 'profile');
                expect(profile).toMatchObject({
                    type: 'profile',
                    attributes: { gender: 'male' },
                });

                // invalid include
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { include: 'foo' },
                    prisma,
                });
                expect(r.status).toBe(400);
                expect(r.body).toMatchObject({
                    errors: [{ status: 400, code: 'unsupported-relationship' }],
                });
            });

            it('toplevel pagination', async () => {
                for (const i of Array(5).keys()) {
                    await prisma.user.create({
                        data: {
                            myId: `user${i}`,
                            email: `user${i}@abc.com`,
                        },
                    });
                }

                // limit only
                let r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['page[limit]']: '3' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(3);
                expect((r.body as any).links).toMatchObject({
                    first: 'http://localhost/api/user?page%5Blimit%5D=3',
                    last: 'http://localhost/api/user?page%5Boffset%5D=3',
                    prev: null,
                    next: 'http://localhost/api/user?page%5Boffset%5D=3&page%5Blimit%5D=3',
                });

                // limit & offset
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['page[limit]']: '3', ['page[offset]']: '3' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(2);
                expect((r.body as any).links).toMatchObject({
                    first: 'http://localhost/api/user?page%5Blimit%5D=3',
                    last: 'http://localhost/api/user?page%5Boffset%5D=3',
                    prev: 'http://localhost/api/user?page%5Boffset%5D=0&page%5Blimit%5D=3',
                    next: null,
                });

                // limit trimmed
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['page[limit]']: '10' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(5);
                expect((r.body as any).links).toMatchObject({
                    first: 'http://localhost/api/user?page%5Blimit%5D=5',
                    last: 'http://localhost/api/user?page%5Boffset%5D=0',
                    prev: null,
                    next: null,
                });

                // offset overflow
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['page[offset]']: '10' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(0);
                expect((r.body as any).links).toMatchObject({
                    first: 'http://localhost/api/user?page%5Blimit%5D=5',
                    last: 'http://localhost/api/user?page%5Boffset%5D=0',
                    prev: null,
                    next: null,
                });

                // minus offset
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['page[offset]']: '-1' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(5);
                expect((r.body as any).links).toMatchObject({
                    first: 'http://localhost/api/user?page%5Blimit%5D=5',
                    last: 'http://localhost/api/user?page%5Boffset%5D=0',
                    prev: null,
                    next: null,
                });

                // zero limit
                r = await handler({
                    method: 'get',
                    path: '/user',
                    query: { ['page[limit]']: '0' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(5);
                expect((r.body as any).links).toMatchObject({
                    first: 'http://localhost/api/user?page%5Blimit%5D=5',
                    last: 'http://localhost/api/user?page%5Boffset%5D=0',
                    prev: null,
                    next: null,
                });
            });

            it('related data pagination', async () => {
                await prisma.user.create({
                    data: {
                        myId: `user1`,
                        email: `user1@abc.com`,
                        posts: {
                            create: [...Array(10).keys()].map((i) => ({
                                id: i,
                                title: `Post${i}`,
                            })),
                        },
                    },
                });

                // default limiting
                let r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(5);
                expect((r.body as any).links).toMatchObject({
                    self: 'http://localhost/api/user/user1/posts',
                    first: 'http://localhost/api/user/user1/posts?page%5Blimit%5D=5',
                    last: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=5',
                    prev: null,
                    next: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=5&page%5Blimit%5D=5',
                });

                // explicit limiting
                r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    query: { ['page[limit]']: '3' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(3);
                expect((r.body as any).links).toMatchObject({
                    self: 'http://localhost/api/user/user1/posts',
                    first: 'http://localhost/api/user/user1/posts?page%5Blimit%5D=3',
                    last: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=9',
                    prev: null,
                    next: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=3&page%5Blimit%5D=3',
                });

                // offset
                r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    query: { ['page[limit]']: '3', ['page[offset]']: '8' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(2);
                expect((r.body as any).links).toMatchObject({
                    self: 'http://localhost/api/user/user1/posts',
                    first: 'http://localhost/api/user/user1/posts?page%5Blimit%5D=3',
                    last: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=9',
                    prev: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=5&page%5Blimit%5D=3',
                    next: null,
                });
            });

            it('relationship pagination', async () => {
                await prisma.user.create({
                    data: {
                        myId: `user1`,
                        email: `user1@abc.com`,
                        posts: {
                            create: [...Array(10).keys()].map((i) => ({
                                id: i,
                                title: `Post${i}`,
                            })),
                        },
                    },
                });

                // default limiting
                let r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(5);
                expect((r.body as any).links).toMatchObject({
                    self: 'http://localhost/api/user/user1/relationships/posts',
                    first: 'http://localhost/api/user/user1/relationships/posts?page%5Blimit%5D=5',
                    last: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=5',
                    prev: null,
                    next: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=5&page%5Blimit%5D=5',
                });

                // explicit limiting
                r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    query: { ['page[limit]']: '3' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(3);
                expect((r.body as any).links).toMatchObject({
                    self: 'http://localhost/api/user/user1/relationships/posts',
                    first: 'http://localhost/api/user/user1/relationships/posts?page%5Blimit%5D=3',
                    last: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=9',
                    prev: null,
                    next: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=3&page%5Blimit%5D=3',
                });

                // offset
                r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    query: { ['page[limit]']: '3', ['page[offset]']: '8' },
                    prisma,
                });
                expect((r.body as any).data).toHaveLength(2);
                expect((r.body as any).links).toMatchObject({
                    self: 'http://localhost/api/user/user1/relationships/posts',
                    first: 'http://localhost/api/user/user1/relationships/posts?page%5Blimit%5D=3',
                    last: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=9',
                    prev: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=5&page%5Blimit%5D=3',
                    next: null,
                });
            });
        });

        describe('POST', () => {
            it('creates an item without relation', async () => {
                const r = await handler({
                    method: 'post',
                    path: '/user',
                    query: {},
                    requestBody: {
                        data: { type: 'user', attributes: { myId: 'user1', email: 'user1@abc.com' } },
                    },
                    prisma,
                });

                expect(r.status).toBe(201);
                expect(r.body).toMatchObject({
                    jsonapi: { version: '1.0' },
                    data: { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
                });
            });

            it('creates an item with collection relations', async () => {
                await prisma.post.create({
                    data: { id: 1, title: 'Post1' },
                });
                await prisma.post.create({
                    data: { id: 2, title: 'Post2' },
                });

                const r = await handler({
                    method: 'post',
                    path: '/user',
                    query: {},
                    requestBody: {
                        data: {
                            type: 'user',
                            attributes: { myId: 'user1', email: 'user1@abc.com' },
                            relationships: {
                                posts: {
                                    data: [
                                        { type: 'post', id: 1 },
                                        { type: 'post', id: 2 },
                                    ],
                                },
                            },
                        },
                    },
                    prisma,
                });

                expect(r.status).toBe(201);
                expect(r.body).toMatchObject({
                    jsonapi: { version: '1.0' },
                    data: {
                        type: 'user',
                        id: 'user1',
                        attributes: {
                            email: 'user1@abc.com',
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
                                    { type: 'post', id: 1 },
                                    { type: 'post', id: 2 },
                                ],
                            },
                        },
                    },
                });
            });

            it('creates an item with single relation', async () => {
                await prisma.user.create({
                    data: { myId: 'user1', email: 'user1@abc.com' },
                });

                const r = await handler({
                    method: 'post',
                    path: '/post',
                    query: {},
                    requestBody: {
                        data: {
                            type: 'post',
                            attributes: { title: 'Post1' },
                            relationships: {
                                author: {
                                    data: { type: 'user', id: 'user1' },
                                },
                            },
                        },
                    },
                    prisma,
                });

                expect(r.status).toBe(201);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/post/1',
                    },
                    data: {
                        type: 'post',
                        id: 1,
                        attributes: {
                            title: 'Post1',
                            authorId: 'user1',
                            published: false,
                            viewCount: 0,
                        },
                        links: {
                            self: 'http://localhost/api/post/1',
                        },
                        relationships: {
                            author: {
                                links: {
                                    self: 'http://localhost/api/post/1/relationships/author/user1',
                                    related: 'http://localhost/api/post/1/author/user1',
                                },
                                data: { type: 'user', id: 'user1' },
                            },
                        },
                    },
                });
            });

            it('create single relation disallowed', async () => {
                await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                await prisma.post.create({
                    data: { id: 1, title: 'Post1' },
                });

                const r = await handler({
                    method: 'post',
                    path: '/post/1/relationships/author',
                    query: {},
                    requestBody: {
                        data: { type: 'user', id: 'user1' },
                    },
                    prisma,
                });

                expect(r.status).toBe(400);
                expect(r.body).toMatchObject({
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-verb',
                            title: 'The HTTP verb is not supported',
                        },
                    ],
                });
            });

            it('create a collection of relations', async () => {
                await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                await prisma.post.create({
                    data: { id: 1, title: 'Post1' },
                });
                await prisma.post.create({
                    data: { id: 2, title: 'Post2' },
                });

                const r = await handler({
                    method: 'post',
                    path: '/user/user1/relationships/posts',
                    query: {},
                    requestBody: {
                        data: [
                            { type: 'post', id: 1 },
                            { type: 'post', id: 2 },
                        ],
                    },
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/user/user1/relationships/posts',
                    },
                    data: [
                        { type: 'post', id: 1 },
                        { type: 'post', id: 2 },
                    ],
                });
            });

            it('create relation for nonexistent entity', async () => {
                let r = await handler({
                    method: 'post',
                    path: '/user/user1/relationships/posts',
                    query: {},
                    requestBody: {
                        data: [{ type: 'post', id: 1 }],
                    },
                    prisma,
                });

                expect(r.status).toBe(404);

                await prisma.user.create({
                    data: { myId: 'user1', email: 'user1@abc.com' },
                });

                r = await handler({
                    method: 'post',
                    path: '/user/user1/relationships/posts',
                    query: {},
                    requestBody: { data: [{ type: 'post', id: 1 }] },
                    prisma,
                });

                expect(r.status).toBe(404);
            });
        });

        describe('PUT', () => {
            it('updates an item if it exists', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                    },
                });
                await prisma.post.create({
                    data: { id: 1, title: 'Post1' },
                });
                await prisma.post.create({
                    data: { id: 2, title: 'Post2' },
                });

                const r = await handler({
                    method: 'put',
                    path: '/user/user1',
                    query: {},
                    requestBody: {
                        data: {
                            type: 'user',
                            attributes: { email: 'user2@abc.com' },
                            relationships: {
                                posts: {
                                    data: [
                                        { type: 'post', id: 1 },
                                        { type: 'post', id: 2 },
                                    ],
                                },
                            },
                        },
                    },
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/user/user1',
                    },
                    data: {
                        type: 'user',
                        id: 'user1',
                        attributes: {
                            email: 'user2@abc.com',
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
                                    { type: 'post', id: 1 },
                                    { type: 'post', id: 2 },
                                ],
                            },
                        },
                    },
                });
            });

            it('returns 404 if the user does not exist', async () => {
                const r = await handler({
                    method: 'put',
                    path: '/user/nonexistentuser',
                    query: {},
                    requestBody: {
                        data: {
                            type: 'user',
                            attributes: { email: 'user2@abc.com' },
                        },
                    },
                    prisma,
                });

                expect(r.status).toBe(404);
                expect(r.body).toEqual({
                    errors: [
                        {
                            code: 'not-found',
                            status: 404,
                            title: 'Resource not found',
                        },
                    ],
                });
            });

            it('update a single relation', async () => {
                await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                await prisma.post.create({
                    data: { id: 1, title: 'Post1' },
                });

                const r = await handler({
                    method: 'patch',
                    path: '/post/1/relationships/author',
                    query: {},
                    requestBody: {
                        data: {
                            type: 'user',
                            id: 'user1',
                        },
                    },
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: {
                        version: '1.0',
                    },
                    links: {
                        self: 'http://localhost/api/post/1/relationships/author',
                    },
                    data: {
                        type: 'user',
                        id: 'user1',
                    },
                });
            });

            it('remove a single relation', async () => {
                await prisma.user.create({
                    data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                });

                const r = await handler({
                    method: 'patch',
                    path: '/post/1/relationships/author',
                    query: {},
                    requestBody: { data: null },
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/post/1/relationships/author',
                    },
                    data: null,
                });
            });

            it('update a collection of relations', async () => {
                await prisma.user.create({
                    data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                });
                await prisma.post.create({
                    data: { id: 2, title: 'Post2' },
                });

                const r = await handler({
                    method: 'patch',
                    path: '/user/user1/relationships/posts',
                    query: {},
                    requestBody: {
                        data: [{ type: 'post', id: 2 }],
                    },
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/user/user1/relationships/posts',
                    },
                    data: [{ type: 'post', id: 2 }],
                });
            });

            it('update a collection of relations to empty', async () => {
                await prisma.user.create({
                    data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                });

                const r = await handler({
                    method: 'patch',
                    path: '/user/user1/relationships/posts',
                    query: {},
                    requestBody: { data: [] },
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    links: {
                        self: 'http://localhost/api/user/user1/relationships/posts',
                    },
                    data: [],
                });
            });

            it('update relation for nonexistent entity', async () => {
                let r = await handler({
                    method: 'patch',
                    path: '/post/1/relationships/author',
                    query: {},
                    requestBody: {
                        data: {
                            type: 'user',
                            id: 'user1',
                        },
                    },
                    prisma,
                });
                expect(r.status).toBe(404);

                await prisma.post.create({
                    data: { id: 1, title: 'Post1' },
                });

                r = await handler({
                    method: 'patch',
                    path: '/post/1/relationships/author',
                    query: {},
                    requestBody: {
                        data: {
                            type: 'user',
                            id: 'user1',
                        },
                    },
                    prisma,
                });

                expect(r.status).toBe(404);
            });
        });

        describe('DELETE', () => {
            it('deletes an item if it exists', async () => {
                // Create a user first
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                    },
                });

                const r = await handler({
                    method: 'delete',
                    path: '/user/user1',
                    prisma,
                });

                expect(r.status).toBe(204);
                expect(r.body).toBeUndefined();
            });

            it('returns 404 if the user does not exist', async () => {
                const r = await handler({
                    method: 'delete',
                    path: '/user/nonexistentuser',
                    prisma,
                });

                expect(r.status).toBe(404);
                expect(r.body).toEqual({
                    errors: [
                        {
                            code: 'not-found',
                            status: 404,
                            title: 'Resource not found',
                        },
                    ],
                });
            });

            it('delete single relation disallowed', async () => {
                await prisma.user.create({
                    data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                });

                const r = await handler({
                    method: 'delete',
                    path: '/post/1/relationships/author',
                    query: {},
                    prisma,
                });

                expect(r.status).toBe(400);
                expect(r.body).toMatchObject({
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-verb',
                            title: 'The HTTP verb is not supported',
                        },
                    ],
                });
            });

            it('delete a collection of relations', async () => {
                await prisma.user.create({
                    data: {
                        myId: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: [
                                { id: 1, title: 'Post1' },
                                { id: 2, title: 'Post2' },
                            ],
                        },
                    },
                });

                const r = await handler({
                    method: 'delete',
                    path: '/user/user1/relationships/posts',
                    query: {},
                    requestBody: {
                        data: [{ type: 'post', id: 1 }],
                    },
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: {
                        version: '1.0',
                    },
                    links: {
                        self: 'http://localhost/api/user/user1/relationships/posts',
                    },
                    data: [{ type: 'post', id: 2 }],
                });
            });

            it('delete relations for nonexistent entity', async () => {
                const r = await handler({
                    method: 'delete',
                    path: '/user/user1/relationships/posts',
                    query: {},
                    requestBody: {
                        data: [{ type: 'post', id: 1 }],
                    },
                    prisma,
                });
                expect(r.status).toBe(404);
            });
        });
    });
});
