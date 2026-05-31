import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import { createTestClient } from '@zenstackhq/testtools';
import { sign } from 'node:crypto';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createProxyApp } from '../src/actions/proxy';

type TestClientOptions = Parameters<typeof createTestClient>[1];

// ─── Ed25519 key pair for tests ───────────────────────────────────────────────
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHIlHXhk+zc9ziuvrYAnZZgGL36H1GXwfsYchM9dM8gR
-----END PRIVATE KEY-----`;

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAFSJV7wjdFuDz2CqYX7hGnITQvcmJYy7OJQq2Cy2Eiqs=
-----END PUBLIC KEY-----`;

/** Raw base64 DER — the same key without PEM markers. */
const TEST_PUBLIC_KEY_DER = 'MCowBQYDK2VwAyEAFSJV7wjdFuDz2CqYX7hGnITQvcmJYy7OJQq2Cy2Eiqs=';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds the `x-zenstack-signature` header value for a request.
 * The payload is:
 *   - GET / DELETE: the raw query string (URL-encoded, after `?`)
 *   - other methods: `JSON.stringify(body)` (the raw request body)
 */
function buildSignatureHeader(options: {
    privateKey: string;
    method: string;
    /** Path + optional query string, e.g. `/api/model/user/findMany?q=%7B%7D` */
    pathWithQuery: string;
    body?: unknown;
    authorizationToken?: string;
    /** Override timestamp (unix seconds as string). Defaults to `now`. */
    timestamp?: string;
}): string {
    const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));

    const method = options.method.toUpperCase();
    let payload: string;
    if (method === 'GET' || method === 'DELETE') {
        const qMark = options.pathWithQuery.indexOf('?');
        payload = qMark >= 0 ? options.pathWithQuery.substring(qMark + 1) : '';
    } else {
        payload = options.body != null ? JSON.stringify(options.body) : '';
    }

    const message = options.authorizationToken
        ? `${payload}${timestamp}${options.authorizationToken}`
        : `${payload}${timestamp}`;

    const sig = sign(null, Buffer.from(message, 'utf8'), options.privateKey).toString('base64url');
    return `t=${timestamp},v1=${sig}`;
}

