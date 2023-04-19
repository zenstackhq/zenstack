/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import bodyParser from 'body-parser';
import express from 'express';
import request from 'supertest';
import { ZenStackMiddleware } from '../../../src/express';
import { makeUrl, schema } from '../../utils';
import REST from '../../../src/api/rest';

describe('Express adapter tests', () => {
    it('run plugin', async () => {
        const { prisma, zodSchemas } = await loadSchema(schema);

        const app = express();
        app.use(bodyParser.json());
        app.use('/api', ZenStackMiddleware({ getPrisma: () => prisma, zodSchemas, api: REST }));

        let r = await request(app).get(makeUrl('/api/post/1'));
        expect(r.status).toBe(404);

        r = await request(app).post('/api/user').send({
            id: 'user1',
            email: 'user1@abc.com',
        });

        expect(r.status).toBe(201);
        expect(r.body).toEqual({
            jsonapi: { version: '1.0' },
            data: { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
        });

        r = await request(app).put('/api/user/user1').send({ email: 'user1@def.com' });
        expect(r.status).toBe(200);
        expect(r.body.data.attributes.email).toBe('user1@def.com');

        r = await request(app).delete(makeUrl('/api/user/user1', { where: { id: 'user1' } }));
        expect(r.status).toBe(204);
    });
});
