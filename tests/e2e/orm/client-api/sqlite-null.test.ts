import { createTestClient, getTestDbProvider } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

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

        await expect(
            db.user.create({
                data: {
                    balance: null,
                },
            }),
        ).resolves.toMatchObject({
            balance: null,
        });
    });
});
