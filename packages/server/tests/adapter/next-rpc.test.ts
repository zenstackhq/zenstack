/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadSchema } from '@zenstackhq/testtools';
import { createServer, RequestListener } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node';
import superjson from 'superjson';
import request from 'supertest';
import { NextRequestHandler, RequestHandlerOptions } from '../../src/next';

function makeTestClient(apiPath: string, options: RequestHandlerOptions, queryArgs?: unknown) {
    const pathParts = apiPath.split('/').filter((p) => p);

    const query = {
        path: pathParts,
        ...(queryArgs ? { q: superjson.stringify(queryArgs) } : {}),
    };

    const handler = NextRequestHandler(options);

    const listener: RequestListener = (req, res) => {
        return apiResolver(
            req,
            res,
            query,
            handler,
            {
                previewModeEncryptionKey: '',
                previewModeId: '',
                previewModeSigningKey: '',
            },
            false
        );
    };

    return request(createServer(listener));
}

describe('request handler tests', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('simple crud regular json', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int
}
        `;

        const { prisma } = await loadSchema(model);

        await makeTestClient('/m/create', { getPrisma: () => prisma, useSuperJson: true })
            .post('/')
            .send({ data: { id: '1', value: 1 } })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(1);
            });

        await makeTestClient('/m/findUnique', { getPrisma: () => prisma, useSuperJson: true }, { where: { id: '1' } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(1);
            });

        await makeTestClient('/m/findFirst', { getPrisma: () => prisma, useSuperJson: true }, { where: { id: '1' } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(1);
            });

        await makeTestClient('/m/findMany', { getPrisma: () => prisma, useSuperJson: true }, {})
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json).toHaveLength(1);
            });

        await makeTestClient('/m/update', { getPrisma: () => prisma, useSuperJson: true })
            .put('/')
            .send({ where: { id: '1' }, data: { value: 2 } })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(2);
            });

        await makeTestClient('/m/updateMany', { getPrisma: () => prisma, useSuperJson: true })
            .put('/')
            .send({ data: { value: 4 } })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json.count).toBe(1);
            });

        await makeTestClient('/m/upsert', { getPrisma: () => prisma, useSuperJson: true })
            .post('/')
            .send({ where: { id: '2' }, create: { id: '2', value: 2 }, update: { value: 3 } })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(2);
            });

        await makeTestClient('/m/upsert', { getPrisma: () => prisma, useSuperJson: true })
            .post('/')
            .send({ where: { id: '2' }, create: { id: '2', value: 2 }, update: { value: 3 } })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(3);
            });

        await makeTestClient('/m/count', { getPrisma: () => prisma, useSuperJson: true }, { where: { id: '1' } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json).toBe(1);
            });

        await makeTestClient('/m/count', { getPrisma: () => prisma, useSuperJson: true }, {})
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json).toBe(2);
            });

        await makeTestClient('/m/aggregate', { getPrisma: () => prisma, useSuperJson: true }, { _sum: { value: true } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json._sum.value).toBe(7);
            });

        await makeTestClient(
            '/m/groupBy',
            { getPrisma: () => prisma, useSuperJson: true },
            { by: ['id'], _sum: { value: true } }
        )
            .get('/')
            .expect(200)
            .expect((resp) => {
                const data = resp.body.json;
                expect(data).toHaveLength(2);
                expect(data.find((item: any) => item.id === '1')._sum.value).toBe(4);
                expect(data.find((item: any) => item.id === '2')._sum.value).toBe(3);
            });

        await makeTestClient('/m/delete', { getPrisma: () => prisma, useSuperJson: true }, { where: { id: '1' } })
            .del('/')
            .expect(200);
        expect(await prisma.m.count()).toBe(1);

        await makeTestClient('/m/deleteMany', { getPrisma: () => prisma, useSuperJson: true }, {})
            .del('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json.count).toBe(1);
            });
        expect(await prisma.m.count()).toBe(0);
    });

    it('simple crud superjson', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int
}
        `;

        const { prisma } = await loadSchema(model);

        await makeTestClient('/m/create', { getPrisma: () => prisma, useSuperJson: true })
            .post('/')
            .send(marshal({ data: { id: '1', value: 1 } }))
            .expect(201)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(1);
            });

        await makeTestClient('/m/findUnique', { getPrisma: () => prisma, useSuperJson: true }, { where: { id: '1' } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(1);
            });

        await makeTestClient('/m/findMany', { getPrisma: () => prisma, useSuperJson: true }, {})
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json).toHaveLength(1);
            });

        await makeTestClient('/m/update', { getPrisma: () => prisma, useSuperJson: true })
            .put('/')
            .send(marshal({ where: { id: '1' }, data: { value: 2 } }))
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json.value).toBe(2);
            });
    });

    it('access policy crud', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int

    @@allow('create', true)
    @@allow('read', value > 0)
    @@allow('update', future().value > 1)
    @@allow('delete', value > 2)
}
        `;

        const { withPresets } = await loadSchema(model);

        await makeTestClient('/m/create', { getPrisma: () => withPresets(), useSuperJson: true })
            .post('/m/create')
            .send({ data: { value: 0 } })
            .expect(403)
            .expect((resp) => {
                expect(resp.body.json.reason).toBe('RESULT_NOT_READABLE');
            });

        await makeTestClient('/m/create', { getPrisma: () => withPresets(), useSuperJson: true })
            .post('/')
            .send({ data: { id: '1', value: 1 } })
            .expect(201);

        await makeTestClient('/m/findMany', { getPrisma: () => withPresets(), useSuperJson: true })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.json).toHaveLength(1);
            });

        await makeTestClient('/m/update', { getPrisma: () => withPresets(), useSuperJson: true })
            .put('/')
            .send({ where: { id: '1' }, data: { value: 0 } })
            .expect(403);

        await makeTestClient('/m/update', { getPrisma: () => withPresets(), useSuperJson: true })
            .put('/')
            .send({ where: { id: '1' }, data: { value: 2 } })
            .expect(200);

        await makeTestClient(
            '/m/delete',
            { getPrisma: () => withPresets(), useSuperJson: true },
            { where: { id: '1' } }
        )
            .del('/')
            .expect(403);

        await makeTestClient('/m/update', { getPrisma: () => withPresets(), useSuperJson: true })
            .put('/')
            .send({ where: { id: '1' }, data: { value: 3 } })
            .expect(200);

        await makeTestClient(
            '/m/delete',
            { getPrisma: () => withPresets(), useSuperJson: true },
            { where: { id: '1' } }
        )
            .del('/')
            .expect(200);
    });
});

function marshal(data: unknown) {
    return JSON.parse(superjson.stringify(data));
}
