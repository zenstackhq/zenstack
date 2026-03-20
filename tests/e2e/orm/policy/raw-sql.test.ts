import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import type { ClientContract } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { createTestClient } from '@zenstackhq/testtools';
import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';

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

describe('Policy raw SQL tests', () => {
    const clients: ClientContract<SchemaDef>[] = [];

    afterEach(async () => {
        await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
    });

    function ref(client: ClientContract<SchemaDef>, col: string) {
        return client.$schema.provider.type === 'mysql' ? sql.raw(`\`${col}\``) : sql.raw(`"${col}"`);
    }

    async function createPolicyClient(options?: { dangerouslyAllowRawSql?: boolean; dbName: string }) {
        const unsafeClient = await createTestClient(schema, {
            dbName: options?.dbName,
            plugins: [new PolicyPlugin({ dangerouslyAllowRawSql: options?.dangerouslyAllowRawSql })],
        });
        clients.push(unsafeClient);

        const rawClient = unsafeClient.$unuseAll();
        const adminClient = unsafeClient.$setAuth({ id: 'admin', role: 'admin' });

        await rawClient.user.create({
            data: {
                id: 'admin',
                role: 'admin',
            },
        });

        return { adminClient };
    }

    it('keeps rejecting raw SQL by default', async () => {
        const { adminClient } = await createPolicyClient({ dbName: 'policy_raw_sql_default' });

        await expect(
            adminClient.$transaction(async (tx) => {
                await tx.secret.create({
                    data: {
                        id: 'secret-default',
                        ownerId: 'admin',
                        value: 'still-guarded',
                    },
                });

                await tx.$queryRaw<{ value: string }[]>`
                    SELECT ${ref(tx, 'Secret')}.${ref(tx, 'value')}
                    FROM ${ref(tx, 'Secret')}
                    WHERE ${ref(tx, 'Secret')}.${ref(tx, 'id')} = ${'secret-default'}
                `;
            }),
        ).rejects.toThrow('non-CRUD queries are not allowed');
    });

    it('allows raw SQL inside a transaction when dangerous raw SQL is enabled', async () => {
        const { adminClient } = await createPolicyClient({
            dangerouslyAllowRawSql: true,
            dbName: 'policy_raw_sql_dangerous',
        });

        await adminClient.$transaction(async (tx) => {
            await tx.secret.create({
                data: {
                    id: 'secret-1',
                    ownerId: 'admin',
                    value: 'top-secret',
                },
            });

            const rows = await tx.$queryRaw<{ value: string }[]>`
                SELECT ${ref(tx, 'Secret')}.${ref(tx, 'value')}
                FROM ${ref(tx, 'Secret')}
                WHERE ${ref(tx, 'Secret')}.${ref(tx, 'id')} = ${'secret-1'}
            `;

            expect(rows).toEqual([{ value: 'top-secret' }]);
        });
    });
});
