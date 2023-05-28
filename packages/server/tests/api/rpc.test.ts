/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import RPCAPIHandler from '../../src/api/rpc';
import { schema } from '../utils';
import { ModelZodSchema } from '@zenstackhq/runtime/zod';

describe('OpenAPI server tests', () => {
    let prisma: any;
    let zodSchemas: any;

    beforeAll(async () => {
        const params = await loadSchema(schema);
        prisma = params.prisma;
        zodSchemas = params.zodSchemas;
    });

    it('crud', async () => {
        const handleRequest = makeHandler();

        let r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(0);

        r = await handleRequest({
            method: 'post',
            path: '/user/create',
            query: {},
            requestBody: {
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
            prisma,
        });
        expect(r.status).toBe(201);
        expect(r.body).toEqual(
            expect.objectContaining({
                email: 'user1@abc.com',
                posts: expect.arrayContaining([
                    expect.objectContaining({ title: 'post1' }),
                    expect.objectContaining({ title: 'post2' }),
                ]),
            })
        );
        const data: any = r.body;
        expect(data.zenstack_guard).toBeUndefined();
        expect(data.zenstack_transaction).toBeUndefined();
        expect(data.posts[0].zenstack_guard).toBeUndefined();
        expect(data.posts[0].zenstack_transaction).toBeUndefined();

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(2);

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ where: { viewCount: { gt: 1 } } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(1);

        r = await handleRequest({
            method: 'put',
            path: '/user/update',
            requestBody: { where: { id: 'user1' }, data: { email: 'user1@def.com' } },
            prisma,
        });
        expect(r.status).toBe(200);
        expect((r.body as any).email).toBe('user1@def.com');

        r = await handleRequest({
            method: 'get',
            path: '/post/count',
            query: { q: JSON.stringify({ where: { viewCount: { gt: 1 } } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.body).toBe(1);

        r = await handleRequest({
            method: 'get',
            path: '/post/aggregate',
            query: { q: JSON.stringify({ _sum: { viewCount: true } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect((r.body as any)._sum.viewCount).toBe(3);

        r = await handleRequest({
            method: 'get',
            path: '/post/groupBy',
            query: { q: JSON.stringify({ by: ['published'], _sum: { viewCount: true } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.body).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await handleRequest({
            method: 'delete',
            path: '/user/deleteMany',
            query: { q: JSON.stringify({ where: { id: 'user1' } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect((r.body as any).count).toBe(1);
    });

    it('validation error', async () => {
        let handleRequest = makeHandler();

        // without validation
        let r = await handleRequest({
            method: 'get',
            path: '/post/findUnique',
            prisma,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('Argument where is missing');

        handleRequest = makeHandler(zodSchemas);

        // with validation
        r = await handleRequest({
            method: 'get',
            path: '/post/findUnique',
            prisma,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('Validation error');
        expect((r.body as any).message).toContain('where');

        r = await handleRequest({
            method: 'post',
            path: '/post/create',
            requestBody: { data: {} },
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('Validation error');
        expect((r.body as any).message).toContain('data.title');
    });

    it('invalid path or args', async () => {
        const handleRequest = makeHandler();
        let r = await handleRequest({
            method: 'get',
            path: '/post/',
            prisma,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('invalid request path');

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany/abc',
            prisma,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('invalid request path');

        r = await handleRequest({
            method: 'get',
            path: '/post/findUnique',
            query: { q: 'abc' },
            prisma,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('query param must contain valid JSON');

        r = await handleRequest({
            method: 'delete',
            path: '/post/deleteMany',
            query: { q: 'abc' },
            prisma,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('query param must contain valid JSON');
    });
});

function makeHandler(zodSchemas?: ModelZodSchema) {
    const _handler = RPCAPIHandler();
    return async (args: any) => {
        return _handler({ ...args, url: new URL(`http://localhost/${args.path}`), zodSchemas });
    };
}
