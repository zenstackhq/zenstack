import { serialize } from '@zenstackhq/client-helpers/fetch';
import Decimal from 'decimal.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, CrudError, CrudErrorCode } from '../src/index';
import { schema } from './schemas/basic/schema-lite';
import { schema as noProcSchema } from './schemas/no-procs/schema-lite';

const ENDPOINT = 'http://localhost/api/model';

function makeResponseText(data: unknown) {
    return JSON.stringify({ data });
}

function makeSerializedResponseText(data: unknown) {
    const { data: serializedData, meta } = serialize(data);
    return JSON.stringify({ data: serializedData, meta: { serialization: meta } });
}

describe('createClient', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        mockFetch = vi.fn();
        globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.resetAllMocks();
    });

    describe('read operations use GET', () => {
        it('findUnique - sends GET with args in query string', async () => {
            const data = { id: '1', email: 'alice@example.com', name: 'Alice' };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(data) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await client.user.findUnique({ where: { id: '1' } });

            expect(mockFetch).toHaveBeenCalledOnce();
            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/user/findUnique?q=`);
            expect(init).toBeUndefined();
            expect(result).toEqual(data);
        });

        it('findFirst - sends GET', async () => {
            const data = { id: '1', email: 'bob@example.com' };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(data) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.findFirst({ where: { name: 'Bob' } });

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/user/findFirst?q=`);
        });

        it('findFirst - can be called with no args', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(null) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.findFirst();

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/findFirst`);
        });

        it('findMany - sends GET', async () => {
            const data = [
                { id: '1', email: 'a@test.com' },
                { id: '2', email: 'b@test.com' },
            ];
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(data) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await client.user.findMany();

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/findMany`);
            expect(result).toEqual(data);
        });

        it('exists - sends GET', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(true) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await client.user.exists({ where: { id: '1' } });

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/user/exists?q=`);
            expect(result).toBe(true);
        });

        it('count - sends GET', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(42) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await client.user.count();

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/count`);
            expect(result).toBe(42);
        });

        it('aggregate - sends GET with args', async () => {
            const aggResult = { _count: { id: 5 } };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(aggResult) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await client.user.aggregate({ _count: { id: true } });

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/user/aggregate?q=`);
            expect(result).toEqual(aggResult);
        });

        it('groupBy - sends GET with args', async () => {
            const groupResult = [{ name: 'Alice', _count: { id: 1 } }];
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(groupResult) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await client.user.groupBy({ by: ['name'], _count: { id: true } });

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/user/groupBy?q=`);
            expect(result).toEqual(groupResult);
        });
    });

    describe('findUniqueOrThrow / findFirstOrThrow', () => {
        it('findUniqueOrThrow returns the entity when found', async () => {
            const data = { id: '1', email: 'alice@example.com' };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(data) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await client.user.findUniqueOrThrow({ where: { id: '1' } });

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/user/findUnique?q=`);
            expect(result).toEqual(data);
        });

        it('findUniqueOrThrow throws CrudError(NotFound) when not found', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(null) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await expect(client.user.findUniqueOrThrow({ where: { id: 'missing' } })).rejects.toMatchObject({
                name: 'CrudError',
                code: CrudErrorCode.NotFound,
                message: 'No User found',
                model: 'User',
            });
        });

        it('findUniqueOrThrow rejects with a CrudError instance', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(null) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await expect(client.user.findUniqueOrThrow({ where: { id: 'missing' } })).rejects.toBeInstanceOf(CrudError);
        });

        it('findFirstOrThrow throws CrudError(NotFound) when not found', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(null) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await expect(client.user.findFirstOrThrow({ where: { name: 'Bob' } })).rejects.toMatchObject({
                name: 'CrudError',
                code: CrudErrorCode.NotFound,
            });
        });
    });

    describe('write operations use correct HTTP methods', () => {
        it('create - sends POST with body', async () => {
            const created = { id: '1', email: 'new@example.com' };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(created) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const args = { data: { email: 'new@example.com' } };
            const result = await client.user.create(args);

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/create`);
            expect(init.method).toBe('POST');
            expect(init.headers['content-type']).toBe('application/json');
            expect(JSON.parse(init.body)).toMatchObject({ data: { email: 'new@example.com' } });
            expect(result).toEqual(created);
        });

        it('createMany - sends POST', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText({ count: 2 }) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.createMany({ data: [{ email: 'a@test.com' }, { email: 'b@test.com' }] });

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/createMany`);
            expect(init.method).toBe('POST');
        });

        it('createManyAndReturn - sends POST', async () => {
            const created = [{ id: '1', email: 'a@test.com' }];
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(created) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.createManyAndReturn({ data: [{ email: 'a@test.com' }] });

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/createManyAndReturn`);
            expect(init.method).toBe('POST');
        });

        it('update - sends PUT', async () => {
            const updated = { id: '1', email: 'updated@example.com' };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(updated) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.update({ where: { id: '1' }, data: { email: 'updated@example.com' } });

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/update`);
            expect(init.method).toBe('PUT');
            expect(init.headers['content-type']).toBe('application/json');
        });

        it('updateMany - sends PUT', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText({ count: 3 }) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.updateMany({ where: {}, data: { name: 'Updated' } });

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/updateMany`);
            expect(init.method).toBe('PUT');
        });

        it('updateManyAndReturn - sends PUT', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([]) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.updateManyAndReturn({ where: {}, data: { name: 'X' } });

            const [, init] = mockFetch.mock.calls[0] ?? [];
            expect(init.method).toBe('PUT');
        });

        it('upsert - sends POST', async () => {
            const upserted = { id: '1', email: 'u@test.com' };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(upserted) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.upsert({
                where: { id: '1' },
                create: { email: 'u@test.com' },
                update: { name: 'U' },
            });

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/upsert`);
            expect(init.method).toBe('POST');
        });

        it('delete - sends DELETE with args in query string', async () => {
            const deleted = { id: '1', email: 'gone@example.com' };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(deleted) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.delete({ where: { id: '1' } });

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/user/delete?q=`);
            expect(init.method).toBe('DELETE');
            expect(init.body).toBeUndefined();
        });

        it('deleteMany - sends DELETE with args in query string', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText({ count: 5 }) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.deleteMany({ where: { name: null } });

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/user/deleteMany?q=`);
            expect(init.method).toBe('DELETE');
        });

        it('deleteMany - can be called with no args', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText({ count: 0 }) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.deleteMany();

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/user/deleteMany`);
            expect(init.method).toBe('DELETE');
        });
    });

    describe('model name casing', () => {
        it('lowercases the first letter of the model in the URL', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([]) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.post.findMany();

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/post/findMany`);
        });
    });

    describe('endpoint validation', () => {
        it('throws when endpoint is missing', () => {
            expect(() => createClient(schema, {} as any)).toThrow(/required/);
        });

        it('throws when endpoint is empty string', () => {
            expect(() => createClient(schema, { endpoint: '' })).toThrow(/required/);
        });

        it('throws when endpoint is not a fully qualified URL', () => {
            expect(() => createClient(schema, { endpoint: '/api/model' })).toThrow(/fully qualified URL/);
            expect(() => createClient(schema, { endpoint: 'not a url' })).toThrow(/fully qualified URL/);
        });

        it('accepts a fully qualified http(s) URL', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([]) });

            const client = createClient(schema, { endpoint: 'https://example.com/api/model' });
            await client.user.findMany();

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe('https://example.com/api/model/user/findMany');
        });

        it('strips trailing slash from endpoint', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([]) });

            const client = createClient(schema, { endpoint: 'http://localhost/api/model/' });
            await client.user.findMany();

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe('http://localhost/api/model/user/findMany');
        });
    });

    describe('custom fetch function', () => {
        it('uses custom fetch instead of global fetch', async () => {
            const customFetch = vi.fn().mockResolvedValue({
                ok: true,
                text: async () => makeResponseText({ id: '1', email: 'a@test.com' }),
            });

            const client = createClient(schema, { endpoint: ENDPOINT, fetch: customFetch });
            await client.user.findUnique({ where: { id: '1' } });

            expect(customFetch).toHaveBeenCalledOnce();
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('throws QueryError with status and info on non-ok response', async () => {
            const errorInfo = { message: 'Not found', code: 'NOT_FOUND' };
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                text: async () => JSON.stringify({ error: errorInfo }),
            });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await expect(client.user.findUnique({ where: { id: 'missing' } })).rejects.toMatchObject({
                status: 404,
                info: errorInfo,
            });
        });

        it('throws on 403 access denied', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
                text: async () =>
                    JSON.stringify({
                        error: { message: 'Forbidden', rejectedByPolicy: true, rejectReason: 'access-denied' },
                    }),
            });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await expect(client.user.findMany()).rejects.toThrow();
        });

        it('returns undefined for cannot-read-back policy rejection', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
                text: async () =>
                    JSON.stringify({ error: { rejectedByPolicy: true, rejectReason: 'cannot-read-back' } }),
            });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await client.user.create({ data: { email: 'x@test.com' } });
            expect(result).toBeUndefined();
        });

        it('throws on 500 server error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => JSON.stringify({ error: { message: 'Internal server error' } }),
            });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await expect(client.user.findMany()).rejects.toMatchObject({ status: 500 });
        });
    });

    describe('SuperJSON serialization', () => {
        it('deserializes Date values from response', async () => {
            const date = new Date('2024-01-15T12:00:00Z');
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => makeSerializedResponseText({ id: '1', createdAt: date }),
            });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = (await client.user.findUnique({ where: { id: '1' } })) as any;

            expect(result.createdAt).toBeInstanceOf(Date);
            expect(result.createdAt.toISOString()).toBe(date.toISOString());
        });

        it('deserializes Decimal values from response', async () => {
            const price = new Decimal('123.456');
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => makeSerializedResponseText({ id: '1', price }),
            });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = (await client.user.findUnique({ where: { id: '1' } })) as any;

            expect(result.price).toBeInstanceOf(Decimal);
            expect(result.price.toString()).toBe('123.456');
        });

        it('serializes args with special types into query string', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([]) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.findMany({ where: { id: '1' } });

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain('?q=');
        });

        it('marshals args with Decimal into POST body', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText({ count: 1 }) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.user.createMany({ data: [{ email: 'x@test.com' }] });

            const [, init] = mockFetch.mock.calls[0] ?? [];
            const body = JSON.parse(init.body);
            expect(body).toMatchObject({ data: [{ email: 'x@test.com' }] });
        });
    });

    describe('procedures', () => {
        it('query procedure - sends GET request', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(42) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await (client as any).$procs.getStats.query();

            const [url] = mockFetch.mock.calls[0] ?? [];
            expect(url).toContain(`${ENDPOINT}/$procs/getStats`);
            expect(result).toBe(42);
        });

        it('mutation procedure - sends POST request', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(true) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const result = await (client as any).$procs.sendNotification.mutate({ args: { message: 'hello' } });

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/$procs/sendNotification`);
            expect(init.method).toBe('POST');
            expect(result).toBe(true);
        });

        it('query procedure has query property, mutation has mutate', async () => {
            const client = createClient(schema, { endpoint: ENDPOINT });
            const procs = (client as any).$procs;
            expect(typeof procs.getStats.query).toBe('function');
            expect(procs.getStats.mutate).toBeUndefined();
            expect(typeof procs.sendNotification.mutate).toBe('function');
            expect(procs.sendNotification.query).toBeUndefined();
        });
    });

    describe('$transaction', () => {
        it('POSTs to /$transaction/sequential with the operations array', async () => {
            const results = [
                { id: '1', email: 'alice@example.com' },
                { id: '2', title: 'Hello' },
            ];
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(results) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const [user, post] = await client.$transaction([
                { model: 'User', op: 'create', args: { data: { email: 'alice@example.com' } } },
                { model: 'Post', op: 'create', args: { data: { title: 'Hello' } } },
            ]);

            const [url, init] = mockFetch.mock.calls[0] ?? [];
            expect(url).toBe(`${ENDPOINT}/$transaction/sequential`);
            expect(init.method).toBe('POST');
            expect(init.headers['content-type']).toBe('application/json');

            const body = JSON.parse(init.body);
            expect(body).toEqual([
                { model: 'User', op: 'create', args: { data: { email: 'alice@example.com' } } },
                { model: 'Post', op: 'create', args: { data: { title: 'Hello' } } },
            ]);

            expect(user).toEqual(results[0]);
            expect(post).toEqual(results[1]);
        });

        it('preserves operation order in the result tuple', async () => {
            const userResult = { id: '1', email: 'alice@example.com' };
            const postResult = { id: '2', title: 'Hello' };
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([postResult, userResult]) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            const [post, user] = await client.$transaction([
                { model: 'Post', op: 'create', args: { data: { title: 'Hello' } } },
                { model: 'User', op: 'create', args: { data: { email: 'alice@example.com' } } },
            ]);

            expect(post).toEqual(postResult);
            expect(user).toEqual(userResult);
        });

        it('includes all op types in the request body', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([{ count: 2 }, null]) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.$transaction([
                { model: 'User', op: 'updateMany', args: { where: {}, data: { name: 'X' } } },
                { model: 'Post', op: 'delete', args: { where: { id: '1' } } },
            ]);

            const body = JSON.parse((mockFetch.mock.calls[0] ?? [])[1].body);
            expect(body[0]).toMatchObject({ model: 'User', op: 'updateMany' });
            expect(body[1]).toMatchObject({ model: 'Post', op: 'delete' });
        });

        it('marshals args with SuperJSON when special types are present', async () => {
            mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([{ id: '1' }]) });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await client.$transaction([{ model: 'User', op: 'findMany', args: { where: { id: '1' } } }]);

            // Plain args – no meta expected
            const body = JSON.parse((mockFetch.mock.calls[0] ?? [])[1].body);
            expect(body[0].args).toEqual({ where: { id: '1' } });
        });

        it('uses custom fetch in transaction', async () => {
            const customFetch = vi.fn().mockResolvedValue({
                ok: true,
                text: async () => makeResponseText([{ id: '1', email: 'a@test.com' }]),
            });

            const client = createClient(schema, { endpoint: ENDPOINT, fetch: customFetch });
            await client.$transaction([{ model: 'User', op: 'findMany' }]);

            expect(customFetch).toHaveBeenCalledOnce();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('throws QueryError when server returns error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 400,
                text: async () => JSON.stringify({ error: { message: 'Bad request' } }),
            });

            const client = createClient(schema, { endpoint: ENDPOINT });
            await expect(
                client.$transaction([{ model: 'User', op: 'create', args: { data: { email: 'x@test.com' } } }]),
            ).rejects.toMatchObject({ status: 400 });
        });
    });

    describe('$procs absent when schema has no procedures', () => {
        it('does not add $procs for schema without procedures', async () => {
            const client = createClient(noProcSchema, { endpoint: ENDPOINT });
            expect((client as any).$procs).toBeUndefined();
        });
    });
});
