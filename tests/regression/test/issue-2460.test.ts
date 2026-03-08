import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// createManyAndReturn fails with "Invariant failed: expecting a ValueNode"
// when rows in the batch have asymmetric columns (one row provides a field the other omits)
describe('Regression for issue #2460', () => {
    it('createManyAndReturn with asymmetric optional fields across rows', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id   Int    @id @default(autoincrement())
    role String
    @@allow('all', true)
}

model Item {
    id   Int     @id @default(autoincrement())
    key  String
    note String?
    @@allow('all', auth().role == 'admin')
}
            `,
            { provider: 'postgresql' },
        );

        const user = await db.user.create({ data: { role: 'admin' } });

        const result = await db.$setAuth(user).item.createManyAndReturn({
            data: [
                { key: 'a', note: 'hello' },
                { key: 'b' },
            ],
        });

        expect(result).toHaveLength(2);
    });
});
