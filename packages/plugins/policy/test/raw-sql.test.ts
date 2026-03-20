import type { ClientContract } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { createTestClient } from '@zenstackhq/testtools';
import { beforeAll, describe, expect, it } from 'vitest';
import { PolicyPlugin } from '../src/plugin';

const schema = `
model User {
    id String @id
    role String
    secrets Secret[]

    @@allow('all', true)
}

model Secret {
    id String @id
    value String
    ownerId String
    owner User @relation(fields: [ownerId], references: [id])

    @@allow('read', auth() != null && auth().role == 'admin')
    @@allow('create', auth() != null && auth().role == 'admin')
}
`;

describe('PolicyPlugin raw SQL', () => {
    let unsafeClient: ClientContract<SchemaDef>;
    let rawClient: ClientContract<SchemaDef>;
    let adminClient: ClientContract<SchemaDef>;
    let defaultClient: ClientContract<SchemaDef>;
    let defaultRawClient: ClientContract<SchemaDef>;
    let defaultAdminClient: ClientContract<SchemaDef>;

    beforeAll(async () => {
        unsafeClient = await createTestClient(schema, {
            plugins: [new PolicyPlugin({ dangerouslyAllowRawSql: true })],
            provider: 'postgresql',
            dbName: 'policy_raw_sql_dangerous',
        });
        rawClient = unsafeClient.$unuseAll();
        adminClient = unsafeClient.$setAuth({ id: 'admin', role: 'admin' });

        await rawClient.user.create({
            data: {
                id: 'admin',
                role: 'admin',
            },
        });

        defaultClient = await createTestClient(schema, {
            plugins: [new PolicyPlugin()],
            provider: 'postgresql',
            dbName: 'policy_raw_sql_default',
        });
        defaultRawClient = defaultClient.$unuseAll();
        defaultAdminClient = defaultClient.$setAuth({ id: 'admin', role: 'admin' });

        await defaultRawClient.user.create({
            data: {
                id: 'admin',
                role: 'admin',
            },
        });
    });

    it('keeps rejecting raw SQL by default', async () => {
        await expect(
            defaultAdminClient.$transaction(async (tx) => {
                await tx.secret.create({
                    data: {
                        id: 'secret-default',
                        ownerId: 'admin',
                        value: 'still-guarded',
                    },
                });

                await tx.$queryRaw<{ value: string }[]>`
                    SELECT "value"
                    FROM "Secret"
                    WHERE "id" = ${'secret-default'}
                `;
            }),
        ).rejects.toThrow('non-CRUD queries are not allowed');
    });

    it('allows raw SQL inside a transaction when dangerous raw SQL is enabled', async () => {
        await adminClient.$transaction(async (tx) => {
            await tx.secret.create({
                data: {
                    id: 'secret-1',
                    ownerId: 'admin',
                    value: 'top-secret',
                },
            });

            const rows = await tx.$queryRaw<{ value: string }[]>`
                SELECT "value"
                FROM "Secret"
                WHERE "id" = ${'secret-1'}
            `;

            expect(rows).toEqual([{ value: 'top-secret' }]);
        });
    });
});
