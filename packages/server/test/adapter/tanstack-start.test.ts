import { SchemaDef } from '@zenstackhq/orm/schema';
import { createPolicyTestClient, createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { TanStackStartHandler, TanStackStartOptions } from '../../src/adapter/tanstack-start';
import { RestApiHandler, RPCApiHandler } from '../../src/api';

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

function makeTestClient(
    apiPath: string,
    options: TanStackStartOptions<SchemaDef>,
    qArg?: unknown,
    otherArgs?: any,
): TestClient {
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
                url.searchParams.set('data', JSON.stringify(qArg));
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
    it('simple crud', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int
}
        `;

        const db = await createTestClient(model);
        const options: TanStackStartOptions<SchemaDef> = {
            getClient: () => db,
            apiHandler: new RPCApiHandler({ schema: db.$schema }),
        };

        const client = await makeTestClient('/m/create', options)
            .post()
            .send({ data: { data: { id: '1', value: 1 } } });
        expect(client.status).toBe(201);
        expect(client.body.data.value).toBe(1);

        const findUnique = await makeTestClient('/m/findUnique', options, { where: { id: '1' } }).get();
        expect(findUnique.status).toBe(200);
        expect(findUnique.body.data.value).toBe(1);

        const findFirst = await makeTestClient('/m/findFirst', options, { where: { id: '1' } }).get();
        expect(findFirst.status).toBe(200);
        expect(findFirst.body.data.value).toBe(1);

        const findMany = await makeTestClient('/m/findMany', options, {}).get();
        expect(findMany.status).toBe(200);
        expect(findMany.body.data).toHaveLength(1);

        const update = await makeTestClient('/m/update', options)
            .put()
            .send({ data: { where: { id: '1' }, data: { value: 2 } } });
        expect(update.status).toBe(200);
        expect(update.body.data.value).toBe(2);

        const updateMany = await makeTestClient('/m/updateMany', options)
            .put()
            .send({ data: { data: { value: 4 } } });
        expect(updateMany.status).toBe(200);
        expect(updateMany.body.data.count).toBe(1);

        const upsert1 = await makeTestClient('/m/upsert', options)
            .post()
            .send({ data: { where: { id: '2' }, create: { id: '2', value: 2 }, update: { value: 3 } } });
        expect(upsert1.status).toBe(201);
        expect(upsert1.body.data.value).toBe(2);

        const upsert2 = await makeTestClient('/m/upsert', options)
            .post()
            .send({ data: { where: { id: '2' }, create: { id: '2', value: 2 }, update: { value: 3 } } });
        expect(upsert2.status).toBe(201);
        expect(upsert2.body.data.value).toBe(3);

        const count1 = await makeTestClient('/m/count', options, { where: { id: '1' } }).get();
        expect(count1.status).toBe(200);
        expect(count1.body.data).toBe(1);

        const count2 = await makeTestClient('/m/count', options, {}).get();
        expect(count2.status).toBe(200);
        expect(count2.body.data).toBe(2);

        const aggregate = await makeTestClient('/m/aggregate', options, { _sum: { value: true } }).get();
        expect(aggregate.status).toBe(200);
        expect(aggregate.body.data._sum.value).toBe(7);

        const groupBy = await makeTestClient('/m/groupBy', options, { by: ['id'], _sum: { value: true } }).get();
        expect(groupBy.status).toBe(200);
        const data = groupBy.body.data;
        expect(data).toHaveLength(2);
        expect(data.find((item: any) => item.id === '1')._sum.value).toBe(4);
        expect(data.find((item: any) => item.id === '2')._sum.value).toBe(3);

        const deleteOne = await makeTestClient('/m/delete', options, { where: { id: '1' } }).del();
        expect(deleteOne.status).toBe(200);
        expect(await db.m.count()).toBe(1);

        const deleteMany = await makeTestClient('/m/deleteMany', options, {}).del();
        expect(deleteMany.status).toBe(200);
        expect(deleteMany.body.data.count).toBe(1);
        expect(await db.m.count()).toBe(0);
    });

    it('access policy crud', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int

    @@allow('create,update', true)
    @@allow('read', value > 0)
    @@allow('post-update', value > 1)
    @@allow('delete', value > 2)
}
        `;

        const db = await createPolicyTestClient(model);
        const options: TanStackStartOptions<SchemaDef> = {
            getClient: () => db,
            apiHandler: new RPCApiHandler({ schema: db.$schema }),
        };

        const createForbidden = await makeTestClient('/m/create', options)
            .post()
            .send({ data: { data: { value: 0 } } });
        expect(createForbidden.status).toBe(403);
        expect(createForbidden.body.error.rejectReason).toBe('cannot-read-back');

        const create = await makeTestClient('/m/create', options)
            .post()
            .send({ data: { data: { id: '1', value: 1 } } });
        expect(create.status).toBe(201);

        const findMany = await makeTestClient('/m/findMany', options).get();
        expect(findMany.status).toBe(200);
        expect(findMany.body.data).toHaveLength(1);

        const updateForbidden1 = await makeTestClient('/m/update', options)
            .put()
            .send({ data: { where: { id: '1' }, data: { value: 0 } } });
        expect(updateForbidden1.status).toBe(403);

        const update1 = await makeTestClient('/m/update', options)
            .put()
            .send({ data: { where: { id: '1' }, data: { value: 2 } } });
        expect(update1.status).toBe(200);

        const deleteForbidden = await makeTestClient('/m/delete', options, { where: { id: '1' } }).del();
        expect(deleteForbidden.status).toBe(404);

        const update2 = await makeTestClient('/m/update', options)
            .put()
            .send({ data: { where: { id: '1' }, data: { value: 3 } } });
        expect(update2.status).toBe(200);

        const deleteOne = await makeTestClient('/m/delete', options, { where: { id: '1' } }).del();
        expect(deleteOne.status).toBe(200);
    });
});

describe('TanStack Start adapter tests - rest handler', () => {
    it('properly handles requests', async () => {
        const model = `
model M {
    id String @id @default(cuid())
    value Int
}
        `;

        const db = await createTestClient(model);

        const options: TanStackStartOptions<SchemaDef> = {
            getClient: () => db,
            apiHandler: new RestApiHandler({ endpoint: 'http://localhost/api', schema: db.$schema }),
        };

        const create = await makeTestClient('/m', options)
            .post()
            .send({ data: { type: 'm', attributes: { id: '1', value: 1 } } });
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

        const update = await makeTestClient('/m/1', options)
            .put()
            .send({ data: { type: 'm', attributes: { value: 2 } } });
        expect(update.status).toBe(200);
        expect(update.body.data.attributes.value).toBe(2);

        const deleteOne = await makeTestClient('/m/1', options).del();
        expect(deleteOne.status).toBe(200);
        expect(await db.m.count()).toBe(0);
    });
});
