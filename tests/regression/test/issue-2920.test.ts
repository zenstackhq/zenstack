import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2920', () => {
    it('creates a row with a Json field under a policy that needs the inserted row', async () => {
        const db = await createPolicyTestClient(
            `
model Author {
    id Int @id @default(autoincrement())
    open Boolean
    posts Post[]
    @@allow('create,read', true)
    @@allow('update', true)
}

model Post {
    id Int @id @default(autoincrement())
    meta Json?
    author Author @relation(fields: [authorId], references: [id])
    authorId Int
    @@allow('read', true)
    @@allow('create', author.open)
}
            `,
            { provider: 'mysql', usePrismaPush: true } as any,
        );

        await db.author.create({ data: { id: 1, open: true } });
        await db.author.create({ data: { id: 2, open: false } });

        await expect(db.post.create({ data: { authorId: 1, meta: { a: 1 } } })).resolves.toMatchObject({
            meta: { a: 1 },
        });
        await expect(db.post.create({ data: { authorId: 2, meta: { a: 1 } } })).toBeRejectedByPolicy();
    });
});
