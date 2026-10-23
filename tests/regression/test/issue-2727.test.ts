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

    it('compares before() enum fields inside collection predicates on PostgreSQL native enums', async () => {
        const db = await createPolicyTestClient(
            `
enum State {
    DRAFT
    IN_PROGRESS
    DONE
}

model Post {
    id       Int       @id
    state    State     @default(DRAFT)
    comments Comment[]
    @@allow('all', true)
    @@deny('post-update', comments?[before().state != this.state] && state == DONE)
}

model Comment {
    id     Int  @id
    post   Post @relation(fields: [postId], references: [id])
    postId Int
    @@allow('all', true)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        await db.post.create({ data: { id: 1, comments: { create: { id: 1 } } } });
        await expect(db.post.update({ where: { id: 1 }, data: { state: 'DONE' } })).toBeRejectedByPolicy();
        await db.post.update({ where: { id: 1 }, data: { state: 'IN_PROGRESS' } });
    });
});
