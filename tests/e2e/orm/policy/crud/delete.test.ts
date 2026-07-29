import { describe, expect, it } from 'vitest';
import { createPolicyTestClient } from '@zenstackhq/testtools';

describe('Delete policy tests', () => {
    it('works with top-level delete/deleteMany', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id
    x  Int
    @@allow('create,read', true)
    @@allow('delete', x > 0)
}
`,
        );

        await db.foo.create({ data: { id: 1, x: 0 } });
        await expect(db.foo.delete({ where: { id: 1 } })).toBeRejectedNotFound();

        await db.foo.create({ data: { id: 2, x: 1 } });
        await expect(db.foo.delete({ where: { id: 2 } })).toResolveTruthy();
        await expect(db.foo.count()).resolves.toBe(1);

        await db.foo.create({ data: { id: 3, x: 1 } });
        await expect(db.foo.deleteMany()).resolves.toMatchObject({ count: 1 });
        await expect(db.foo.count()).resolves.toBe(1);
    });

    it('works with query builder delete', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id
    x  Int
    @@allow('create,read', true)
    @@allow('delete', x > 0)
}
`,
        );
        await db.foo.create({ data: { id: 1, x: 0 } });
        await db.foo.create({ data: { id: 2, x: 1 } });

        await expect(db.$qb.deleteFrom('Foo').where('id', '=', 1).executeTakeFirst()).resolves.toMatchObject({
            numDeletedRows: 0n,
        });
        await expect(db.foo.count()).resolves.toBe(2);

        await expect(db.$qb.deleteFrom('Foo').executeTakeFirst()).resolves.toMatchObject({ numDeletedRows: 1n });
        await expect(db.foo.count()).resolves.toBe(1);
    });

    it('does not throw for nonexistent row', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id
    x  Int
    @@allow('create,read', true)
    @@allow('delete', x > 0)
}
`,
        );
        await db.foo.create({ data: { id: 1, x: 1 } });

        // nonexistent row — row does not exist at all, so postModelLevelCheck must NOT throw
        await expect(db.$qb.deleteFrom('Foo').where('id', '=', 999).executeTakeFirst()).resolves.toMatchObject({
            numDeletedRows: 0n,
        });
        await expect(db.foo.count()).resolves.toBe(1);
    });
});
