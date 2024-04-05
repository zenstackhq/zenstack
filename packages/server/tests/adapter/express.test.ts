/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import bodyParser from 'body-parser';
import express from 'express';
import request from 'supertest';
import RESTAPIHandler from '../../src/api/rest';
import { ZenStackMiddleware } from '../../src/express';
import { makeUrl, schema } from '../utils';
import path from 'path';

describe('Express adapter tests - rpc handler', () => {
    it('run plugin regular json', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use('/api', ZenStackMiddleware({ getPrisma: () => prisma, zodSchemas }));

        let r = await request(app).get(makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } }));
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(0);

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
        const data = r.body.data;
        expect(data).toEqual(
            expect.objectContaining({
                email: 'user1@abc.com',
                posts: expect.arrayContaining([
                    expect.objectContaining({ title: 'post1' }),
                    expect.objectContaining({ title: 'post2' }),
                ]),
            })
        );

        r = await request(app).get(makeUrl('/api/post/findMany'));
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(2);

        r = await request(app).get(makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } }));
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(1);

        r = await request(app)
            .put('/api/user/update')
            .send({ where: { id: 'user1' }, data: { email: 'user1@def.com' } });
        expect(r.status).toBe(200);
        expect(r.body.data.email).toBe('user1@def.com');

        r = await request(app).get(makeUrl('/api/post/count', { where: { viewCount: { gt: 1 } } }));
        expect(r.status).toBe(200);
        expect(r.body.data).toBe(1);

        r = await request(app).get(makeUrl('/api/post/aggregate', { _sum: { viewCount: true } }));
        expect(r.status).toBe(200);
        expect(r.body.data._sum.viewCount).toBe(3);

        r = await request(app).get(makeUrl('/api/post/groupBy', { by: ['published'], _sum: { viewCount: true } }));
        expect(r.status).toBe(200);
        expect(r.body.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await request(app).delete(makeUrl('/api/user/deleteMany', { where: { id: 'user1' } }));
        expect(r.status).toBe(200);
        expect(r.body.data.count).toBe(1);
    });

    it('custom load path', async () => {
        const { prisma, projectDir } = await loadSchema(schema, { output: './zen' });

        const app = express();
        app.use(bodyParser.json());
        app.use(
            '/api',
            ZenStackMiddleware({
                getPrisma: () => prisma,
                modelMeta: require(path.join(projectDir, './zen/model-meta')).default,
                zodSchemas: require(path.join(projectDir, './zen/zod')),
            })
        );

        const r = await request(app)
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
    });

    it('invalid path or args', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use('/api', ZenStackMiddleware({ getPrisma: () => prisma, zodSchemas }));

        let r = await request(app).get('/api/post/');
        expect(r.status).toBe(400);

        r = await request(app).get('/api/post/findMany/abc');
        expect(r.status).toBe(400);

        r = await request(app).get('/api/post/findMany?q=abc');
        expect(r.status).toBe(400);
    });
});

describe('Express adapter tests - rest handler', () => {
    it('run middleware', async () => {
        const { prisma, zodSchemas, modelMeta } = await loadSchema(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use(
            '/api',
            ZenStackMiddleware({
                getPrisma: () => prisma,
                modelMeta,
                zodSchemas,
                handler: RESTAPIHandler({ endpoint: 'http://localhost/api' }),
            })
        );

        let r = await request(app).get(makeUrl('/api/post/1'));
        expect(r.status).toBe(404);

        r = await request(app)
            .post('/api/user')
            .send({
                data: {
                    type: 'user',
                    attributes: {
                        id: 'user1',
                        email: 'user1@abc.com',
                    },
                },
            });
        expect(r.status).toBe(201);
        expect(r.body).toMatchObject({
            jsonapi: { version: '1.1' },
            data: { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
        });

        r = await request(app).get('/api/user?filter[id]=user1');
        expect(r.body.data).toHaveLength(1);

        r = await request(app).get('/api/user?filter[id]=user2');
        expect(r.body.data).toHaveLength(0);

        r = await request(app).get('/api/user?filter[id]=user1&filter[email]=xyz');
        expect(r.body.data).toHaveLength(0);

        r = await request(app)
            .put('/api/user/user1')
            .send({ data: { type: 'user', attributes: { email: 'user1@def.com' } } });
        expect(r.status).toBe(200);
        expect(r.body.data.attributes.email).toBe('user1@def.com');

        r = await request(app).delete(makeUrl('/api/user/user1'));
        expect(r.status).toBe(204);
        expect(await prisma.user.findMany()).toHaveLength(0);
    });
});

describe('Express adapter tests - rest handler with custom middleware', () => {
    it('run middleware', async () => {
        const { prisma, zodSchemas, modelMeta } = await loadSchema(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use(
            '/api',
            ZenStackMiddleware({
                getPrisma: () => prisma,
                modelMeta,
                zodSchemas,
                handler: RESTAPIHandler({ endpoint: 'http://localhost/api' }),
                sendResponse: false,
            })
        );

        app.use((req, res) => {
            res.status(res.locals.status).json({ message: res.locals.body });
        });

        const r = await request(app).get(makeUrl('/api/post/1'));
        expect(r.status).toBe(404);
        expect(r.body.message).toHaveProperty('errors');
    });
});
