/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import { handleRequest } from '../src/api';
import { schema } from './utils';

let prisma: any;
let zodSchemas: any;

describe('REST server tests', () => {
    beforeAll(async () => {
        const params = await loadSchema(schema);

        prisma = params.prisma;
        zodSchemas = params.zodSchemas;
    });

    beforeEach(async () => {
        await prisma.user.deleteMany();
    });

    describe('CRUD', () => {
        describe('GET', () => {
            it('returns an empty array when no item exists', async () => {
                const r = await handleRequest({
                    method: 'get',
                    path: '/user',
                    prisma,
                    zodSchemas,
                });
                expect(r.status).toBe(200);
                expect(r.body).toEqual({
                    data: [],
                    jsonapi: {
                        version: '1.0',
                    },
                });
            });

            it('returns all items when there are some in the database', async () => {
                // Create users first
                await prisma.user.create({
                    data: { id: 'user1', email: 'user1@abc.com' },
                });
                await prisma.user.create({
                    data: { id: 'user2', email: 'user2@abc.com' },
                });

                const r = await handleRequest({
                    method: 'get',
                    path: '/user',
                    prisma,
                    zodSchemas,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: { version: '1.0' },
                    data: [
                        { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
                        { type: 'user', id: 'user2', attributes: { email: 'user2@abc.com' } },
                    ],
                });
            });

            it('returns a single item when the ID is specified', async () => {
                // Create a user first
                await prisma.user.create({
                    data: { id: 'user1', email: 'user1@abc.com' },
                });

                const r = await handleRequest({
                    method: 'get',
                    path: '/user/user1',
                    prisma,
                    zodSchemas,
                });

                expect(r.status).toBe(200);
                expect(r.body).toMatchObject({
                    jsonapi: { version: '1.0' },
                    data: { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
                });
            });

            it('returns 404 if the specified ID does not exist', async () => {
                const r = await handleRequest({
                    method: 'get',
                    path: '/user/nonexistentuser',
                    prisma,
                    zodSchemas,
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
                const r = await handleRequest({
                    method: 'post',
                    path: '/user',
                    query: {},
                    requestBody: {
                        id: 'user1',
                        email: 'user1@abc.com',
                    },
                    prisma,
                    zodSchemas,
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

                const r = await handleRequest({
                    method: 'put',
                    path: '/user/user1',
                    query: {},
                    requestBody: {
                        email: 'newemail@abc.com',
                    },
                    prisma,
                    zodSchemas,
                });

                expect(r.status).toBe(200);
                expect(r.body).toEqual({
                    jsonapi: { version: '1.0' },
                    data: { type: 'user', id: 'user1', attributes: { email: 'newemail@abc.com' } },
                });
            });

            it('returns 404 if the user does not exist', async () => {
                const r = await handleRequest({
                    method: 'put',
                    path: '/user/nonexistentuser',
                    query: {},
                    requestBody: {
                        email: 'nonexistent@abc.com',
                    },
                    prisma,
                    zodSchemas,
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

                const r = await handleRequest({
                    method: 'delete',
                    path: '/user/user1',
                    prisma,
                    zodSchemas,
                });

                expect(r.status).toBe(204);
                expect(r.body).toBeNull();
            });

            it('returns 404 if the user does not exist', async () => {
                const r = await handleRequest({
                    method: 'delete',
                    path: '/user/nonexistentuser',
                    prisma,
                    zodSchemas,
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
