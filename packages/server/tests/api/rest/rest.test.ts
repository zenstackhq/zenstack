/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import RequestHandler from '../../../src/api/rest';
import { ModelMeta } from '@zenstackhq/runtime/enhancements/types';

let prisma: any;
let zodSchemas: any;
let modelMeta: ModelMeta;
let handler: RequestHandler;

export const schema = `
model User {
    myId String @id @default(cuid())
    createdAt DateTime @default (now())
    updatedAt DateTime @updatedAt
    email String @unique
    posts Post[]
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
}
`;

describe('REST server tests', () => {
    beforeAll(async () => {
        const params = await loadSchema(schema);

        prisma = params.prisma;
        zodSchemas = params.zodSchemas;
        modelMeta = params.modelMeta;
        handler = new RequestHandler({ zodSchemas, modelMeta, endpointBase: 'http://localhost/api' });
    });

    beforeEach(async () => {
        await prisma.user.deleteMany();
    });

    describe('CRUD', () => {
        describe('GET', () => {
            it('returns an empty array when no item exists', async () => {
                const r = await handler.handleRequest({
                    method: 'get',
                    path: '/user',
                    prisma,
                });
                console.log(JSON.stringify(r, null, 4));
                expect(r.status).toBe(200);
                expect(r.body).toEqual({
                    data: [],
                    jsonapi: {
                        version: '1.0',
                    },
                    links: {
                        self: 'http://localhost/api/user/',
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
                            create: { title: 'Post1' },
                        },
                    },
                });

                const r = await handler.handleRequest({
                    method: 'get',
                    path: '/user',
                    prisma,
                });
                console.log(JSON.stringify(r, null, 4));

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: { version: '1.0' },
                    links: {
                        self: 'http://localhost/api/user/',
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
                                    data: [
                                        {
                                            type: 'post',
                                            id: 2,
                                        },
                                    ],
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

                const r = await handler.handleRequest({
                    method: 'get',
                    path: '/user/user1',
                    prisma,
                });
                console.log(JSON.stringify(r, null, 4));

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: { version: '1.0' },
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
                                data: [
                                    {
                                        type: 'post',
                                        id: 1,
                                    },
                                ],
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

                const r = await handler.handleRequest({
                    method: 'get',
                    path: '/user/user1/posts',
                    prisma,
                });
                console.log(JSON.stringify(r, null, 4));

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: {
                        version: '1.0',
                    },
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

                const r = await handler.handleRequest({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
                    prisma,
                });
                console.log(JSON.stringify(r, null, 4));

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: {
                        version: '1.0',
                    },
                    links: {
                        self: 'http://localhost/api/user/user1/relationships/posts',
                    },
                    data: [
                        {
                            type: 'post',
                            id: 1,
                        },
                    ],
                });
            });

            it('returns 404 if the specified ID does not exist', async () => {
                const r = await handler.handleRequest({
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
        });

        describe('POST', () => {
            it('creates an item without relation', async () => {
                const r = await handler.handleRequest({
                    method: 'post',
                    path: '/user',
                    query: {},
                    requestBody: {
                        data: { type: 'user', attributes: { myId: 'user1', email: 'user1@abc.com' } },
                    },
                    prisma,
                });
                console.log(JSON.stringify(r, null, 4));

                expect(r.status).toBe(201);
                expect(r.body).toEqual({
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

                const r = await handler.handleRequest({
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
                console.log(JSON.stringify(r, null, 4));

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
                                    {
                                        type: 'post',
                                        id: 1,
                                    },
                                    {
                                        type: 'post',
                                        id: 2,
                                    },
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

                const r = await handler.handleRequest({
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
                console.log(JSON.stringify(r, null, 4));

                expect(r.status).toBe(201);
                expect(r.body).toMatchObject({
                    jsonapi: {
                        version: '1.0',
                    },
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
                                data: {
                                    type: 'user',
                                    id: 'user1',
                                },
                            },
                        },
                    },
                });
            });

            it('create single relation', async () => {
                await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                await prisma.post.create({
                    data: { id: 1, title: 'Post1' },
                });

                const r = await handler.handleRequest({
                    method: 'post',
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
                console.log(JSON.stringify(r, null, 4));

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

            it('create a collection of relations', async () => {
                await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                await prisma.post.create({
                    data: { id: 1, title: 'Post1' },
                });
                await prisma.post.create({
                    data: { id: 2, title: 'Post2' },
                });

                const r = await handler.handleRequest({
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
                console.log(JSON.stringify(r, null, 4));

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: {
                        version: '1.0',
                    },
                    links: {
                        self: 'http://localhost/api/user/user1/relationships/posts',
                    },
                    data: [
                        {
                            type: 'post',
                            id: 1,
                        },
                        {
                            type: 'post',
                            id: 2,
                        },
                    ],
                });
            });
        });

        describe('PUT', () => {
            it('updates an item if it exists', async () => {
                // Create a user first
                await prisma.user.create({
                    data: {
                        id: 'user1',
                        email: 'user1@abc.com',
                    },
                });

                const r = await handler.handleRequest({
                    method: 'put',
                    path: '/user/user1',
                    query: {},
                    requestBody: {
                        email: 'newemail@abc.com',
                    },
                    prisma,
                });

                expect(r.status).toBe(200);
                expect(r.body).toEqual({
                    jsonapi: { version: '1.0' },
                    data: { type: 'user', id: 'user1', attributes: { email: 'newemail@abc.com' } },
                });
            });

            it('returns 404 if the user does not exist', async () => {
                const r = await handler.handleRequest({
                    method: 'put',
                    path: '/user/nonexistentuser',
                    query: {},
                    requestBody: {
                        email: 'nonexistent@abc.com',
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
        });

        describe('DELETE', () => {
            it('deletes an item if it exists', async () => {
                // Create a user first
                await prisma.user.create({
                    data: {
                        id: 'user1',
                        email: 'user1@abc.com',
                    },
                });

                const r = await handler.handleRequest({
                    method: 'delete',
                    path: '/user/user1',
                    prisma,
                });

                expect(r.status).toBe(204);
                expect(r.body).toBeNull();
            });

            it('returns 404 if the user does not exist', async () => {
                const r = await handler.handleRequest({
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
        });
    });
});