/** Encodes a UserClaim as a plain base64 bearer token. */
function makeUserToken(claim: { type: 'superUser' } | { type: 'user'; data: Record<string, unknown> }): string {
    return Buffer.from(JSON.stringify(claim)).toString('base64');
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('CLI proxy tests', () => {
    let server: http.Server | undefined;

    afterEach(async () => {
        await new Promise<void>((resolve) => {
            if (server) {
                server.close(() => resolve());
                server = undefined;
            } else {
                resolve();
            }
        });
    });

    async function startAt(app: ReturnType<typeof createProxyApp>): Promise<string> {
        return new Promise((resolve) => {
            server = app.listen(0, () => {
                const addr = server!.address() as { port: number };
                resolve(`http://localhost:${addr.port}`);
            });
        });
    }

    it('should serve schema at /api/schema endpoint', async () => {
        const zmodel = `
            model User {
                id    String @id @default(cuid())
                email String @unique
            }
        `;

        const client = await createTestClient(zmodel);
        const app = createProxyApp(client, client.$schema);
        const baseUrl = await startAt(app);

        const r = await fetch(`${baseUrl}/api/schema`);
        expect(r.status).toBe(200);

        const body = await r.json();
        // schema fields are present
        expect(body).toHaveProperty('models');
        expect(body.models).toHaveProperty('User');
        expect(body).toHaveProperty('provider');
        // zenstackVersion is injected by the proxy; when running tests directly
        // from source (no built dist/) getVersion() returns undefined and the
        // key is omitted from JSON — tolerate that, but if present it must be a string.
        if ('zenstackVersion' in body) {
            expect(typeof body.zenstackVersion).toBe('string');
        }
    });

    it('should omit computed fields from default query responses', async () => {
        // postCount is a @computed field — the proxy must not try to SELECT it
        // by default (it has no backing column in the DB).
        const zmodel = `
            model User {
                id        String @id @default(cuid())
                name      String
                postCount Int    @computed
            }
        `;

        // Mirror what proxy.ts does: build omit config from the schema, then
        // create the client with skipValidationForComputedFields.
        const client = await createTestClient(zmodel, {
            skipValidationForComputedFields: true,
            omit: { User: { postCount: true } },
        } as TestClientOptions);

        const app = createProxyApp(client, client.$schema);
        const baseUrl = await startAt(app);

        // Create a user via the proxy API.
        const createRes = await fetch(`${baseUrl}/api/model/user/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { name: 'Alice' } }),
        });
        expect(createRes.status).toBe(201);
        const created = await createRes.json();

        // The regular fields should be present …
        expect(created.data).toHaveProperty('id');
        expect(created.data).toHaveProperty('name', 'Alice');
        // … but the computed field must be absent in the default response.
        expect(created.data).not.toHaveProperty('postCount');

        // A findMany should behave the same way.
        const listRes = await fetch(`${baseUrl}/api/model/user/findMany`);
        expect(listRes.status).toBe(200);
        const list = await listRes.json();
        expect(list.data).toHaveLength(1);
        expect(list.data[0]).not.toHaveProperty('postCount');
    });

    it('should handle sequential transaction calls', async () => {
        const zmodel = `
            model User {
                id    String  @id @default(cuid())
                email String  @unique
                posts Post[]

                @@allow('all', true)
            }

            model Post {
                id       String  @id @default(cuid())
                title    String
                author   User?   @relation(fields: [authorId], references: [id])
                authorId String?

                @@allow('all', true)
            }
        `;

        const client = await createTestClient(zmodel);
        const app = createProxyApp(client, client.$schema);
        const baseUrl = await startAt(app);

        const txRes = await fetch(`${baseUrl}/api/model/$transaction/sequential`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([
                {
                    model: 'User',
                    op: 'create',
                    args: { data: { id: 'u1', email: 'alice@example.com' } },
                },
                {
                    model: 'Post',
                    op: 'create',
                    args: { data: { id: 'p1', title: 'Hello World', authorId: 'u1' } },
                },
                {
                    model: 'Post',
                    op: 'findMany',
                    args: { where: { authorId: 'u1' } },
                },
            ]),
        });
        expect(txRes.status).toBe(200);
        const tx = await txRes.json();

        // Should return results for each operation in the transaction.
        expect(Array.isArray(tx.data)).toBe(true);
        expect(tx.data).toHaveLength(3);

        // First result: created user
        expect(tx.data[0]).toMatchObject({ id: 'u1', email: 'alice@example.com' });
        // Second result: created post
        expect(tx.data[1]).toMatchObject({ id: 'p1', title: 'Hello World', authorId: 'u1' });
        // Third result: findMany — should find the newly created post
        expect(Array.isArray(tx.data[2])).toBe(true);
        expect(tx.data[2]).toHaveLength(1);
        expect(tx.data[2][0]).toMatchObject({ id: 'p1', title: 'Hello World' });

        // Confirm persisted outside transaction too.
        const userRes = await fetch(
            `${baseUrl}/api/model/user/findUnique?q=${encodeURIComponent(JSON.stringify({ where: { id: 'u1' } }))}`,
        );
        expect(userRes.status).toBe(200);
        const user = await userRes.json();
        expect(user.data).toMatchObject({ id: 'u1', email: 'alice@example.com' });
    });

    // ─── AuthN: signature verification ─────────────────────────────────────────

    describe('signature verification (publicAPIKey configured)', () => {
        const zmodel = `
            model User {
                id    String @id @default(cuid())
                email String @unique
            }
        `;

        it('should reject requests missing the signature header with 401', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            const r = await fetch(`${baseUrl}/api/model/user/findMany`);
            expect(r.status).toBe(401);

            const schemaR = await fetch(`${baseUrl}/api/schema`);
            expect(schemaR.status).toBe(401);
        });

        it('should reject requests with an invalid signature with 401', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            const r = await fetch(`${baseUrl}/api/model/user/findMany`, {
                headers: { 'x-zenstack-signature': 't=1234567890,v1=invalidsignature' },
            });
            expect(r.status).toBe(401);
        });

        it('should allow GET requests with a valid signature', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            const path = '/api/model/user/findMany';
            const sig = buildSignatureHeader({ privateKey: TEST_PRIVATE_KEY, method: 'GET', pathWithQuery: path });

            const r = await fetch(`${baseUrl}${path}`, {
                headers: { 'x-zenstack-signature': sig },
            });
            expect(r.status).toBe(200);
            const body = await r.json();
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('should allow GET request with query params and a valid signature', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            // Pre-seed a record directly via client
            await client.user.create({ data: { id: 'u1', email: 'alice@example.com' } });

            const q = encodeURIComponent(JSON.stringify({ where: { id: 'u1' } }));
            const pathWithQuery = `/api/model/user/findUnique?q=${q}`;
            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'GET',
                pathWithQuery,
            });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: { 'x-zenstack-signature': sig },
            });
            expect(r.status).toBe(200);
            const body = await r.json();
            expect(body.data).toMatchObject({ id: 'u1', email: 'alice@example.com' });
        });

        it('should allow POST (create) requests with a valid signature', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            const reqBody = { data: { email: 'bob@example.com' } };
            const pathWithQuery = '/api/model/user/create';
            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'POST',
                pathWithQuery,
                body: reqBody,
            });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-zenstack-signature': sig },
                body: JSON.stringify(reqBody),
            });
            expect(r.status).toBe(201);
            const body = await r.json();
            expect(body.data).toMatchObject({ email: 'bob@example.com' });
        });

        it('should allow PUT (update) requests with a valid signature', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            // Seed a record
            await client.user.create({ data: { id: 'u1', email: 'old@example.com' } });

            const reqBody = { where: { id: 'u1' }, data: { email: 'new@example.com' } };
            const pathWithQuery = '/api/model/user/update';
            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'PUT',
                pathWithQuery,
                body: reqBody,
            });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-zenstack-signature': sig },
                body: JSON.stringify(reqBody),
            });
            expect(r.status).toBe(200);
            const body = await r.json();
            expect(body.data).toMatchObject({ id: 'u1', email: 'new@example.com' });
        });

        it('should allow signed schema endpoint', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            const pathWithQuery = '/api/schema';
            const sig = buildSignatureHeader({ privateKey: TEST_PRIVATE_KEY, method: 'GET', pathWithQuery });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: { 'x-zenstack-signature': sig },
            });
            expect(r.status).toBe(200);
            const body = await r.json();
            expect(body).toHaveProperty('models');
        });

        it('should not require signatures when publicAPIKey is not configured', async () => {
            const client = await createTestClient(zmodel);
            // No publicAPIKey — backwards-compatible mode
            const app = createProxyApp(client, client.$schema);
            const baseUrl = await startAt(app);

            // No signature header — should still work
            const r = await fetch(`${baseUrl}/api/model/user/findMany`);
            expect(r.status).toBe(200);

            // Authorization header is silently ignored
            const withAuthHeader = await fetch(`${baseUrl}/api/model/user/findMany`, {
                headers: { Authorization: `Bearer ${makeUserToken({ type: 'superUser' })}` },
            });
            expect(withAuthHeader.status).toBe(200);
        });
    });

    // ─── AuthN: public key format ──────────────────────────────────────────────

    describe('public key format', () => {
        const zmodel = `
            model User {
                id    String @id @default(cuid())
                email String @unique
            }
        `;

        it('should accept a raw base64 DER key (without PEM markers)', async () => {
            const client = await createTestClient(zmodel);
            // Pass the key as raw base64 DER — no PEM markers
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY_DER });
            const baseUrl = await startAt(app);

            const pathWithQuery = '/api/model/user/findMany';
            const sig = buildSignatureHeader({ privateKey: TEST_PRIVATE_KEY, method: 'GET', pathWithQuery });
            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: { 'x-zenstack-signature': sig },
            });
            expect(r.status).toBe(200);
        });

        it('should accept a key supplied via ZENSTACK_PUBLIC_KEY env variable', async () => {
            const client = await createTestClient(zmodel);
            // createProxyApp receives the already-resolved key (as run() would pass it),
            // so we simulate env var resolution by passing the PEM directly.
            process.env['ZENSTACK_PUBLIC_KEY'] = TEST_PUBLIC_KEY;
            try {
                // No publicAPIKey option — would normally fall back to env var via run();
                // here we verify the middleware still works when the resolved key is provided.
                const app = createProxyApp(client, client.$schema, {
                    publicAPIKey: process.env['ZENSTACK_PUBLIC_KEY'],
                });
                const baseUrl = await startAt(app);

                const pathWithQuery = '/api/model/user/findMany';
                const sig = buildSignatureHeader({ privateKey: TEST_PRIVATE_KEY, method: 'GET', pathWithQuery });
                const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                    headers: { 'x-zenstack-signature': sig },
                });
                expect(r.status).toBe(200);
            } finally {
                delete process.env['ZENSTACK_PUBLIC_KEY'];
            }
        });
    });

    // ─── AuthN: timestamp / replay-attack prevention ───────────────────────────

    describe('signature timestamp tolerance', () => {
        const zmodel = `
            model User {
                id    String @id @default(cuid())
                email String @unique
            }
        `;

        it('should reject a request whose timestamp is older than the tolerance window', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            // Timestamp 120 seconds ago — exceeds default 60-second tolerance
            const expiredTimestamp = String(Math.floor(Date.now() / 1000) - 120);
            const pathWithQuery = '/api/model/user/findMany';
            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'GET',
                pathWithQuery,
                timestamp: expiredTimestamp,
            });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: { 'x-zenstack-signature': sig },
            });
            expect(r.status).toBe(401);
            const body = await r.json();
            expect(body.message).toMatch(/expired/i);
        });

        it('should reject a request whose timestamp is too far in the future', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            // Timestamp 120 seconds in the future — exceeds default 60-second tolerance
            const futureTimestamp = String(Math.floor(Date.now() / 1000) + 120);
            const pathWithQuery = '/api/model/user/findMany';
            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'GET',
                pathWithQuery,
                timestamp: futureTimestamp,
            });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: { 'x-zenstack-signature': sig },
            });
            expect(r.status).toBe(401);
            const body = await r.json();
            expect(body.message).toMatch(/expired/i);
        });

        it('should accept a request within a custom tolerance window', async () => {
            const client = await createTestClient(zmodel);
            // Custom tolerance of 300 seconds
            const app = createProxyApp(client, client.$schema, {
                publicAPIKey: TEST_PUBLIC_KEY,
                signatureToleranceSecs: 300,
            });
            const baseUrl = await startAt(app);

            // Timestamp 120 seconds ago — within the 300-second custom tolerance
            const timestamp = String(Math.floor(Date.now() / 1000) - 120);
            const pathWithQuery = '/api/model/user/findMany';
            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'GET',
                pathWithQuery,
                timestamp,
            });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: { 'x-zenstack-signature': sig },
            });
            expect(r.status).toBe(200);
        });

        it('should reject a request that falls outside a custom tolerance window', async () => {
            const client = await createTestClient(zmodel);
            // Very tight tolerance of 5 seconds
            const app = createProxyApp(client, client.$schema, {
                publicAPIKey: TEST_PUBLIC_KEY,
                signatureToleranceSecs: 5,
            });
            const baseUrl = await startAt(app);

            // Timestamp 10 seconds ago — exceeds the 5-second custom tolerance
            const timestamp = String(Math.floor(Date.now() / 1000) - 10);
            const pathWithQuery = '/api/model/user/findMany';
            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'GET',
                pathWithQuery,
                timestamp,
            });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: { 'x-zenstack-signature': sig },
            });
            expect(r.status).toBe(401);
        });
    });

    // ─── AuthN: signed request also carries Authorization header ──────────────

    describe('signature includes Authorization header in the signed message', () => {
        const zmodel = `
            model User {
                id    String @id @default(cuid())
                email String @unique
            }
        `;

        it('should reject a valid signature if it was produced without the Authorization token', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            // Sign without including the auth token
            const pathWithQuery = '/api/model/user/findMany';
            const sigWithoutAuth = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'GET',
                pathWithQuery,
                // authorizationToken intentionally omitted
            });

            const authToken = makeUserToken({ type: 'superUser' });

            // Send with Authorization header but signature that did NOT cover it
            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: {
                    'x-zenstack-signature': sigWithoutAuth,
                    Authorization: `Bearer ${authToken}`,
                },
            });
            expect(r.status).toBe(401);
        });

        it('should accept a request where the signature covers the Authorization token', async () => {
            const client = await createTestClient(zmodel);
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY });
            const baseUrl = await startAt(app);

            const authToken = makeUserToken({ type: 'superUser' });
            const pathWithQuery = '/api/model/user/findMany';
            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method: 'GET',
                pathWithQuery,
                authorizationToken: authToken,
            });

            const r = await fetch(`${baseUrl}${pathWithQuery}`, {
                headers: {
                    'x-zenstack-signature': sig,
                    Authorization: `Bearer ${authToken}`,
                },
            });
            expect(r.status).toBe(200);
        });
    });

    // ─── AuthZ: user impersonation via PolicyPlugin ─────────────────────────────

    describe('authorization with policy plugin', () => {
        // Users can only read/write their own record.
        const zmodel = `
            model User {
                id    String @id @default(cuid())
                email String @unique

                @@allow('all', auth() != null && auth().id == id)
            }
        `;

        async function createPolicyApp(extraZmodel?: string) {
            const fullZmodel = extraZmodel ? `${zmodel}\n${extraZmodel}` : zmodel;
            const client = await createTestClient(fullZmodel);
            const authDb = client.$use(new PolicyPlugin());
            return { client, app: createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY, authDb }) };
        }

        async function signedFetch(baseUrl: string, path: string, init: RequestInit = {}): Promise<Response> {
            const method = (init.method ?? 'GET').toUpperCase();
            const body = init.body ? JSON.parse(init.body as string) : undefined;
            const authHeader = (init.headers as Record<string, string> | undefined)?.['Authorization'];
            const authorizationToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

            const sig = buildSignatureHeader({
                privateKey: TEST_PRIVATE_KEY,
                method,
                pathWithQuery: path,
                body,
                authorizationToken,
            });
            return fetch(`${baseUrl}${path}`, {
                ...init,
                headers: {
                    ...(init.headers as Record<string, string>),
                    'x-zenstack-signature': sig,
                },
            });
        }

        it('superUser can access all records', async () => {
            const { client, app } = await createPolicyApp();
            const baseUrl = await startAt(app);

            // Seed two users directly via base client (bypasses policy)
            await client.user.create({ data: { id: 'u1', email: 'user1@example.com' } });
            await client.user.create({ data: { id: 'u2', email: 'user2@example.com' } });

            const authToken = makeUserToken({ type: 'superUser' });
            const pathWithQuery = '/api/model/user/findMany';
            const r = await signedFetch(baseUrl, pathWithQuery, {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(r.status).toBe(200);
            const body = await r.json();
            // SuperUser bypasses policy — sees all records
            expect(body.data).toHaveLength(2);
        });

        it('regular user can only access their own record', async () => {
            const { client, app } = await createPolicyApp();
            const baseUrl = await startAt(app);

            // Seed two users
            await client.user.create({ data: { id: 'u1', email: 'user1@example.com' } });
            await client.user.create({ data: { id: 'u2', email: 'user2@example.com' } });

            // Authenticated as u1
            const authToken = makeUserToken({ type: 'user', data: { id: 'u1' } });
            const pathWithQuery = '/api/model/user/findMany';
            const r = await signedFetch(baseUrl, pathWithQuery, {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(r.status).toBe(200);
            const body = await r.json();
            // Policy restricts to own record only
            expect(body.data).toHaveLength(1);
            expect(body.data[0]).toMatchObject({ id: 'u1' });
        });

        it("regular user cannot update another user's record", async () => {
            const { client, app } = await createPolicyApp();
            const baseUrl = await startAt(app);

            await client.user.create({ data: { id: 'u1', email: 'user1@example.com' } });
            await client.user.create({ data: { id: 'u2', email: 'user2@example.com' } });

            // Authenticated as u2 trying to update u1
            const reqBody = { where: { id: 'u1' }, data: { email: 'hacked@example.com' } };
            const authToken = makeUserToken({ type: 'user', data: { id: 'u2' } });
            const pathWithQuery = '/api/model/user/update';
            const r = await signedFetch(baseUrl, pathWithQuery, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify(reqBody),
            });
            // Policy should reject this — the policy plugin returns 404 (not found)
            // rather than 403 to avoid leaking that the record exists.
            expect([403, 404]).toContain(r.status);
        });

        it('superUser can create records on behalf of others', async () => {
            const { client: _client, app } = await createPolicyApp();
            const baseUrl = await startAt(app);

            const reqBody = { data: { id: 'u1', email: 'user1@example.com' } };
            const authToken = makeUserToken({ type: 'superUser' });
            const pathWithQuery = '/api/model/user/create';
            const r = await signedFetch(baseUrl, pathWithQuery, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify(reqBody),
            });
            expect(r.status).toBe(201);
            const body = await r.json();
            expect(body.data).toMatchObject({ id: 'u1', email: 'user1@example.com' });
        });

        it('sequential transaction respects user-scoped policy', async () => {
            const fullZmodel = `
                model User {
                    id    String @id @default(cuid())
                    email String @unique
                    posts Post[]

                    @@allow('all', auth() != null && auth().id == id)
                }
                model Post {
                    id       String  @id @default(cuid())
                    title    String
                    author   User?   @relation(fields: [authorId], references: [id])
                    authorId String?

                    @@allow('all', auth() != null && auth().id == authorId)
                }
            `;
            const client = await createTestClient(fullZmodel);
            const authDb = client.$use(new PolicyPlugin());
            const app = createProxyApp(client, client.$schema, { publicAPIKey: TEST_PUBLIC_KEY, authDb });
            const baseUrl = await startAt(app);

            // Seed users
            await client.user.create({ data: { id: 'u1', email: 'user1@example.com' } });
            await client.user.create({ data: { id: 'u2', email: 'user2@example.com' } });

            // Transaction as u1: create own post and read own posts
            const txBody = [
                { model: 'Post', op: 'create', args: { data: { id: 'p1', title: 'Post by u1', authorId: 'u1' } } },
                { model: 'Post', op: 'findMany', args: {} },
            ];
            const authToken = makeUserToken({ type: 'user', data: { id: 'u1' } });
            const pathWithQuery = '/api/model/$transaction/sequential';
            const r = await signedFetch(baseUrl, pathWithQuery, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify(txBody),
            });
            expect(r.status).toBe(200);
            const body = await r.json();
            expect(Array.isArray(body.data)).toBe(true);
            // Created post
            expect(body.data[0]).toMatchObject({ id: 'p1', title: 'Post by u1' });
            // findMany respects policy — u1 sees only their posts
            expect(body.data[1]).toHaveLength(1);
            expect(body.data[1][0]).toMatchObject({ id: 'p1' });
        });
    });
});
