/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import bodyParser from 'body-parser';
import express from 'express';
import request from 'supertest';
import RESTAPIHandler from '../../src/api/rest';
import { ZenStackMiddleware } from '../../src/express';
import { makeUrl, schema } from '../utils';

describe('Express adapter tests - rest handler with customMiddleware', () => {
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
                manageCustomResponse: true,
            })
        );

        const r = await request(app).get(makeUrl('/api/post/1'));
        expect(r.status).toBe(404);
    });
});
