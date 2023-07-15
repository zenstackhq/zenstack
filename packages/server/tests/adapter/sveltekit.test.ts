/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />
import { loadSchema } from '@zenstackhq/testtools';
import { SvelteKitHandler } from '../../src/sveltekit';
import { schema, makeUrl } from '../utils';
import 'isomorphic-fetch';
import superjson from 'superjson';
import Rest from '../../src/api/rest';

describe('SvelteKit adapter tests - rpc handler', () => {
    it('run hooks regular json', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const handler = SvelteKitHandler({ prefix: '/api', getPrisma: () => prisma, zodSchemas });

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

    it('run hooks superjson', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const handler = SvelteKitHandler({ prefix: '/api', getPrisma: () => prisma, zodSchemas, useSuperJson: true });

        let r = await handler(
            makeRequest('GET', makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } }, true))
        );
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).data).toHaveLength(0);

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
        expect((await unmarshal(r, true)).data).toMatchObject({
            email: 'user1@abc.com',
            posts: expect.arrayContaining([
                expect.objectContaining({ title: 'post1' }),
                expect.objectContaining({ title: 'post2' }),
            ]),
        });

        r = await handler(makeRequest('GET', makeUrl('/api/post/findMany', undefined)));
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).data).toHaveLength(2);

        r = await handler(makeRequest('GET', makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } }, true)));
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).data).toHaveLength(1);

        r = await handler(
            makeRequest('PUT', '/api/user/update', { where: { id: 'user1' }, data: { email: 'user1@def.com' } })
        );
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).data.email).toBe('user1@def.com');

        r = await handler(makeRequest('GET', makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } }, true)));
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).data).toBe(1);

        r = await handler(makeRequest('GET', makeUrl('/api/post/aggregate', { _sum: { viewCount: true } }, true)));
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).data._sum.viewCount).toBe(3);

        r = await handler(
            makeRequest('GET', makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }, true))
        );
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await handler(makeRequest('DELETE', makeUrl('/api/user/deleteMany', { where: { id: 'user1' } }, true)));
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).data.count).toBe(1);
    });
});

describe('SvelteKit adapter tests - rest handler', () => {
    it('run hooks', async () => {
        const { prisma, modelMeta, zodSchemas } = await loadSchema(schema);

        const handler = SvelteKitHandler({
            prefix: '/api',
            getPrisma: () => prisma,
            handler: Rest({ endpoint: 'http://localhost/api' }),
            modelMeta,
            zodSchemas,
        });

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

        r = await handler(makeRequest('DELETE', makeUrl(makeUrl('/api/user/user1'))));
        expect(r.status).toBe(204);
        expect(await prisma.user.findMany()).toHaveLength(0);
    });
});

function makeRequest(method: string, path: string, body?: any) {
    const payload = body ? JSON.stringify(body) : undefined;
    return {
        event: {
            request: new Request(`http://localhost${path}`, { method, body: payload }),
            url: new URL(`http://localhost${path}`),
        } as any,
        resolve: async () => {
            throw new Error('should not be called');
        },
    };
}

async function unmarshal(r: Response, useSuperJson = false) {
    const text = await r.text();
    return (useSuperJson ? superjson.parse(text) : JSON.parse(text)) as any;
}
