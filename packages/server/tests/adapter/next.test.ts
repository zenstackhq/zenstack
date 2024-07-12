/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadSchema } from '@zenstackhq/testtools';
import { createServer, RequestListener } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node/api-resolver';
import path from 'path';
import request from 'supertest';
import Rest from '../../src/api/rest';
import { NextRequestHandler, RequestHandlerOptions } from '../../src/next';

function makeTestClient(apiPath: string, options: RequestHandlerOptions, qArg?: unknown, otherArgs?: any) {
    const pathParts = apiPath.split('/').filter((p) => p);

    const query = {
        path: pathParts,
        ...(qArg ? { q: JSON.stringify(qArg) } : {}),
        ...otherArgs,
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

describe('Next.js adapter tests - rpc handler', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('simple crud', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int
}
        `;

        const { prisma } = await loadSchema(model);

        await makeTestClient('/m/create', { getPrisma: () => prisma })
            .post('/')
            .send({ data: { id: '1', value: 1 } })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.data.value).toBe(1);
            });

        await makeTestClient('/m/findUnique', { getPrisma: () => prisma }, { where: { id: '1' } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data.value).toBe(1);
            });

        await makeTestClient('/m/findFirst', { getPrisma: () => prisma }, { where: { id: '1' } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data.value).toBe(1);
            });

        await makeTestClient('/m/findMany', { getPrisma: () => prisma }, {})
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data).toHaveLength(1);
            });

        await makeTestClient('/m/update', { getPrisma: () => prisma })
            .put('/')
            .send({ where: { id: '1' }, data: { value: 2 } })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data.value).toBe(2);
            });

        await makeTestClient('/m/updateMany', { getPrisma: () => prisma })
            .put('/')
            .send({ data: { value: 4 } })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data.count).toBe(1);
            });

        await makeTestClient('/m/upsert', { getPrisma: () => prisma })
            .post('/')
            .send({ where: { id: '2' }, create: { id: '2', value: 2 }, update: { value: 3 } })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.data.value).toBe(2);
            });

        await makeTestClient('/m/upsert', { getPrisma: () => prisma })
            .post('/')
            .send({ where: { id: '2' }, create: { id: '2', value: 2 }, update: { value: 3 } })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.data.value).toBe(3);
            });

        await makeTestClient('/m/count', { getPrisma: () => prisma }, { where: { id: '1' } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data).toBe(1);
            });

        await makeTestClient('/m/count', { getPrisma: () => prisma }, {})
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data).toBe(2);
            });

        await makeTestClient('/m/aggregate', { getPrisma: () => prisma }, { _sum: { value: true } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data._sum.value).toBe(7);
            });

        await makeTestClient('/m/groupBy', { getPrisma: () => prisma }, { by: ['id'], _sum: { value: true } })
            .get('/')
            .expect(200)
            .expect((resp) => {
                const data = resp.body.data;
                expect(data).toHaveLength(2);
                expect(data.find((item: any) => item.id === '1')._sum.value).toBe(4);
                expect(data.find((item: any) => item.id === '2')._sum.value).toBe(3);
            });

        await makeTestClient('/m/delete', { getPrisma: () => prisma }, { where: { id: '1' } })
            .del('/')
            .expect(200);
        expect(await prisma.m.count()).toBe(1);

        await makeTestClient('/m/deleteMany', { getPrisma: () => prisma }, {})
            .del('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data.count).toBe(1);
            });
        expect(await prisma.m.count()).toBe(0);
    });

    it('custom load path', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int
}
        `;

        const { prisma, projectDir } = await loadSchema(model, { output: './zen' });

        await makeTestClient('/m/create', {
            getPrisma: () => prisma,
            modelMeta: require(path.join(projectDir, './zen/model-meta')).default,
            zodSchemas: require(path.join(projectDir, './zen/zod')),
        })
            .post('/')
            .send({ data: { id: '1', value: 1 } })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.data.value).toBe(1);
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

        const { enhance } = await loadSchema(model);

        await makeTestClient('/m/create', { getPrisma: () => enhance() })
            .post('/m/create')
            .send({ data: { value: 0 } })
            .expect(403)
            .expect((resp) => {
                expect(resp.body.error.reason).toBe('RESULT_NOT_READABLE');
            });

        await makeTestClient('/m/create', { getPrisma: () => enhance() })
            .post('/')
            .send({ data: { id: '1', value: 1 } })
            .expect(201);

        await makeTestClient('/m/findMany', { getPrisma: () => enhance() })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data).toHaveLength(1);
            });

        await makeTestClient('/m/update', { getPrisma: () => enhance() })
            .put('/')
            .send({ where: { id: '1' }, data: { value: 0 } })
            .expect(403);

        await makeTestClient('/m/update', { getPrisma: () => enhance() })
            .put('/')
            .send({ where: { id: '1' }, data: { value: 2 } })
            .expect(200);

        await makeTestClient('/m/delete', { getPrisma: () => enhance() }, { where: { id: '1' } })
            .del('/')
            .expect(403);

        await makeTestClient('/m/update', { getPrisma: () => enhance() })
            .put('/')
            .send({ where: { id: '1' }, data: { value: 3 } })
            .expect(200);

        await makeTestClient('/m/delete', { getPrisma: () => enhance() }, { where: { id: '1' } })
            .del('/')
            .expect(200);
    });
});

describe('Next.js adapter tests - rest handler', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('adapter test - rest', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int
}
        `;

        const { prisma, modelMeta } = await loadSchema(model);

        const options = { getPrisma: () => prisma, handler: Rest({ endpoint: 'http://localhost/api' }), modelMeta };

        await makeTestClient('/m', options)
            .post('/')
            .send({ data: { type: 'm', attributes: { id: '1', value: 1 } } })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.data.attributes.value).toBe(1);
            });

        await makeTestClient('/m/1', options)
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data.id).toBe('1');
            });

        await makeTestClient('/m', options, undefined, { 'filter[value]': '1' })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data).toHaveLength(1);
            });

        await makeTestClient('/m', options, undefined, { 'filter[value]': '2' })
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data).toHaveLength(0);
            });

        await makeTestClient('/m/1', options)
            .put('/')
            .send({ data: { type: 'm', attributes: { value: 2 } } })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.data.attributes.value).toBe(2);
            });

        await makeTestClient('/m/1', options).del('/').expect(204);
        expect(await prisma.m.count()).toBe(0);
    });
});
