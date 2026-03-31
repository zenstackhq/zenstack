import { createPolicyTestClient } from '@zenstackhq/testtools';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2394', () => {
    it('should work with post-update rules when uuid fields are used', async () => {
        const db = await createPolicyTestClient(
            `
model Item {
    id     String @id @default(uuid()) @db.Uuid
    status String

    @@allow('create,read,update', true)
    @@deny('post-update', before().status == status)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        const item = await db.item.create({ data: { status: 'draft' } });

        // updating with a different status should succeed (post-update policy: deny if status didn't change)
        const updated = await db.item.update({ where: { id: item.id }, data: { status: 'published' } });
        expect(updated.status).toBe('published');

        // updating with the same status should be denied
        await expect(
            db.item.update({ where: { id: updated.id }, data: { status: 'published' } }),
        ).toBeRejectedByPolicy();
    });

    it('should work with policies comparing string field with uuid field', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id    String @id @default(uuid()) @db.Uuid
    id1   String
    value Int
    @@allow('all', id == id1)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        const newId = randomUUID();

        await expect(db.foo.create({ data: { id: newId, id1: newId, value: 0 } })).toResolveTruthy();
        await expect(db.foo.update({ where: { id: newId }, data: { value: 1 } })).toResolveTruthy();
    });

    it('should work with policies comparing @db.Uuid field to auth()', async () => {
        // Exercises transformAuthBinary: `id == auth()` expands to `id == auth().id`, where auth().id
        // is emitted as a text parameter even though the auth model's id also has @db.Uuid.
        const db = await createPolicyTestClient(
            `
model User {
    id    String @id @default(uuid()) @db.Uuid
    value Int

    @@allow('all', id == auth().id)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        const rawDb = db.$unuseAll();
        const user = await rawDb.user.create({ data: { value: 0 } });

        const authedDb = db.$setAuth(user);
        await expect(authedDb.user.findMany()).toResolveTruthy();
        await expect(authedDb.user.update({ where: { id: user.id }, data: { value: 1 } })).toResolveTruthy();
    });
});
