/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import fastify from 'fastify';
import superjson from 'superjson';
import Rest from '../../src/api/rest';
import RPC from '../../src/api/rpc';
import { ZenStackFastifyPlugin } from '../../src/fastify';
import { makeUrl, schema } from '../utils';

describe('Fastify adapter tests - rpc handler', () => {
    it('run plugin regular json', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const app = fastify();
        app.register(ZenStackFastifyPlugin, {
            prefix: '/api',
            getPrisma: () => prisma,
            zodSchemas,
            handler: RPC(),
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
            })
        );
        // aux fields should have been removed
        expect(data.zenstack_guard).toBeUndefined();
        expect(data.zenstack_transaction).toBeUndefined();
        expect(data.posts[0].zenstack_guard).toBeUndefined();
        expect(data.posts[0].zenstack_transaction).toBeUndefined();

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
            payload: { where: { id: 'user1' }, data: { email: 'user1@def.com' } },
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
            ])
        );

        r = await app.inject({
            method: 'DELETE',
            url: makeUrl('/api/user/deleteMany', { where: { id: 'user1' } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data.count).toBe(1);
    });

    it('invalid path or args', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const app = fastify();
        app.register(ZenStackFastifyPlugin, {
            prefix: '/api',
            getPrisma: () => prisma,
            zodSchemas,
            handler: RPC(),
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
            url: '/api/post/findMany?q=abc',
        });
        expect(r.statusCode).toBe(400);
    });

    it('run plugin superjson', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const app = fastify();
        app.register(ZenStackFastifyPlugin, {
            prefix: '/api',
            getPrisma: () => prisma,
            zodSchemas,
            handler: RPC(),
            useSuperJson: true,
        });

        let r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } }, true),
        });
        expect(r.statusCode).toBe(200);
        expect(unmarshal(r.json()).data).toHaveLength(0);

        r = await app.inject({
            method: 'POST',
            url: '/api/user/create',
            payload: {
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
        });
        expect(r.statusCode).toBe(201);
        const data = unmarshal(r.json()).data;
        expect(data).toEqual(
            expect.objectContaining({
                email: 'user1@abc.com',
                posts: expect.arrayContaining([
                    expect.objectContaining({ title: 'post1' }),
                    expect.objectContaining({ title: 'post2' }),
                ]),
            })
        );
        // aux fields should have been removed
        expect(data.zenstack_guard).toBeUndefined();
        expect(data.zenstack_transaction).toBeUndefined();
        expect(data.posts[0].zenstack_guard).toBeUndefined();
        expect(data.posts[0].zenstack_transaction).toBeUndefined();

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany'),
        });
        expect(r.statusCode).toBe(200);
        expect(unmarshal(r.json()).data).toHaveLength(2);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } }, true),
        });
        expect(r.statusCode).toBe(200);
        expect(unmarshal(r.json()).data).toHaveLength(1);

        r = await app.inject({
            method: 'PUT',
            url: '/api/user/update',
            payload: { where: { id: 'user1' }, data: { email: 'user1@def.com' } },
        });
        expect(r.statusCode).toBe(200);
        expect(unmarshal(r.json()).data.email).toBe('user1@def.com');

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } }, true),
        });
        expect(r.statusCode).toBe(200);
        expect(unmarshal(r.json()).data).toBe(1);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/aggregate', { _sum: { viewCount: true } }, true),
        });
        expect(r.statusCode).toBe(200);
        expect(unmarshal(r.json()).data._sum.viewCount).toBe(3);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }, true),
        });
        expect(r.statusCode).toBe(200);
        expect(unmarshal(r.json()).data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await app.inject({
            method: 'DELETE',
            url: makeUrl('/api/user/deleteMany', { where: { id: 'user1' } }, true),
        });
        expect(r.statusCode).toBe(200);
        expect(unmarshal(r.json()).data.count).toBe(1);
    });
});

function unmarshal(value: any) {
    return superjson.parse(JSON.stringify(value)) as any;
}

describe('Fastify adapter tests - rest handler', () => {
    it('run plugin regular json', async () => {
        const { prisma, zodSchemas, modelMeta } = await loadSchema(schema);

        const app = fastify();
        app.register(ZenStackFastifyPlugin, {
            prefix: '/api',
            getPrisma: () => prisma,
            modelMeta,
            zodSchemas,
            handler: Rest({ endpoint: 'http://localhost/api' }),
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
                    type: 'user',
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
            data: { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
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
            payload: { data: { type: 'user', attributes: { email: 'user1@def.com' } } },
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().data.attributes.email).toBe('user1@def.com');

        r = await app.inject({ method: 'DELETE', url: '/api/user/user1' });
        expect(r.statusCode).toBe(204);
        expect(await prisma.user.findMany()).toHaveLength(0);
    });
});
