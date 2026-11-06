import { createPolicyTestClient } from '@zenstackhq/testtools';
import bodyParser from 'body-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ZenStackMiddleware } from '../../src/adapter/express';
import { RPCApiHandler } from '../../src/api';
import { RestApiHandler } from '../../src/api/rest';
import { makeUrl, schema } from '../utils';

describe('Express adapter tests - rpc handler', () => {
    it('properly handles requests', async () => {
        const client = await createPolicyTestClient(schema);
        const rawClient = client.$unuseAll();

        const app = express();
        app.use(bodyParser.json());
        app.use(
            '/api',
            ZenStackMiddleware({
                apiHandler: new RPCApiHandler({ schema: client.$schema }),
                getClient: () => rawClient,
            }),
        );

        let r = await request(app).get(makeUrl('/api/post/findMany', { where: { id: { equals: '1' } } }));
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(0);

        r = await request(app)
            .post('/api/user/create')
            .send({
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
            }),
        );

        r = await request(app).get(makeUrl('/api/post/findMany'));
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(2);

        r = await request(app).get(makeUrl('/api/post/findMany', { where: { viewCount: { gt: 1 } } }));
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(1);

        r = await request(app)
            .put('/api/user/update')
            .send({ data: { where: { id: 'user1' }, data: { email: 'user1@def.com' } } });
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
            ]),
        );

        r = await request(app).delete(makeUrl('/api/user/deleteMany', { where: { id: 'user1' } }));
        expect(r.status).toBe(200);
        expect(r.body.data.count).toBe(1);
    });
});

describe('Express adapter tests - rest handler', () => {
    it('works with sending response', async () => {
        const client = await createPolicyTestClient(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use(
            '/api',
            ZenStackMiddleware({
                apiHandler: new RestApiHandler({ schema: client.$schema, endpoint: 'http://localhost/api' }),
                getClient: () => client.$unuseAll(),
            }),
        );

        let r = await request(app).get(makeUrl('/api/post/1'));
        expect(r.status).toBe(404);

        r = await request(app)
            .post('/api/user')
            .send({
                data: {
                    type: 'User',
                    attributes: {
                        id: 'user1',
                        email: 'user1@abc.com',
                    },
                },
            });
        expect(r.status).toBe(201);
        expect(r.body).toMatchObject({
            jsonapi: { version: '1.1' },
            data: { type: 'User', id: 'user1', attributes: { email: 'user1@abc.com' } },
        });

        r = await request(app).get('/api/user?filter[id]=user1');
        expect(r.body.data).toHaveLength(1);

        r = await request(app).get('/api/user?filter[id]=user2');
        expect(r.body.data).toHaveLength(0);

        r = await request(app).get('/api/user?filter[id]=user1&filter[email]=xyz');
        expect(r.body.data).toHaveLength(0);

        r = await request(app)
            .put('/api/user/user1')
            .send({ data: { type: 'User', attributes: { email: 'user1@def.com' } } });
        expect(r.status).toBe(200);
        expect(r.body.data.attributes.email).toBe('user1@def.com');

        r = await request(app).delete(makeUrl('/api/user/user1'));
        expect(r.status).toBe(200);
        expect(await client.$unuseAll().user.findMany()).toHaveLength(0);
    });
});

describe('Express adapter tests - rest handler with custom middleware', () => {
    it('properly handles requests', async () => {
        const client = await createPolicyTestClient(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use(
            '/api',
            ZenStackMiddleware({
                getClient: () => client.$unuseAll(),
                apiHandler: new RestApiHandler({ schema: client.$schema, endpoint: 'http://localhost/api' }),
                sendResponse: false,
            }),
        );

        app.use((_req, res) => {
            const zenstack = res.locals['zenstack'];
            res.status(zenstack.status).json({ message: zenstack.body });
        });

        const r = await request(app).get(makeUrl('/api/post/1'));
        expect(r.status).toBe(404);
        expect(r.body.message).toHaveProperty('errors');
    });
});
