import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2671
describe('Regression for issue 2671', () => {
    const schema = `
model User {
    id           String @id @default(cuid())
    email        String @unique
    passwordHash String @omit
}
        `;

    it('allows selecting omitted fields when override is allowed (default)', async () => {
        const db = await createTestClient(schema);

        await db.user.create({
            data: { email: 'user1@test.com', passwordHash: 'secret-hash' },
        });

        // by default query-time override is allowed, so explicit select returns the field
        const selected = await db.user.findFirst({
            where: { email: 'user1@test.com' },
            select: { passwordHash: true },
        });
        expect(selected?.passwordHash).toBe('secret-hash');
    });

    it('forbids selecting omitted fields when allowQueryTimeOmitOverride is false', async () => {
        const base = await createTestClient(schema);
        const db = base.$setOptions({ ...base.$options, allowQueryTimeOmitOverride: false });

        await db.user.create({
            data: { email: 'user1@test.com', passwordHash: 'secret-hash' },
        });

        // explicitly selecting the omitted field must be rejected
        await expect(
            db.user.findFirst({
                where: { email: 'user1@test.com' },
                select: { passwordHash: true },
            }),
        ).toBeRejectedByValidation();

        // selecting non-omitted fields still works
        const ok = await db.user.findFirst({
            where: { email: 'user1@test.com' },
            select: { email: true },
        });
        expect(ok).toEqual({ email: 'user1@test.com' });

        // explicitly excluding the omitted field via select is fine
        const excluded = await db.user.findFirst({
            where: { email: 'user1@test.com' },
            select: { email: true, passwordHash: false },
        });
        expect(excluded).toEqual({ email: 'user1@test.com' });
    });
});
