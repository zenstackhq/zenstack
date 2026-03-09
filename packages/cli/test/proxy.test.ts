import { createTestClient } from '@zenstackhq/testtools';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createProxyApp } from '../src/actions/proxy';

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
        });

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
});
