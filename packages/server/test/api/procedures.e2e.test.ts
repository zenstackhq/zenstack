import type { ClientContract } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RestApiHandler } from '../../src/api/rest';

describe('Procedures E2E', () => {
    let client: ClientContract<SchemaDef>;
    let api: RestApiHandler;

    const schema = `
datasource db {
    provider = 'sqlite'
    url = 'file:./test.db'
}

model User {
    id Int @id @default(autoincrement())
    email String @unique
}

procedure greet(name: String?): String
mutation procedure createTwoAndFail(email1: String, email2: String): Int
`;

    beforeEach(async () => {
        client = await createTestClient(schema, {
            procedures: {
                greet: async ({ args }: any) => {
                    const name = args?.name as string | undefined;
                    return `hello ${name ?? 'world'}`;
                },
                createTwoAndFail: async ({ client, args }: any) => {
                    const email1 = args.email1 as string;
                    const email2 = args.email2 as string;
                    await client.user.create({ data: { email: email1 } });
                    await client.user.create({ data: { email: email2 } });
                    throw new Error('boom');
                },
            },
        } as any);

        api = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            pageSize: 5,
        });
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('supports $procs routes', async () => {
        const r = await api.handleRequest({
            client,
            method: 'get',
            path: '/$procs/greet',
            query: { args: { name: 'alice' } } as any,
        });
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ data: 'hello alice' });
    });

    it('returns 422 for invalid input', async () => {
        const r = await api.handleRequest({
            client,
            method: 'get',
            path: '/$procs/greet',
            query: { args: { name: 123 } } as any,
        });

        expect(r.status).toBe(422);
        expect(r.body).toMatchObject({
            errors: [
                {
                    status: 422,
                    code: 'validation-error',
                },
            ],
        });
    });
});
