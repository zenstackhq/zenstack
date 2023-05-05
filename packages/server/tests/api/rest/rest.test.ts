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
                    data: { myId: 'user1', email: 'user1@abc.com' },
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
                    data: { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
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
            it('creates an item', async () => {
                const r = await handler.handleRequest({
                    method: 'post',
                    path: '/user',
                    query: {},
                    requestBody: {
                        id: 'user1',
                        email: 'user1@abc.com',
                    },
                    prisma,
                });

                expect(r.status).toBe(201);
                expect(r.body).toEqual({
                    jsonapi: { version: '1.0' },
                    data: { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
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
