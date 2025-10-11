/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';
import Rest from '../../src/api/rest';
import { TanStackStartHandler, TanStackStartOptions } from '../../src/tanstack-start';

function makeRequest(method: string, url: string, body?: any): Request {
    const payload = body ? JSON.stringify(body) : undefined;
    return new Request(url, { method, body: payload });
}

async function unmarshal(response: Response): Promise<any> {
    const text = await response.text();
    return JSON.parse(text);
}

interface TestClient {
    get: () => Promise<{ status: number; body: any }>;
    post: () => { send: (data: any) => Promise<{ status: number; body: any }> };
    put: () => { send: (data: any) => Promise<{ status: number; body: any }> };
    del: () => Promise<{ status: number; body: any }>;
}

function makeTestClient(apiPath: string, options: TanStackStartOptions, qArg?: unknown, otherArgs?: any): TestClient {
    const pathParts = apiPath.split('/').filter((p) => p);
    const path = pathParts.join('/');

    const handler = TanStackStartHandler(options);

    const params = {
        _splat: path,
        ...otherArgs,
    };

    const buildUrl = (method: string) => {
        const baseUrl = `http://localhost${apiPath}`;
        if (method === 'GET' || method === 'DELETE') {
            const url = new URL(baseUrl);
            if (qArg) {
                url.searchParams.set('q', JSON.stringify(qArg));
            }
            if (otherArgs) {
                Object.entries(otherArgs).forEach(([key, value]) => {
                    url.searchParams.set(key, String(value));
                });
            }
            return url.toString();
        }
        return baseUrl;
    };

    const executeRequest = async (method: string, body?: any) => {
        const url = buildUrl(method);
        const request = makeRequest(method, url, body);
        const response = await handler({ request, params });
        const responseBody = await unmarshal(response);
        return {
            status: response.status,
            body: responseBody,
        };
    };

    return {
        get: async () => executeRequest('GET'),
        post: () => ({
            send: async (data: any) => executeRequest('POST', data),
        }),
        put: () => ({
            send: async (data: any) => executeRequest('PUT', data),
        }),
        del: async () => executeRequest('DELETE'),
    };
}

