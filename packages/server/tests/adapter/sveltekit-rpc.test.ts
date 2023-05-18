/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />
import { loadSchema } from '@zenstackhq/testtools';
import { SvelteKitHandler } from '../../src/sveltekit';
import { schema, makeUrl } from '../utils';
import 'isomorphic-fetch';
import superjson from 'superjson';

describe('SvelteKit adapter tests', () => {
    it('run hooks regular json', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const handler = SvelteKitHandler({ prefix: '/api', getPrisma: () => prisma, zodSchemas });

        let r = await handler(makeRequest('GET', makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } })));
        expect(r.status).toBe(200);
        expect(await unmarshal(r)).toHaveLength(0);

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
        // console.log(JSON.stringify(await r.json(), null, 2));
        expect(r.status).toBe(201);
        expect(await unmarshal(r)).toMatchObject({
            email: 'user1@abc.com',
            posts: expect.arrayContaining([
                expect.objectContaining({ title: 'post1' }),
                expect.objectContaining({ title: 'post2' }),
            ]),
        });

        r = await handler(makeRequest('GET', makeUrl('/api/post/findMany')));
        expect(r.status).toBe(200);
        expect(await unmarshal(r)).toHaveLength(2);

        r = await handler(makeRequest('GET', makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } })));
        expect(r.status).toBe(200);
        expect(await unmarshal(r)).toHaveLength(1);

        r = await handler(
            makeRequest('PUT', '/api/user/update', { where: { id: 'user1' }, data: { email: 'user1@def.com' } })
        );
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).email).toBe('user1@def.com');

        r = await handler(makeRequest('GET', makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } })));
        expect(r.status).toBe(200);
        expect(await unmarshal(r)).toBe(1);

        r = await handler(makeRequest('GET', makeUrl('/api/post/aggregate', { _sum: { viewCount: true } })));
        expect(r.status).toBe(200);
        expect((await unmarshal(r))._sum.viewCount).toBe(3);

        r = await handler(
            makeRequest('GET', makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }))
        );
        expect(r.status).toBe(200);
        expect(await unmarshal(r)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await handler(makeRequest('DELETE', makeUrl('/api/user/deleteMany', { where: { id: 'user1' } })));
        expect(r.status).toBe(200);
        expect((await unmarshal(r)).count).toBe(1);
    });

    it('run hooks superjson', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const handler = SvelteKitHandler({ prefix: '/api', getPrisma: () => prisma, zodSchemas, useSuperJson: true });

        let r = await handler(
            makeRequest('GET', makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } }, true))
        );
        expect(r.status).toBe(200);
        expect(await unmarshal(r, true)).toHaveLength(0);

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
        // console.log(JSON.stringify(await r.json(), null, 2));
        expect(r.status).toBe(201);
        expect(await unmarshal(r, true)).toMatchObject({
            email: 'user1@abc.com',
            posts: expect.arrayContaining([
                expect.objectContaining({ title: 'post1' }),
                expect.objectContaining({ title: 'post2' }),
            ]),
        });

        r = await handler(makeRequest('GET', makeUrl('/api/post/findMany', undefined)));
        expect(r.status).toBe(200);
        expect(await unmarshal(r, true)).toHaveLength(2);

        r = await handler(makeRequest('GET', makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } }, true)));
        expect(r.status).toBe(200);
        expect(await unmarshal(r, true)).toHaveLength(1);

        r = await handler(
            makeRequest('PUT', '/api/user/update', { where: { id: 'user1' }, data: { email: 'user1@def.com' } })
        );
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).email).toBe('user1@def.com');

        r = await handler(makeRequest('GET', makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } }, true)));
        expect(r.status).toBe(200);
        expect(await unmarshal(r, true)).toBe(1);

        r = await handler(makeRequest('GET', makeUrl('/api/post/aggregate', { _sum: { viewCount: true } }, true)));
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true))._sum.viewCount).toBe(3);

        r = await handler(
            makeRequest('GET', makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }, true))
        );
        expect(r.status).toBe(200);
        expect(await unmarshal(r, true)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await handler(makeRequest('DELETE', makeUrl('/api/user/deleteMany', { where: { id: 'user1' } }, true)));
        expect(r.status).toBe(200);
        expect((await unmarshal(r, true)).count).toBe(1);
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
