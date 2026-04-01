import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2531
// Many-to-many update check failing with connect:
// Creating a Child with a nested `connect` on a many-to-many relation incorrectly
// fails with "model not updatable" because the update policy check runs before
// the connection is established.
describe('Regression for issue #2531', () => {
    const schema = `
model User {
    id       Int     @id @default(autoincrement())
    name     String
    children Child[]

    @@allow('all', true)
}

model Child {
    id      Int    @id @default(autoincrement())
    name    String
    parents User[]

    @@allow('create', auth() != null)
    @@allow('read,update', auth() != null && parents?[id == auth().id])
}
    `;

    it('should allow creating a child with connect to a many-to-many parent', async () => {
        const db = await createPolicyTestClient(schema, { usePrismaPush: true, debug: true });

        const user = await db.user.create({ data: { name: 'Alice' } });

        const authedDb = db.$setAuth(user);

        // This should succeed: after the create+connect, the child will have
        // the authenticated user as a parent, satisfying the read-back policy.
        const child = await authedDb.child.create({
            data: {
                name: 'Child1',
                parents: {
                    connect: { id: user.id },
                },
            },
        });

        expect(child).toMatchObject({ name: 'Child1' });
    });

    it('should deny creating a child without connecting to the authenticated user', async () => {
        const db = await createPolicyTestClient(schema, { usePrismaPush: true });

        const user = await db.user.create({ data: { name: 'Alice' } });
        const otherUser = await db.user.create({ data: { name: 'Bob' } });

        const authedDb = db.$setAuth(user);

        // Connecting to a different user's id should fail the read-back policy
        // since the authenticated user is not a parent of the resulting child.
        await expect(
            authedDb.child.create({
                data: {
                    name: 'Child2',
                    parents: {
                        connect: { id: otherUser.id },
                    },
                },
            }),
        ).toBeRejectedByPolicy();
    });
});
