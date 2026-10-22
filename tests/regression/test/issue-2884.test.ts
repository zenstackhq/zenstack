import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2884', () => {
    it('zero-match updateMany on MySQL does not throw when an afterEntityMutation hook is registered', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    email String @unique
}
            `,
            { provider: 'mysql', usePrismaPush: true },
        );

        const hooked = db.$use({
            id: 'noop',
            onEntityMutation: {
                afterEntityMutation: async () => {},
            },
        });

        // no row with id 999 exists -> preUpdateIds resolves to [] -> should be a
        // normal zero-match update, not a thrown SQL syntax error
        await expect(
            hooked.user.updateMany({ where: { id: 999 }, data: { email: 'x@example.com' } }),
        ).resolves.toEqual({ count: 0 });
    });
});
