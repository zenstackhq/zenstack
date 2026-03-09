import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2344
describe('Regression for issue 2344', () => {
    it('should reject select with only false fields', async () => {
        const db = await createTestClient(
            `
model User {
    id    String @id @default(cuid())
    email String @unique
    name  String?
}
            `,
        );

        await db.user.create({
            data: { email: 'user1@test.com', name: 'User1' },
        });

        // select with only false fields should be rejected by validation
        await expect(
            db.user.findMany({
                select: { id: false },
            }),
        ).rejects.toThrow(/"select" must have at least one truthy value/);

        // select with all fields false should also be rejected
        await expect(
            db.user.findFirst({
                select: { id: false, email: false, name: false },
            }),
        ).rejects.toThrow(/"select" must have at least one truthy value/);

        // mix of true and false should still work
        const r = await db.user.findFirst({
            select: { id: false, email: true },
        });
        expect(r).toBeTruthy();
        expect('id' in r!).toBeFalsy();
        expect(r!.email).toBe('user1@test.com');
    });
});
