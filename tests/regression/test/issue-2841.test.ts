import { createPolicyTestClient } from '@zenstackhq/testtools';
import type { LogEvent } from 'kysely';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2841
describe('Regression for issue #2841', () => {
    const schema = `
type Auth {
    id       String
    isSystem Boolean

    @@auth
}

model AuditLog {
    id     String @id @default(cuid())
    action String

    @@allow('create', auth().isSystem)
    @@allow('read', true)
}

model Note {
    id      String @id @default(cuid())
    ownerId String

    @@allow('create', ownerId == auth().id)
    @@allow('read', true)
}
`;

    async function createClient() {
        const sqls: string[] = [];
        const db = await createPolicyTestClient(schema, {
            log: (event: LogEvent) => {
                if (event.level === 'query') {
                    sqls.push(event.query.sql);
                }
            },
        });
        // the pre-create policy check is the only query selecting a `$condition` alias
        return { db, policyChecks: () => sqls.filter((sql) => sql.includes('$condition')) };
    }

    it('does not run a per-row policy check when the create filter does not reference the row', async () => {
        const { db, policyChecks } = await createClient();
        const authDb = db.$setAuth({ id: 'u1', isSystem: true });

        await expect(
            authDb.auditLog.createMany({
                data: Array.from({ length: 5 }, (_, i) => ({ action: `action-${i}` })),
            }),
        ).resolves.toMatchObject({ count: 5 });

        // `auth().isSystem` resolves to a constant, so one answer covers the whole batch
        expect(policyChecks()).toHaveLength(0);
        await expect(db.auditLog.findMany()).resolves.toHaveLength(5);
    });

    it('still rejects the batch when a non-row-dependent create filter denies', async () => {
        const { db } = await createClient();
        const authDb = db.$setAuth({ id: 'u1', isSystem: false });

        await expect(
            authDb.auditLog.createMany({
                data: [{ action: 'action-0' }],
            }),
        ).rejects.toThrow(/rejected by access policies/i);

        await expect(db.auditLog.findMany()).resolves.toHaveLength(0);
    });

    it('still checks each row when the create filter references the row', async () => {
        const { db, policyChecks } = await createClient();
        const authDb = db.$setAuth({ id: 'u1', isSystem: true });

        await expect(
            authDb.note.createMany({
                data: [{ ownerId: 'u1' }, { ownerId: 'u1' }],
            }),
        ).resolves.toMatchObject({ count: 2 });
        expect(policyChecks()).toHaveLength(2);

        // a single offending row still rejects the whole batch
        await expect(
            authDb.note.createMany({
                data: [{ ownerId: 'u1' }, { ownerId: 'someone-else' }],
            }),
        ).rejects.toThrow(/rejected by access policies/i);
        await expect(db.note.findMany()).resolves.toHaveLength(2);
    });
});
