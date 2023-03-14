/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import { handleRequest } from '../src/openapi';

const schema = `
model User {
    id String @id @default(cuid())
    email String @unique
    posts Post[]
}

model Post {
    id String @id @default(cuid())
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
}
`;

describe('OpenAPI server tests', () => {
    it('crud', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        let r = await handleRequest({
            method: 'get',
            path: '/api/post/findMany',
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(0);

        r = await handleRequest({
            method: 'post',
            path: '/api/user/create',
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
            zodSchemas,
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
            path: '/api/post/findMany',
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(2);

        r = await handleRequest({
            method: 'get',
            path: '/api/post/findMany',
            query: { q: JSON.stringify({ where: { viewCount: { gt: 1 } } }) },
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(1);

        r = await handleRequest({
            method: 'put',
            path: '/api/user/update',
            requestBody: { where: { id: 'user1' }, data: { email: 'user1@def.com' } },
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(200);
        expect((r.body as any).email).toBe('user1@def.com');

        r = await handleRequest({
            method: 'get',
            path: '/api/post/count',
            query: { q: JSON.stringify({ where: { viewCount: { gt: 1 } } }) },
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(200);
        expect(r.body).toBe(1);

        r = await handleRequest({
            method: 'get',
            path: '/api/post/aggregate',
            query: { q: JSON.stringify({ _sum: { viewCount: true } }) },
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(200);
        expect((r.body as any)._sum.viewCount).toBe(3);

        r = await handleRequest({
            method: 'get',
            path: '/api/post/groupBy',
            query: { q: JSON.stringify({ by: ['published'], _sum: { viewCount: true } }) },
            prisma,
            zodSchemas,
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
            path: '/api/user/deleteMany',
            query: { q: JSON.stringify({ where: { id: 'user1' } }) },
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(200);
        expect((r.body as any).count).toBe(1);
    });

    it('validation error', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        let r = await handleRequest({
            method: 'get',
            path: '/api/post/findUnique',
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('Validation error');
        expect((r.body as any).message).toContain('where');

        r = await handleRequest({
            method: 'post',
            path: '/api/post/create',
            requestBody: { data: {} },
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(400);
        expect((r.body as any).message).toContain('Validation error');
        expect((r.body as any).message).toContain('data.title');
    });
});
