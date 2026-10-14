import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2727', () => {
    it('compares before() enum fields in post-update rules on PostgreSQL native enums', async () => {
        const db = await createPolicyTestClient(
            `
enum State {
    DRAFT
    IN_PROGRESS
    DONE
}

model Post {
    id    Int   @id
    state State @default(DRAFT)
    @@allow('all', true)
    @@deny('post-update', before().state != state && before().state == DRAFT && state != IN_PROGRESS)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        await db.post.create({ data: { id: 1 } });
        await expect(db.post.update({ where: { id: 1 }, data: { state: 'DONE' } })).toBeRejectedByPolicy();
        await db.post.update({ where: { id: 1 }, data: { state: 'IN_PROGRESS' } });
    });
});