describe('TanStack Start adapter tests - rpc handler', () => {
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

        const client = await makeTestClient('/m/create', { getPrisma: () => prisma }).post().send({ data: { id: '1', value: 1 } });
        expect(client.status).toBe(201);
        expect(client.body.data.value).toBe(1);

        const findUnique = await makeTestClient('/m/findUnique', { getPrisma: () => prisma }, { where: { id: '1' } }).get();
        expect(findUnique.status).toBe(200);
        expect(findUnique.body.data.value).toBe(1);

        const findFirst = await makeTestClient('/m/findFirst', { getPrisma: () => prisma }, { where: { id: '1' } }).get();
        expect(findFirst.status).toBe(200);
        expect(findFirst.body.data.value).toBe(1);

        const findMany = await makeTestClient('/m/findMany', { getPrisma: () => prisma }, {}).get();
        expect(findMany.status).toBe(200);
        expect(findMany.body.data).toHaveLength(1);

        const update = await makeTestClient('/m/update', { getPrisma: () => prisma }).put().send({ where: { id: '1' }, data: { value: 2 } });
        expect(update.status).toBe(200);
        expect(update.body.data.value).toBe(2);

        const updateMany = await makeTestClient('/m/updateMany', { getPrisma: () => prisma }).put().send({ data: { value: 4 } });
        expect(updateMany.status).toBe(200);
        expect(updateMany.body.data.count).toBe(1);

        const upsert1 = await makeTestClient('/m/upsert', { getPrisma: () => prisma }).post().send({ where: { id: '2' }, create: { id: '2', value: 2 }, update: { value: 3 } });
        expect(upsert1.status).toBe(201);
        expect(upsert1.body.data.value).toBe(2);

        const upsert2 = await makeTestClient('/m/upsert', { getPrisma: () => prisma }).post().send({ where: { id: '2' }, create: { id: '2', value: 2 }, update: { value: 3 } });
        expect(upsert2.status).toBe(201);
        expect(upsert2.body.data.value).toBe(3);

        const count1 = await makeTestClient('/m/count', { getPrisma: () => prisma }, { where: { id: '1' } }).get();
        expect(count1.status).toBe(200);
        expect(count1.body.data).toBe(1);

        const count2 = await makeTestClient('/m/count', { getPrisma: () => prisma }, {}).get();
        expect(count2.status).toBe(200);
        expect(count2.body.data).toBe(2);

        const aggregate = await makeTestClient('/m/aggregate', { getPrisma: () => prisma }, { _sum: { value: true } }).get();
        expect(aggregate.status).toBe(200);
        expect(aggregate.body.data._sum.value).toBe(7);

        const groupBy = await makeTestClient('/m/groupBy', { getPrisma: () => prisma }, { by: ['id'], _sum: { value: true } }).get();
        expect(groupBy.status).toBe(200);
        const data = groupBy.body.data;
        expect(data).toHaveLength(2);
        expect(data.find((item: any) => item.id === '1')._sum.value).toBe(4);
        expect(data.find((item: any) => item.id === '2')._sum.value).toBe(3);

        const deleteOne = await makeTestClient('/m/delete', { getPrisma: () => prisma }, { where: { id: '1' } }).del();
        expect(deleteOne.status).toBe(200);
        expect(await prisma.m.count()).toBe(1);

        const deleteMany = await makeTestClient('/m/deleteMany', { getPrisma: () => prisma }, {}).del();
        expect(deleteMany.status).toBe(200);
        expect(deleteMany.body.data.count).toBe(1);
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

        const client = await makeTestClient('/m/create', {
            getPrisma: () => prisma,
            modelMeta: require(path.join(projectDir, './zen/model-meta')).default,
            zodSchemas: require(path.join(projectDir, './zen/zod')),
        }).post().send({ data: { id: '1', value: 1 } });
        
        expect(client.status).toBe(201);
        expect(client.body.data.value).toBe(1);
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

        const createForbidden = await makeTestClient('/m/create', { getPrisma: () => enhance() }).post().send({ data: { value: 0 } });
        expect(createForbidden.status).toBe(403);
        expect(createForbidden.body.error.reason).toBe('RESULT_NOT_READABLE');

        const create = await makeTestClient('/m/create', { getPrisma: () => enhance() }).post().send({ data: { id: '1', value: 1 } });
        expect(create.status).toBe(201);

        const findMany = await makeTestClient('/m/findMany', { getPrisma: () => enhance() }).get();
        expect(findMany.status).toBe(200);
        expect(findMany.body.data).toHaveLength(1);

        const updateForbidden1 = await makeTestClient('/m/update', { getPrisma: () => enhance() }).put().send({ where: { id: '1' }, data: { value: 0 } });
        expect(updateForbidden1.status).toBe(403);

        const update1 = await makeTestClient('/m/update', { getPrisma: () => enhance() }).put().send({ where: { id: '1' }, data: { value: 2 } });
        expect(update1.status).toBe(200);

        const deleteForbidden = await makeTestClient('/m/delete', { getPrisma: () => enhance() }, { where: { id: '1' } }).del();
        expect(deleteForbidden.status).toBe(403);

        const update2 = await makeTestClient('/m/update', { getPrisma: () => enhance() }).put().send({ where: { id: '1' }, data: { value: 3 } });
        expect(update2.status).toBe(200);

        const deleteOne = await makeTestClient('/m/delete', { getPrisma: () => enhance() }, { where: { id: '1' } }).del();
        expect(deleteOne.status).toBe(200);
    });
});

describe('TanStack Start adapter tests - rest handler', () => {
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

        const create = await makeTestClient('/m', options).post().send({ data: { type: 'm', attributes: { id: '1', value: 1 } } });
        expect(create.status).toBe(201);
        expect(create.body.data.attributes.value).toBe(1);

        const getOne = await makeTestClient('/m/1', options).get();
        expect(getOne.status).toBe(200);
        expect(getOne.body.data.id).toBe('1');

        const findWithFilter1 = await makeTestClient('/m', options, undefined, { 'filter[value]': '1' }).get();
        expect(findWithFilter1.status).toBe(200);
        expect(findWithFilter1.body.data).toHaveLength(1);

        const findWithFilter2 = await makeTestClient('/m', options, undefined, { 'filter[value]': '2' }).get();
        expect(findWithFilter2.status).toBe(200);
        expect(findWithFilter2.body.data).toHaveLength(0);

        const update = await makeTestClient('/m/1', options).put().send({ data: { type: 'm', attributes: { value: 2 } } });
        expect(update.status).toBe(200);
        expect(update.body.data.attributes.value).toBe(2);

        const deleteOne = await makeTestClient('/m/1', options).del();
        expect(deleteOne.status).toBe(200);
        expect(await prisma.m.count()).toBe(0);
    });
});

