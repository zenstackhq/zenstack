import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2718', () => {
    it('handles `in` operator against a list of enum values with native PostgreSQL enums', async () => {
        const db = await createPolicyTestClient(
            `
enum State {
    IN_PROGRESS
    DONE
    REVIEWED
}

model Post {
    id    String @id @default(cuid())
    title String
    state State

    @@allow('read,create', true)
    // only allow deleting posts whose state is DONE or REVIEWED
    @@deny('delete', !(state in [DONE, REVIEWED]))
    @@allow('delete', true)
}
            `,
            { usePrismaPush: true, provider: 'postgresql' },
        );

        await db.post.create({ data: { id: '1', title: 'p1', state: 'IN_PROGRESS' } });
        await db.post.create({ data: { id: '2', title: 'p2', state: 'DONE' } });
        await db.post.create({ data: { id: '3', title: 'p3', state: 'REVIEWED' } });

        // IN_PROGRESS is not in [DONE, REVIEWED] -> delete denied
        await expect(db.post.delete({ where: { id: '1' } })).toBeRejectedNotFound();

        // DONE and REVIEWED are in the list -> delete allowed
        await expect(db.post.delete({ where: { id: '2' } })).toResolveTruthy();
        await expect(db.post.delete({ where: { id: '3' } })).toResolveTruthy();
    });

    it('handles `in` operator against a list of enum values with SQLite', async () => {
        const db = await createPolicyTestClient(
            `
enum State {
    IN_PROGRESS
    DONE
    REVIEWED
}

model Post {
    id    String @id @default(cuid())
    title String
    state State

    @@allow('create', true)
    // only readable when state is DONE or REVIEWED
    @@allow('read', state in [DONE, REVIEWED])
}
            `,
        );

        await db.$unuseAll().post.createMany({
            data: [
                { id: '1', title: 'p1', state: 'IN_PROGRESS' },
                { id: '2', title: 'p2', state: 'DONE' },
                { id: '3', title: 'p3', state: 'REVIEWED' },
            ],
        });

        await expect(db.post.findMany()).resolves.toHaveLength(2);
        await expect(db.post.findUnique({ where: { id: '1' } })).resolves.toBeNull();
        await expect(db.post.findUnique({ where: { id: '2' } })).toResolveTruthy();
    });
});
