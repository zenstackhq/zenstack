/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />
import { loadSchema } from '@zenstackhq/testtools';
import 'isomorphic-fetch';
import path from 'path';
import superjson from 'superjson';
import Rest from '../../src/api/rest';
import { createElysiaHandler } from '../../src/elysia';
import { makeUrl, schema } from '../utils';
import { Elysia } from 'elysia';

describe('Elysia adapter tests - rpc handler', () => {
    it('run hooks regular json', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const handler = await createElysiaApp(
            createElysiaHandler({ getPrisma: () => prisma, zodSchemas, basePath: '/api' })
        );

        let r = await handler(makeRequest('GET', makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } })));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data).toHaveLength(0);

        r = await handler(
            makeRequest('POST', '/api/user/create', {
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
            })
        );
        expect(r.status).toBe(201);
        expect((await unmarshal(r)).data).toMatchObject({
            email: 'user1@abc.com',
            posts: expect.arrayContaining([
                expect.objectContaining({ title: 'post1' }),
                expect.objectContaining({ title: 'post2' }),
            ]),
        });

        r = await handler(makeRequest('GET', makeUrl('/api/post/findMany')));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data).toHaveLength(2);

        r = await handler(makeRequest('GET', makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } })));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data).toHaveLength(1);

        r = await handler(
            makeRequest('PUT', '/api/user/update', { where: { id: 'user1' }, data: { email: 'user1@def.com' } })
        );
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data.email).toBe('user1@def.com');

        r = await handler(makeRequest('GET', makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } })));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data).toBe(1);

        r = await handler(makeRequest('GET', makeUrl('/api/post/aggregate', { _sum: { viewCount: true } })));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data._sum.viewCount).toBe(3);

        r = await handler(
            makeRequest('GET', makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }))
        );
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await handler(makeRequest('DELETE', makeUrl('/api/user/deleteMany', { where: { id: 'user1' } })));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data.count).toBe(1);
    });

    it('custom load path', async () => {
        const { prisma, projectDir } = await loadSchema(schema, { output: './zen' });

        const handler = await createElysiaApp(
            createElysiaHandler({
                getPrisma: () => prisma,
                basePath: '/api',
                modelMeta: require(path.join(projectDir, './zen/model-meta')).default,
                zodSchemas: require(path.join(projectDir, './zen/zod')),
            })
        );

        const r = await handler(
            makeRequest('POST', '/api/user/create', {
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
            })
        );
        expect(r.status).toBe(201);
    });
});

describe('Elysia adapter tests - rest handler', () => {
    it('run hooks', async () => {
        const { prisma, modelMeta, zodSchemas } = await loadSchema(schema);

        const handler = await createElysiaApp(
            createElysiaHandler({
                getPrisma: () => prisma,
                basePath: '/api',
                handler: Rest({ endpoint: 'http://localhost/api' }),
                modelMeta,
                zodSchemas,
            })
        );

        let r = await handler(makeRequest('GET', makeUrl('/api/post/1')));
        expect(r.status).toBe(404);

        r = await handler(
            makeRequest('POST', '/api/user', {
                data: {
                    type: 'user',
                    attributes: { id: 'user1', email: 'user1@abc.com' },
                },
            })
        );
        expect(r.status).toBe(201);
        expect(await unmarshal(r)).toMatchObject({
            data: {
                id: 'user1',
                attributes: {
                    email: 'user1@abc.com',
                },
            },
        });

        r = await handler(makeRequest('GET', makeUrl('/api/user?filter[id]=user1')));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data).toHaveLength(1);

        r = await handler(makeRequest('GET', makeUrl('/api/user?filter[id]=user2')));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data).toHaveLength(0);

        r = await handler(makeRequest('GET', makeUrl('/api/user?filter[id]=user1&filter[email]=xyz')));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data).toHaveLength(0);

        r = await handler(
            makeRequest('PUT', makeUrl('/api/user/user1'), {
                data: { type: 'user', attributes: { email: 'user1@def.com' } },
            })
        );
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).data.attributes.email).toBe('user1@def.com');

        r = await handler(makeRequest('DELETE', makeUrl('/api/user/user1')));
        expect(r.status).toBe(200);
        expect(await prisma.user.findMany()).toHaveLength(0);
    });
});

function makeRequest(method: string, path: string, body?: any) {
    if (body) {
        return new Request(`http://localhost${path}`, {
            method,
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
        });
    } else {
        return new Request(`http://localhost${path}`, { method });
    }
}

async function unmarshal(r: Response, useSuperJson = false) {
    const text = await r.text();
    return (useSuperJson ? superjson.parse(text) : JSON.parse(text)) as any;
}

async function createElysiaApp(middleware: (app: Elysia) => Promise<Elysia>) {
    const app = new Elysia();
    await middleware(app);
    return app.handle;
}
