/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import bodyParser from 'body-parser';
import express from 'express';
import request from 'supertest';
import { ZenStackMiddleware } from '../../../src/express';
import { makeUrl, schema } from '../../utils';
import Prisma from '../../../src/api/prisma';

describe('Express adapter tests', () => {
    it('run plugin', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use('/api', ZenStackMiddleware({ getPrisma: () => prisma, zodSchemas, api: Prisma }));

        let r = await request(app).get(makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } }));
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(0);

        r = await request(app)
            .post('/api/user/create')
            .send({
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
        // aux fields should have been removed
        const data = r.body;
        expect(data.zenstack_guard).toBeUndefined();
        expect(data.zenstack_transaction).toBeUndefined();
        expect(data.posts[0].zenstack_guard).toBeUndefined();
        expect(data.posts[0].zenstack_transaction).toBeUndefined();

        r = await request(app).get(makeUrl('/api/post/findMany'));
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(2);

        r = await request(app).get(makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } }));
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(1);

        r = await request(app)
            .put('/api/user/update')
            .send({ where: { id: 'user1' }, data: { email: 'user1@def.com' } });
        expect(r.status).toBe(200);
        expect(r.body.email).toBe('user1@def.com');

        r = await request(app).get(makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } }));
        expect(r.status).toBe(200);
        expect(r.body).toBe(1);

        r = await request(app).get(makeUrl('/api/post/aggregate', { _sum: { viewCount: true } }));
        expect(r.status).toBe(200);
        expect(r.body._sum.viewCount).toBe(3);

        r = await request(app).get(makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }));
        expect(r.status).toBe(200);
        expect(r.body).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await request(app).delete(makeUrl('/api/user/deleteMany', { where: { id: 'user1' } }));
        expect(r.status).toBe(200);
        expect(r.body.count).toBe(1);
    });

    it('invalid path or args', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use('/api', ZenStackMiddleware({ getPrisma: () => prisma, zodSchemas, api: Prisma }));

        let r = await request(app).get('/api/post/');
        expect(r.status).toBe(400);

        r = await request(app).get('/api/post/findMany/abc');
        expect(r.status).toBe(400);

        r = await request(app).get('/api/post/findMany?q=abc');
        expect(r.status).toBe(400);
    });
});
