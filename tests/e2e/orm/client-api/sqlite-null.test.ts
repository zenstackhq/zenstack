import { createTestClient, getTestDbProvider } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

const provider = getTestDbProvider();

describe.skipIf(provider !== 'sqlite')('sqlite null tests', () => {
    it('allows writing null to optional Decimal fields', async () => {
        const db = await createTestClient(
            `
model User {
    id      Int @id @default(autoincrement())
    balance Decimal?
}
`,
        );

        const user = await db.user.create({
            data: {
                balance: null,
            },
        });

        expect(user).toMatchObject({
            balance: null,
        });

        await db.user.update({
            data: {
                balance: Decimal(1),
            },

            where: {
                id: user.id,
            },
        });

        await expect(
            db.user.update({
                data: {
                    balance: null,
                },

                where: {
                    id: user.id,
                },
            }),
        ).resolves.toMatchObject({
            balance: null,
        });
    });
});
