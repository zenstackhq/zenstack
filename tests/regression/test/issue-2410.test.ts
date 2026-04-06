import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2410
describe('Regression for issue #2410', () => {
    it('should not generate invalid SQL when related models share identical @deny field names', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id   String @id @default(cuid())
    role String

    @@allow('all', true)
}

model Thread {
    id         String     @id @default(cuid())
    title      String
    apiKeyId   String     @deny('all', auth().role != 'ADMIN')
    questions  Question[]

    @@allow('all', true)
}

model Question {
    id        String  @id @default(cuid())
    content   String
    apiKeyId  String  @deny('all', auth().role != 'ADMIN')
    threadId  String
    thread    Thread  @relation(fields: [threadId], references: [id])

    @@allow('all', true)
}
            `,
        );

        const admin = { id: 'admin-1', role: 'ADMIN' };
        const user = { id: 'user-1', role: 'USER' };

        const thread = await db.$setAuth(admin).thread.create({
            data: {
                title: 'Test Thread',
                apiKeyId: 'key-1',
                questions: {
                    create: [{ content: 'Q1', apiKeyId: 'key-1' }],
                },
            },
        });

        // updating a non-denied field on the Thread should succeed for any role
        await expect(
            db.$setAuth(user).thread.update({
                where: { id: thread.id },
                data: { title: 'Updated Thread' },
            }),
        ).toResolveTruthy();

        // updating a denied field should be rejected for non-admin
        await expect(
            db.$setAuth(user).thread.update({
                where: { id: thread.id },
                data: { apiKeyId: 'key-2' },
            }),
        ).toBeRejectedByPolicy();

        // updating a denied field should succeed for admin
        await expect(
            db.$setAuth(admin).thread.update({
                where: { id: thread.id },
                data: { apiKeyId: 'key-2' },
            }),
        ).toResolveTruthy();
    });
});
