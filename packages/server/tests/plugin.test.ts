/// <reference types="@types/jest" />

import fastify from 'fastify';
import { ZenStackFastifyPlugin } from '../src/fastify';
import { loadSchema } from '@zenstackhq/testtools';

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

function makeUrl(path: string, q?: object) {
    return q ? `${path}?q=${encodeURIComponent(JSON.stringify(q))}` : path;
}

describe('Fastify plugin tests', () => {
    it('run plugin', async () => {
        const { prisma } = await loadSchema(schema);

        const app = fastify();
        app.register(ZenStackFastifyPlugin, { prefix: '/api', getPrisma: () => prisma });

        let r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json()).toHaveLength(0);

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
        expect(r.json()).toEqual(
            expect.objectContaining({
                email: 'user1@abc.com',
                posts: expect.arrayContaining([
                    expect.objectContaining({ title: 'post1' }),
                    expect.objectContaining({ title: 'post2' }),
                ]),
            })
        );

        // aux fields should have been removed
        const data = r.json();
        expect(data.zenstack_guard).toBeUndefined();
        expect(data.zenstack_transaction).toBeUndefined();
        expect(data.posts[0].zenstack_guard).toBeUndefined();
        expect(data.posts[0].zenstack_transaction).toBeUndefined();

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany'),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json()).toHaveLength(2);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json()).toHaveLength(1);

        r = await app.inject({
            method: 'PUT',
            url: '/api/user/update',
            payload: { where: { id: 'user1' }, data: { email: 'user1@def.com' } },
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().email).toBe('user1@def.com');

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json()).toBe(1);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/aggregate', { _sum: { viewCount: true } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json()._sum.viewCount).toBe(3);

        r = await app.inject({
            method: 'GET',
            url: makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }),
        });
        expect(r.statusCode).toBe(200);
        expect(r.json()).toEqual(
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
        expect(r.json().count).toBe(1);
    });
});
