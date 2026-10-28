import { createTestClient } from '@zenstackhq/testtools';
import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ZenStackFastifyPlugin } from '../../src/adapter/fastify';
import { RestApiHandler, RPCApiHandler } from '../../src/api';
import { makeUrl, schema } from '../utils';

describe('Fastify adapter tests - rpc handler', () => {
    it('properly handles requests', async () => {
        const client = await createTestClient(schema);

        const app = fastify();
        app.register(ZenStackFastifyPlugin, {
            prefix: '/api',
            getClient: () => client,
            apiHandler: new RPCApiHandler({ schema: client.schema }),
        });

        let r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data).toHaveLength(0);

        r = await app.inject({
            method: 'POST',
            url: '/api/user/create',
            payload: {
                data: {
                    include: { posts: true },
                    data: {
                        id: 'user1',
                        email: 'user1@abc.com',
                        posts: {
                            create: [
                                { title: 'post1', published: true, viewCount: 1 },
                                { title: 'post2', published: false, viewCount: 2 },
                            ],
                        },
                    },
                },
            },
        });
        expect(r.statusCode).toBe(201);
        const data = r.json().data;
        expect(data).toEqual(
            expect.objectContaining({
                email: 'user1@abc.com',
                posts: expect.arrayContaining([
                    expect.objectContaining({ title: 'post1' }),
                    expect.objectContaining({ title: 'post2' }),
                ]),
            }),
        );

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany'),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data).toHaveLength(2);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data).toHaveLength(1);

        r = await app.inject({
            method: 'PUT',
            url: '/api/user/update',
            payload: { data: { where: { id: 'user1' }, data: { email: 'user1@def.com' } } },
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data.email).toBe('user1@def.com');

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data).toBe(1);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/aggregate', { _sum: { viewCount: true } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data._sum.viewCount).toBe(3);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ]),
        );

        r = await app.inject({
            method: 'DELETE',
            url: makeUrl('/api/user/deleteMany', { where: { id: 'user1' } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data.count).toBe(1);
    });

    it('properly handles invalid path or args', async () => {
        const client = await createTestClient(schema);

        const app = fastify();
        app.register(ZenStackFastifyPlugin, {
            prefix: '/api',
            getClient: () => client,
            apiHandler: new RPCApiHandler({ schema: client.schema }),
        });

        let r = await app.inject({
            method: 'GET',
            url: '/api/post/',
        });
        expect(r.statusCode).toBe(400);

        r = await app.inject({
            method: 'GET',
            url: '/api/post/findMany/abc',
        });
        expect(r.statusCode).toBe(400);

        r = await app.inject({
            method: 'GET',
            url: '/api/post/findMany?data=abc',
        });
        expect(r.statusCode).toBe(400);
    });
});

describe('Fastify adapter tests - rest handler', () => {
    it('properly handles requests', async () => {
        const client = await createTestClient(schema);

        const app = fastify();
        app.register(ZenStackFastifyPlugin, {
            prefix: '/api',
            getClient: () => client,
            apiHandler: new RestApiHandler({ schema: client.$schema, endpoint: 'http://localhost/api' }),
        });

        let r = await app.inject({
            method: 'GET',
            url: '/api/post/1',
        });
        expect(r.statusCode).toBe(404);

        r = await app.inject({
            method: 'POST',
            url: '/api/user',
            payload: {
                data: {
                    type: 'User',
                    attributes: {
                        id: 'user1',
                        email: 'user1@abc.com',
                    },
                },
            },
        });
        expect(r.statusCode).toBe(201);
        expect(r.json()).toMatchObject({
            jsonapi: { version: '1.1' },
            data: { type: 'User', id: 'user1', attributes: { email: 'user1@abc.com' } },
        });

        r = await app.inject({ method: 'GET', url: '/api/user?filter[id]=user1' });
        expect(r.json().data).toHaveLength(1);

        r = await app.inject({ method: 'GET', url: '/api/user?filter[id]=user2' });
        expect(r.json().data).toHaveLength(0);

        r = await app.inject({ method: 'GET', url: '/api/user?filter[id]=user1&filter[email]=xyz' });
        expect(r.json().data).toHaveLength(0);

        r = await app.inject({
            method: 'PUT',
            url: '/api/user/user1',
            payload: { data: { type: 'User', attributes: { email: 'user1@def.com' } } },
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data.attributes.email).toBe('user1@def.com');

        r = await app.inject({ method: 'DELETE', url: '/api/user/user1' });
        expect(r.statusCode).toBe(200);
        expect(await client.user.findMany()).toHaveLength(0);
    });
});
