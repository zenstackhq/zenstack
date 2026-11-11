import { createTestClient } from '@zenstackhq/testtools';
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3';
import type { RequestEvent } from 'nuxt/server';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { createEventHandler } from '../../src/adapter/nuxt';
import { RPCApiHandler } from '../../src/api';
import { makeUrl, schema } from '../utils';

function makePortableEvent(method: string, path: string, body?: unknown) {
    const url = new URL(`http://localhost${path}`);
    const req = new Request(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const [, , , ...rest] = url.pathname.split('/');
    return { req, url, context: { params: { _: rest.join('/') } } } as unknown as RequestEvent;
}

describe('Nuxt adapter tests - portable event', () => {
    it('properly handles requests', async () => {
        const client = await createTestClient(schema);
        const handler = createEventHandler({
            getClient: () => client,
            apiHandler: new RPCApiHandler({ schema: client.schema }),
        });

        let r = await handler(makePortableEvent('GET', makeUrl('/api/model/post/findMany')));
        expect(r.status).toBe(200);
        expect((await r.json()).data).toHaveLength(0);

        r = await handler(
            makePortableEvent('POST', '/api/model/user/create', { data: { id: 'user1', email: 'user1@abc.com' } }),
        );
        expect(r.status).toBe(201);
        expect((await r.json()).data).toMatchObject({ email: 'user1@abc.com' });

        r = await handler(
            makePortableEvent('GET', makeUrl('/api/model/user/findMany', { where: { email: 'user1@abc.com' } })),
        );
        expect((await r.json()).data).toHaveLength(1);

        r = await handler(
            makePortableEvent('DELETE', makeUrl('/api/model/user/deleteMany', { where: { email: 'user1@abc.com' } })),
        );
        expect(r.status).toBe(200);
        expect((await r.json()).data).toMatchObject({ count: 1 });
    });

    it('rejects invalid json and missing client', async () => {
        const client = await createTestClient(schema);
        const apiHandler = new RPCApiHandler({ schema: client.schema });

        const event = makePortableEvent('POST', '/api/model/user/create');
        const badEvent = {
            ...event,
            req: new Request('http://localhost/api/model/user/create', { method: 'POST', body: '{bad' }),
        };
        const r = await createEventHandler({ getClient: () => client, apiHandler })(
            badEvent as unknown as RequestEvent,
        );
        expect(r.status).toBe(400);

        const r2 = await createEventHandler({ getClient: () => undefined as never, apiHandler })(event);
        expect(r2.status).toBe(500);
    });
});

describe('Nuxt adapter tests - DELETE request body', () => {
    const echoApiHandler = {
        handleRequest: async ({ requestBody }: { requestBody: unknown }) => ({ status: 200, body: { requestBody } }),
    };
    const payload = { data: [{ type: 'post', id: '1' }] };

    it('passes the body on the portable event path', async () => {
        const handler = createEventHandler({ getClient: () => ({}) as never, apiHandler: echoApiHandler as never });
        const r = await handler(makePortableEvent('DELETE', '/api/model/user/1/relationships/posts', payload));
        expect((await r.json()).requestBody).toEqual(payload);
    });

    it('passes the body on the h3 event path', async () => {
        const handler = createEventHandler({ getClient: () => ({}) as never, apiHandler: echoApiHandler as never });
        const router = createRouter().use('/api/model/**', defineEventHandler(handler as never));
        const request = supertest(toNodeListener(createApp().use(router)));
        const r = await request.delete('/api/model/user/1/relationships/posts').send(payload);
        expect(r.body.requestBody).toEqual(payload);
    });
});

describe('Nuxt adapter tests - h3 event', () => {
    it('properly handles requests', async () => {
        const client = await createTestClient(schema);
        const handler = createEventHandler({
            getClient: () => client,
            apiHandler: new RPCApiHandler({ schema: client.schema }),
        });

        const router = createRouter().use('/api/model/**', defineEventHandler(handler as never));
        const request = supertest(toNodeListener(createApp().use(router)));

        let r = await request.get(makeUrl('/api/model/post/findMany'));
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(0);

        r = await request.post('/api/model/user/create').send({ data: { id: 'user1', email: 'user1@abc.com' } });
        expect(r.status).toBe(201);
        expect(r.body.data).toMatchObject({ email: 'user1@abc.com' });

        r = await request.get(makeUrl('/api/model/user/findMany', { where: { email: 'user1@abc.com' } }));
        expect(r.body.data).toHaveLength(1);

        r = await request.delete(makeUrl('/api/model/user/deleteMany', { where: { email: 'user1@abc.com' } }));
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ count: 1 });

        r = await request.post('/api/model/user/create').set('content-type', 'application/json').send('{bad');
        expect(r.status).toBe(400);
    });
});
