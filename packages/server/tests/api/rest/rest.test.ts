/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema, run } from '@zenstackhq/testtools';
import { ModelMeta } from '@zenstackhq/runtime/enhancements/types';
import makeHandler from '../../../src/api/rest';
import { HandleRequestFn } from '../../../src/api/types';

let prisma: any;
let zodSchemas: any;
let modelMeta: ModelMeta;
let handler: HandleRequestFn;

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
        handler = makeHandler({ zodSchemas, modelMeta, endpoint: 'http://localhost/api' });
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
                expect(r.body).toEqual({
                    data: [],
                    jsonapi: {
                        version: '1.0',
                    },
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
                            create: { title: 'Post1' },
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
                    jsonapi: { version: '1.0' },
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

                const r = await handler({
                    method: 'get',
                    path: '/user/user1',
                    prisma,
                });

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

                const r = await handler({
                    method: 'get',
                    path: '/user/user1/posts',
                    prisma,
                });

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

                const r = await handler({
                    method: 'get',
                    path: '/user/user1/relationships/posts',
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
                    data: [
                        {
                            type: 'post',
                            id: 1,
                        },
                    ],
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
                        data: {
                            type: 'user',
                            id: 'user1',
                        },
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
                console.log(JSON.stringify(r, null, 4));

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
                    jsonapi: {
                        version: '1.0',
                    },
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
                    jsonapi: {
                        version: '1.0',
                    },
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
                    jsonapi: {
                        version: '1.0',
                    },
                    links: {
                        self: 'http://localhost/api/user/user1/relationships/posts',
                    },
                    data: [
                        {
                            type: 'post',
                            id: 2,
                        },
                    ],
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
                    jsonapi: {
                        version: '1.0',
                    },
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
                console.log(JSON.stringify(r, null, 4));

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
                    data: [
                        {
                            type: 'post',
                            id: 2,
                        },
                    ],
                });
            });

            it('delete relations for nonexistent entity', async () => {
                const r = await handler({
                    method: 'delete',
                    path: '/user/user1/relationships/posts',
                    query: {},
                    requestBody: {
                        data: [
                            {
                                type: 'post',
                                id: 1,
                            },
                        ],
                    },
                    prisma,
                });
                expect(r.status).toBe(404);
            });
        });
    });
});
