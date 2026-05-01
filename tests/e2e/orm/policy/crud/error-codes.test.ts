import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Policy error code tests', () => {
    // ── create ──────────────────────────────────────────────────────────────

    it('surfaces code from deny rule on create violation', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id @default(autoincrement())
    x  Int
    @@deny('create', x <= 0, 'NEGATIVE_X')
    @@allow('create,read', true)
}
`,
        );
        await expect(db.foo.create({ data: { x: 0 } })).toBeRejectedByPolicy(undefined, 'NEGATIVE_X');
        await expect(db.foo.create({ data: { x: 1 } })).resolves.toMatchObject({ x: 1 });
    });

    it('surfaces code from allow rule on create violation', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id @default(autoincrement())
    x  Int
    @@allow('create', x > 0, 'NEED_POSITIVE_X')
    @@allow('read', true)
}
`,
        );
        await expect(db.foo.create({ data: { x: 0 } })).toBeRejectedByPolicy(undefined, 'NEED_POSITIVE_X');
        await expect(db.foo.create({ data: { x: 1 } })).resolves.toMatchObject({ x: 1 });
    });

    it('surfaces code from constant deny rule on create violation', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id @default(autoincrement())
    x  Int
    @@deny('create', true, 'ALWAYS_DENIED')
    @@allow('create,read', false)
}
`,
        );
        await expect(db.foo.create({ data: { x: 1 } })).toBeRejectedByPolicy(undefined, 'ALWAYS_DENIED');
    });

    it('deny rule code takes precedence over allow rule code on create', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id @default(autoincrement())
    x  Int
    @@deny('create', x < 0, 'NEGATIVE_X')
    @@allow('create', x > 10, 'NEED_LARGE_X')
    @@allow('read', true)
}
`,
        );
        // x = -1 satisfies the deny rule — its code wins
        await expect(db.foo.create({ data: { x: -1 } })).toBeRejectedByPolicy(undefined, 'NEGATIVE_X');
        // x = 5 doesn't satisfy deny, and the allow fails — allow rule code is returned
        await expect(db.foo.create({ data: { x: 5 } })).toBeRejectedByPolicy(undefined, 'NEED_LARGE_X');
    });

    it('no code when policies carry no errorCode', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id @default(autoincrement())
    x  Int
    @@deny('create', x <= 0)
    @@allow('create,read', true)
}
`,
        );
        await expect(db.foo.create({ data: { x: 0 } })).toBeRejectedByPolicy(undefined, undefined);
    });

    // ── post-update ──────────────────────────────────────────────────────────

    it('surfaces code from deny rule on post-update violation', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id
    x  Int
    @@allow('create,read,update', true)
    @@deny('post-update', x <= 0, 'NEGATIVE_AFTER_UPDATE')
}
`,
        );
        await db.foo.create({ data: { id: 1, x: 1 } });
        await expect(db.foo.update({ where: { id: 1 }, data: { x: -1 } })).toBeRejectedByPolicy(
            undefined,
            'NEGATIVE_AFTER_UPDATE',
        );
        // row unchanged
        await expect(db.foo.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ x: 1 });
    });

    it('surfaces code from allow rule on post-update violation', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id
    x  Int
    @@allow('create,read,update', true)
    @@allow('post-update', x > 0, 'MUST_BE_POSITIVE_AFTER_UPDATE')
}
`,
        );
        await db.foo.create({ data: { id: 1, x: 1 } });
        await expect(db.foo.update({ where: { id: 1 }, data: { x: -1 } })).toBeRejectedByPolicy(
            undefined,
            'MUST_BE_POSITIVE_AFTER_UPDATE',
        );
        await expect(db.foo.update({ where: { id: 1 }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });
    });
});
