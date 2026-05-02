import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import { createPolicyTestClient, createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Policy error code tests', () => {
    // ┌─────────────────────────────────────────┬────────┬─────────────┬────────┬────────┐
    // │ Scenario                                │ create │ post-update │ update │ delete │
    // ├─────────────────────────────────────────┼────────┼─────────────┼────────┼────────┤
    // │ deny rule fires (string code)           │   ✓    │      ✓      │   ✓    │   ✓    │
    // │ allow rule fails (string code)          │   ✓    │      ✓      │   ✓    │   ✓    │
    // │ constant deny (true condition)          │   ✓    │             │        │        │
    // │ no errorCode on rule                    │   ✓    │             │        │        │
    // │ code opt-in: NotFound vs RejectedByPol. │        │             │   ✓    │   ✓    │
    // │ multiple deny rules fire                │   ✓    │      ✓      │        │        │
    // │ deny + allow conflict                   │   ✓    │      ✓      │        │        │
    // │ multiple allow rules all fail           │   ✓    │      ✓      │        │        │
    // │ batch: some rows pass, some fail        │        │      ✓      │        │        │
    // │ complex schema (auth(), before())       │   ✓    │      ✓      │        │        │
    // │ enum error codes                        │   ✓    │      ✓      │        │        │
    // │ mixed enum + string codes               │   ✓    │             │        │        │
    // │ fetchPolicyCodes: plugin false          │   ✓    │      ✓      │   ✓    │   ✓    │
    // │ fetchPolicyCodes: query false           │   ✓    │      ✓      │   ✓    │   ✓    │
    // │ fetchPolicyCodes: query overrides plugin│   ✓    │      ✓      │   ✓    │   ✓    │
    // └─────────────────────────────────────────┴────────┴─────────────┴────────┴────────┘

    // ── create: single rule, single code ─────────────────────────────────────

    it('surfaces code from deny/allow rule on create violation', async () => {
        const db = await createPolicyTestClient(
            `
    model Foo {
        id Int @id @default(autoincrement())
        x  Int
        y  Int
        @@deny('create', x <= 0, 'NEGATIVE_X')
        @@allow('create', y > 0, 'NEED_POSITIVE_Y')
        @@allow('read', true)
    }
    `,
        );
        // deny code: x violates deny rule
        await expect(db.foo.create({ data: { x: 0, y: 1 } })).toBeRejectedByPolicy(undefined, ['NEGATIVE_X']);
        // allow code: y violates allow rule
        await expect(db.foo.create({ data: { x: 1, y: 0 } })).toBeRejectedByPolicy(undefined, ['NEED_POSITIVE_Y']);
        await expect(db.foo.create({ data: { x: 1, y: 1 } })).resolves.toMatchObject({ x: 1, y: 1 });
    });

    it('surfaces code from constant deny rule on create', async () => {
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
        await expect(db.foo.create({ data: { x: 1 } })).toBeRejectedByPolicy(undefined, ['ALWAYS_DENIED']);
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
        await expect(db.foo.create({ data: { x: 0 } })).toBeRejectedByPolicy(undefined, []);
    });

    // ── opt-in: adding a code changes error type from NotFound to RejectedByPolicy ──

    it('blocked update/delete yields NotFound without code, RejectedByPolicy with code', async () => {
        const schema = (withCode: boolean) => `
model Foo {
    id Int @id
    x  Int
    @@allow('create,read', true)
    @@allow('update', x > 0${withCode ? ", 'NEED_POSITIVE_X'" : ''})
    @@allow('delete', x > 0${withCode ? ", 'NEED_POSITIVE_X'" : ''})
}
`;
        // Without error code: the ORM sees 0 affected rows and raises NotFound
        const dbNoCode = await createPolicyTestClient(schema(false));
        await dbNoCode.foo.create({ data: { id: 1, x: 0 } });
        await expect(dbNoCode.foo.update({ where: { id: 1 }, data: { x: -1 } })).toBeRejectedNotFound();
        await expect(dbNoCode.foo.delete({ where: { id: 1 } })).toBeRejectedNotFound();

        // With error code: the plugin detects the policy block and raises RejectedByPolicy
        const dbWithCode = await createPolicyTestClient(schema(true));
        await dbWithCode.foo.create({ data: { id: 1, x: 0 } });
        await expect(dbWithCode.foo.update({ where: { id: 1 }, data: { x: -1 } })).toBeRejectedByPolicy(undefined, [
            'NEED_POSITIVE_X',
        ]);
        await expect(dbWithCode.foo.delete({ where: { id: 1 } })).toBeRejectedByPolicy(undefined, ['NEED_POSITIVE_X']);
    });

    // ── post-update: single rule, single code ─────────────────────────────────

    it('surfaces code from deny/allow rule on post-update violation', async () => {
        const db = await createPolicyTestClient(
            `
    model Foo {
        id Int @id
        x  Int
        y  Int
        @@allow('create,read,update', true)
        @@deny('post-update', x <= 0, 'NEGATIVE_AFTER_UPDATE')
        @@allow('post-update', y > 0, 'MUST_BE_POSITIVE_AFTER_UPDATE')
    }
    `,
        );
        await db.foo.create({ data: { id: 1, x: 1, y: 1 } });
        // deny code: post-update violations carry a distinct message alongside the code
        await expect(db.foo.update({ where: { id: 1 }, data: { x: -1 } })).toBeRejectedByPolicy(
            ['post-update policy check'],
            ['NEGATIVE_AFTER_UPDATE'],
        );
        // row unchanged after failed update
        await expect(db.foo.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ x: 1, y: 1 });
        // allow code: y violates allow rule
        await expect(db.foo.update({ where: { id: 1 }, data: { y: -1 } })).toBeRejectedByPolicy(undefined, [
            'MUST_BE_POSITIVE_AFTER_UPDATE',
        ]);
        // row unchanged after failed update
        await expect(db.foo.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ x: 1, y: 1 });
        await expect(db.foo.update({ where: { id: 1 }, data: { x: 2, y: 2 } })).resolves.toMatchObject({ x: 2, y: 2 });
    });

    // ── update: single rule, single code ─────────────────────────────────────

    it('surfaces code from deny/allow rule on update violation', async () => {
        const db = await createPolicyTestClient(
            `
    model Foo {
        id Int @id @default(autoincrement())
        x  Int
        y  Int
        @@allow('create,read', true)
        @@deny('update', x <= 0, 'CANNOT_UPDATE_NEGATIVE_X')
        @@allow('update', y > 0, 'NEED_POSITIVE_Y_TO_UPDATE')
    }
    `,
        );
        const neg = await db.foo.create({ data: { x: -1, y: 2 } });
        const noY = await db.foo.create({ data: { x: 5, y: 0 } });
        const ok = await db.foo.create({ data: { x: 1, y: 1 } });

        // deny code: current x violates deny rule
        await expect(db.foo.update({ where: { id: neg.id }, data: { y: 3 } })).toBeRejectedByPolicy(undefined, [
            'CANNOT_UPDATE_NEGATIVE_X',
        ]);
        // allow code: x=5 passes deny rule, but y=0 fails the allow rule
        await expect(db.foo.update({ where: { id: noY.id }, data: { y: 1 } })).toBeRejectedByPolicy(undefined, [
            'NEED_POSITIVE_Y_TO_UPDATE',
        ]);
        // happy path: x=1 > 0 (deny doesn't fire), y=1 > 0 (allow passes)
        await expect(db.foo.update({ where: { id: ok.id }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });
    });

    it('surfaces update code on pre-update violation and post-update code on post-update violation (same model)', async () => {
        const db = await createPolicyTestClient(
            `
    model Foo {
        id Int @id @default(autoincrement())
        x  Int @default(0)
        y  Int @default(0)
        @@allow('create,update,read', true)
        @@deny('update', x < 0, 'CANNOT_UPDATE_NEGATIVE_X')
        @@deny('post-update', x > 100, 'X_TOO_LARGE_AFTER_UPDATE')
        @@deny('update', y < 0, 'CANNOT_UPDATE_NEGATIVE_Y')
        @@deny('post-update', y < 100, 'Y_TOO_SMALL_AFTER_UPDATE')
    }
    `,
        );
        const denied = await db.foo.create({ data: { x: -1 } });
        const denied_y = await db.foo.create({ data: { y: -1 } });
        const ok = await db.foo.create({ data: { x: 10, y: 1000 } });

        // pre-update policy denies: update check fires before the write
        await expect(db.foo.update({ where: { id: denied.id }, data: { x: 50 } })).toBeRejectedByPolicy(undefined, [
            'CANNOT_UPDATE_NEGATIVE_X',
        ]);

        // post-update policy denies: update check passes (x > 0) but result violates post-update
        await expect(db.foo.update({ where: { id: ok.id }, data: { x: 200 } })).toBeRejectedByPolicy(
            ['post-update policy check'],
            ['X_TOO_LARGE_AFTER_UPDATE'],
        );

        // row unchanged after both failed updates
        await expect(db.foo.findUnique({ where: { id: denied.id } })).resolves.toMatchObject({ x: -1 });
        await expect(db.foo.findUnique({ where: { id: ok.id } })).resolves.toMatchObject({ x: 10 });

        // happy path: passes both update and post-update policies
        await expect(db.foo.update({ where: { id: ok.id }, data: { x: 50 } })).resolves.toMatchObject({ x: 50 });

        // update violation fire before post-update policy denies
        await expect(db.foo.update({ where: { id: denied_y.id }, data: { y: -1 } })).toBeRejectedByPolicy(undefined, [
            'CANNOT_UPDATE_NEGATIVE_Y',
        ]);
    });

    // ── delete: single rule, single code ─────────────────────────────────────

    it('surfaces code from deny/allow rule on delete violation', async () => {
        const db = await createPolicyTestClient(
            `
    model Foo {
        id Int @id @default(autoincrement())
        x  Int
        y  Int
        @@allow('create,read,update', true)
        @@deny('delete', x <= 0, 'CANNOT_DELETE_NEGATIVE_X')
        @@allow('delete', y > 0, 'NEED_POSITIVE_Y_TO_DELETE')
    }
    `,
        );
        const neg = await db.foo.create({ data: { x: -1, y: 2 } });
        const noY = await db.foo.create({ data: { x: 5, y: 0 } });
        const ok = await db.foo.create({ data: { x: 1, y: 1 } });

        // deny code: x <= 0 triggers deny rule
        await expect(db.foo.delete({ where: { id: neg.id } })).toBeRejectedByPolicy(undefined, [
            'CANNOT_DELETE_NEGATIVE_X',
        ]);
        // allow code: y is not > 0 so allow rule fails
        await expect(db.foo.delete({ where: { id: noY.id } })).toBeRejectedByPolicy(undefined, [
            'NEED_POSITIVE_Y_TO_DELETE',
        ]);
        // happy path
        await expect(db.foo.delete({ where: { id: ok.id } })).resolves.toMatchObject({ x: 1, y: 1 });
    });

    // ── multiple codes simultaneously ─────────────────────────────────────────

    it('returns all codes when multiple deny rules fire simultaneously', async () => {
        const db = await createPolicyTestClient(
            `
    model Foo {
        id Int @id @default(autoincrement())
        x  Int
        y  Int
        @@deny('create', x < 0, 'NEGATIVE_X')
        @@deny('create', y < 0, 'NEGATIVE_Y')
        @@allow('create,read,update', true)
        @@deny('post-update', x < 0, 'NEGATIVE_X_AFTER_UPDATE')
        @@deny('post-update', y < 0, 'NEGATIVE_Y_AFTER_UPDATE')
    }
    `,
        );
        // create: both deny rules fire → both codes
        await expect(db.foo.create({ data: { x: -1, y: -1 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_X',
            'NEGATIVE_Y',
        ]);
        // create: only one fires → only its code
        await expect(db.foo.create({ data: { x: -1, y: 1 } })).toBeRejectedByPolicy(undefined, ['NEGATIVE_X']);
        const row = await db.foo.create({ data: { x: 1, y: 1 } });
        // post-update: both deny rules fire → both codes
        await expect(db.foo.update({ where: { id: row.id }, data: { x: -1, y: -1 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_X_AFTER_UPDATE',
            'NEGATIVE_Y_AFTER_UPDATE',
        ]);
        // row unchanged after failed update
        await expect(db.foo.findUnique({ where: { id: row.id } })).resolves.toMatchObject({ x: 1, y: 1 });
        // post-update: only one fires → only its code
        await expect(db.foo.update({ where: { id: row.id }, data: { x: -1, y: 1 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_X_AFTER_UPDATE',
        ]);
        await expect(db.foo.update({ where: { id: row.id }, data: { x: 2, y: 2 } })).resolves.toMatchObject({
            x: 2,
            y: 2,
        });
    });

    it('returns codes from both deny and allow rules when they conflict simultaneously', async () => {
        const db = await createPolicyTestClient(
            `
    model Foo {
        id Int @id @default(autoincrement())
        x  Int
        y  Int
        @@deny('create', x < 0, 'NEGATIVE_X')
        @@allow('create', x > 10, 'NEED_LARGE_X')
        @@allow('read,update', true)
        @@deny('post-update', x < 0, 'NEGATIVE_X_AFTER_UPDATE')
        @@allow('post-update', y > 0, 'MUST_BE_POSITIVE_Y_AFTER_UPDATE')
    }
    `,
        );
        // create: deny fires AND allow fails → both codes
        await expect(db.foo.create({ data: { x: -1, y: 1 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_X',
            'NEED_LARGE_X',
        ]);
        // create: deny doesn't fire but allow still fails → only allow code
        await expect(db.foo.create({ data: { x: 5, y: 1 } })).toBeRejectedByPolicy(undefined, ['NEED_LARGE_X']);
        const row = await db.foo.create({ data: { x: 15, y: 1 } });
        // post-update: deny fires AND allow fails → both codes
        await expect(db.foo.update({ where: { id: row.id }, data: { x: -1, y: -1 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_X_AFTER_UPDATE',
            'MUST_BE_POSITIVE_Y_AFTER_UPDATE',
        ]);
        // row unchanged
        await expect(db.foo.findUnique({ where: { id: row.id } })).resolves.toMatchObject({ x: 15, y: 1 });
        // post-update: deny doesn't fire but allow fails → only allow code
        await expect(db.foo.update({ where: { id: row.id }, data: { x: 1, y: -1 } })).toBeRejectedByPolicy(undefined, [
            'MUST_BE_POSITIVE_Y_AFTER_UPDATE',
        ]);
        // post-update: deny fires but allow passes → only deny code
        await expect(db.foo.update({ where: { id: row.id }, data: { x: -1, y: 1 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_X_AFTER_UPDATE',
        ]);
        await expect(db.foo.update({ where: { id: row.id }, data: { x: 2, y: 2 } })).resolves.toMatchObject({
            x: 2,
            y: 2,
        });
    });

    it('returns all codes when multiple allow rules all fail simultaneously', async () => {
        const db = await createPolicyTestClient(
            `
    model Foo {
        id Int @id @default(autoincrement())
        x  Int
        y  Int
        @@allow('create', x > 10, 'NEED_LARGE_X')
        @@allow('create', y > 10, 'NEED_LARGE_Y')
        @@allow('read,update', true)
        @@allow('post-update', x > 0, 'NEED_POSITIVE_X_AFTER_UPDATE')
        @@allow('post-update', y > 0, 'NEED_POSITIVE_Y_AFTER_UPDATE')
    }
    `,
        );
        // create: OR semantics — neither condition met → both codes
        await expect(db.foo.create({ data: { x: 5, y: 5 } })).toBeRejectedByPolicy(undefined, [
            'NEED_LARGE_X',
            'NEED_LARGE_Y',
        ]);
        // create: OR semantics — one condition met → success
        const row = await db.foo.create({ data: { x: 15, y: 5 } });
        // post-update: OR semantics — neither condition met → both codes
        await expect(db.foo.update({ where: { id: row.id }, data: { x: -1, y: -1 } })).toBeRejectedByPolicy(undefined, [
            'NEED_POSITIVE_X_AFTER_UPDATE',
            'NEED_POSITIVE_Y_AFTER_UPDATE',
        ]);
        // row unchanged
        await expect(db.foo.findUnique({ where: { id: row.id } })).resolves.toMatchObject({ x: 15, y: 5 });
        // post-update: OR semantics — one allow passes → no error
        await expect(db.foo.update({ where: { id: row.id }, data: { x: 2, y: -1 } })).resolves.toMatchObject({ x: 2 });
    });

    // ── mixed batch: some rows pass, some fail ────────────────────────────────

    it('reports allow code on batch update (updateMany) when at least one row violates the allow condition', async () => {
        // Verifies that the diagnostic uses EXISTS(WHERE NOT allow_condition) rather than
        // NOT EXISTS(WHERE allow_condition): even if some rows pass, any violating row surfaces the code.
        const db = await createPolicyTestClient(
            `
    model Foo {
        id        Int @id @default(autoincrement())
        x         Int
        threshold Int
        @@allow('create,read,update', true)
        @@allow('post-update', x > threshold, 'NEED_ABOVE_THRESHOLD')
    }
    `,
        );
        await db.foo.create({ data: { x: 5, threshold: 1 } }); // row that will pass after update
        await db.foo.create({ data: { x: 5, threshold: 10 } }); // row that will fail after update
        // updateMany sets x=3 for all rows:
        // - row 1: 3 > 1 = true  → passes
        // - row 2: 3 > 10 = false → fails
        // batch is rejected and the allow code is surfaced despite row 1 passing
        await expect(db.foo.updateMany({ data: { x: 3 } })).toBeRejectedByPolicy(undefined, ['NEED_ABOVE_THRESHOLD']);
    });

    // ── realistic scenario: auth() and before() references ───────────────────

    it('surfaces codes in a complex schema with auth() and before() references', async () => {
        const db = await createPolicyTestClient(
            `
    model User {
        id            Int    @id @default(autoincrement())
        creditLimit   Int
        accountStatus String
        @@auth
    }

    model Order {
        id     Int    @id @default(autoincrement())
        total  Int
        stock  Int
        status String @default("pending")
        @@allow('create,read,update', true)
        @@deny('create', total > auth().creditLimit, 'CREDIT_EXCEEDED')
        @@deny('create', auth().accountStatus == 'suspended', 'ACCOUNT_SUSPENDED')
        @@deny('post-update', stock < 0, 'OUT_OF_STOCK')
        @@deny('post-update', before().status == 'shipped' && status != 'delivered', 'INVALID_STATUS_TRANSITION')
    }
    `,
        );

        const activeAuth = { creditLimit: 100, accountStatus: 'active' };

        // single create deny: total exceeds credit limit
        await expect(db.$setAuth(activeAuth).order.create({ data: { total: 200, stock: 10 } })).toBeRejectedByPolicy(
            undefined,
            ['CREDIT_EXCEEDED'],
        );

        // single create deny: account suspended
        await expect(
            db.$setAuth({ creditLimit: 1000, accountStatus: 'suspended' }).order.create({
                data: { total: 50, stock: 10 },
            }),
        ).toBeRejectedByPolicy(undefined, ['ACCOUNT_SUSPENDED']);

        // both create deny rules fire simultaneously: suspended + over limit
        await expect(
            db.$setAuth({ creditLimit: 50, accountStatus: 'suspended' }).order.create({
                data: { total: 200, stock: 10 },
            }),
        ).toBeRejectedByPolicy(undefined, ['CREDIT_EXCEEDED', 'ACCOUNT_SUSPENDED']);

        // create happy path
        const orderPending = await db.$setAuth(activeAuth).order.create({ data: { total: 30, stock: 5 } });
        const orderShipped = await db.$setAuth(activeAuth).order.create({
            data: { total: 30, stock: 5, status: 'shipped' },
        });

        // single post-update deny: stock goes negative
        await expect(db.order.update({ where: { id: orderPending.id }, data: { stock: -1 } })).toBeRejectedByPolicy(
            undefined,
            ['OUT_OF_STOCK'],
        );
        await expect(db.order.findUnique({ where: { id: orderPending.id } })).resolves.toMatchObject({ stock: 5 });

        // single post-update deny: invalid status transition from 'shipped'
        await expect(
            db.order.update({ where: { id: orderShipped.id }, data: { status: 'cancelled' } }),
        ).toBeRejectedByPolicy(undefined, ['INVALID_STATUS_TRANSITION']);

        // both post-update deny rules fire simultaneously
        await expect(
            db.order.update({ where: { id: orderShipped.id }, data: { stock: -1, status: 'cancelled' } }),
        ).toBeRejectedByPolicy(undefined, ['OUT_OF_STOCK', 'INVALID_STATUS_TRANSITION']);

        // post-update happy path: valid status transition
        await expect(
            db.order.update({ where: { id: orderShipped.id }, data: { status: 'delivered' } }),
        ).resolves.toMatchObject({ status: 'delivered' });
    });

    // ── enum error codes ──────────────────────────────────────────────────────

    it('surfaces codes from enum values on create violation (@@deny and @@allow)', async () => {
        const db = await createPolicyTestClient(
            `
    enum PolicyCode {
        NEGATIVE_X
        NEED_POSITIVE_Y
    }

    model Foo {
        id Int @id @default(autoincrement())
        x  Int
        y  Int
        @@deny('create', x <= 0, NEGATIVE_X)
        @@allow('create', y > 0, NEED_POSITIVE_Y)
        @@allow('read', true)
    }
    `,
        );
        // deny code via enum
        await expect(db.foo.create({ data: { x: 0, y: 1 } })).toBeRejectedByPolicy(undefined, ['NEGATIVE_X']);
        // allow code via enum
        await expect(db.foo.create({ data: { x: 1, y: 0 } })).toBeRejectedByPolicy(undefined, ['NEED_POSITIVE_Y']);
        await expect(db.foo.create({ data: { x: 1, y: 1 } })).resolves.toMatchObject({ x: 1, y: 1 });
    });

    it('surfaces code from enum value on post-update violation', async () => {
        const db = await createPolicyTestClient(
            `
    enum PolicyCode {
        NEGATIVE_AFTER_UPDATE
    }

    model Foo {
        id Int @id
        x  Int
        @@allow('create,read,update', true)
        @@deny('post-update', x <= 0, NEGATIVE_AFTER_UPDATE)
    }
    `,
        );
        await db.foo.create({ data: { id: 1, x: 1 } });
        await expect(db.foo.update({ where: { id: 1 }, data: { x: -1 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_AFTER_UPDATE',
        ]);
        await expect(db.foo.update({ where: { id: 1 }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });
    });

    it('mixes enum and string literal error codes', async () => {
        const db = await createPolicyTestClient(
            `
    enum PolicyCode {
        ALWAYS_DENIED
    }

    model Foo {
        id Int @id @default(autoincrement())
        x  Int
        y  Int
        @@allow('create,read', true)
        @@deny('create', x <= 0, ALWAYS_DENIED)
        @@deny('create', y <= 0, 'NEED_POSITIVE_Y')
    }
    `,
        );
        await expect(db.foo.create({ data: { x: 0, y: 0 } })).toBeRejectedByPolicy(undefined, [
            'ALWAYS_DENIED',
            'NEED_POSITIVE_Y',
        ]);
        await expect(db.foo.create({ data: { x: 0, y: 1 } })).toBeRejectedByPolicy(undefined, ['ALWAYS_DENIED']);
        await expect(db.foo.create({ data: { x: 1, y: 0 } })).toBeRejectedByPolicy(undefined, ['NEED_POSITIVE_Y']);
    });

    // ── fetchPolicyCodes opt-out: plugin-level ────────────────────────────────

    it('plugin-level fetchPolicyCodes:false skips diagnostic query', async () => {
        const db = await createTestClient(
            `
model Foo {
    id Int @id @default(autoincrement())
    x  Int
    y  Int
    @@deny('create', y <= 0, 'NEGATIVE_Y_CREATE')
    @@allow('create,read', true)
    @@deny('update', x <= 0, 'NEGATIVE_X_UPDATE')
    @@allow('update', x > 0)
    @@deny('delete', x <= 0, 'NEGATIVE_X_DELETE')
    @@allow('delete', x > 0)
    @@deny('post-update', x <= 0, 'NEGATIVE_AFTER_UPDATE')
    @@allow('post-update', x > 0)
}
`,
            { plugins: [new PolicyPlugin({ fetchPolicyCodes: false })] },
        );
        // create: error is still thrown but policyCodes is empty (y=0 triggers deny)
        await expect(db.foo.create({ data: { x: 1, y: 0 } })).toBeRejectedByPolicy(undefined, []);
        const row = await db.foo.create({ data: { x: 1, y: 1 } });
        // negRow: x=-1 (denied for update/delete), but y=1 so create succeeds
        const negRow = await db.foo.create({ data: { x: -1, y: 1 } });
        // update: error is still thrown but policyCodes is empty
        await expect(db.foo.update({ where: { id: negRow.id }, data: { x: 0 } })).toBeRejectedByPolicy(undefined, []);
        // delete: error is still thrown but policyCodes is empty
        await expect(db.foo.delete({ where: { id: negRow.id } })).toBeRejectedByPolicy(undefined, []);
        // post-update: error is still thrown but policyCodes is empty
        await expect(db.foo.update({ where: { id: row.id }, data: { x: -1 } })).toBeRejectedByPolicy(undefined, []);
        await expect(db.foo.update({ where: { id: row.id }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });
    });

    // ── fetchPolicyCodes opt-out: query-level ─────────────────────────────────

    it('query-level fetchPolicyCodes:false skips diagnostic query', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id Int @id @default(autoincrement())
    x  Int
    y  Int
    @@deny('create', y <= 0, 'NEGATIVE_Y_CREATE')
    @@allow('create,read', true)
    @@deny('update', x <= 0, 'NEGATIVE_X_UPDATE')
    @@allow('update', x > 0)
    @@deny('delete', x <= 0, 'NEGATIVE_X_DELETE')
    @@allow('delete', x > 0)
    @@deny('post-update', x <= 0, 'NEGATIVE_AFTER_UPDATE')
    @@allow('post-update', x > 0)
}
`,
        );
        // create: flag suppresses codes (y=0 triggers deny)
        await expect(db.foo.create({ data: { x: 1, y: 0 }, fetchPolicyCodes: false })).toBeRejectedByPolicy(
            undefined,
            [],
        );
        // create: without flag, codes surface
        await expect(db.foo.create({ data: { x: 1, y: 0 } })).toBeRejectedByPolicy(undefined, ['NEGATIVE_Y_CREATE']);
        const row = await db.foo.create({ data: { x: 1, y: 1 } });
        const negRow = await db.foo.create({ data: { x: -1, y: 1 } });
        // update: flag suppresses codes
        await expect(
            db.foo.update({ where: { id: negRow.id }, data: { x: 0 }, fetchPolicyCodes: false }),
        ).toBeRejectedByPolicy(undefined, []);
        // update: without flag, codes surface
        await expect(db.foo.update({ where: { id: negRow.id }, data: { x: 0 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_X_UPDATE',
        ]);
        // delete: flag suppresses codes
        await expect(db.foo.delete({ where: { id: negRow.id }, fetchPolicyCodes: false })).toBeRejectedByPolicy(
            undefined,
            [],
        );
        // delete: without flag, codes surface
        await expect(db.foo.delete({ where: { id: negRow.id } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_X_DELETE',
        ]);
        // post-update: flag suppresses codes
        await expect(
            db.foo.update({ where: { id: row.id }, data: { x: -1 }, fetchPolicyCodes: false }),
        ).toBeRejectedByPolicy(undefined, []);
        // post-update: without flag, codes surface
        await expect(db.foo.update({ where: { id: row.id }, data: { x: -1 } })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_AFTER_UPDATE',
        ]);
    });

    it('query-level fetchPolicyCodes:true overrides plugin-level false', async () => {
        const db = await createTestClient(
            `
model Foo {
    id Int @id @default(autoincrement())
    x  Int
    y  Int
    @@deny('create', y <= 0, 'NEGATIVE_Y_CREATE')
    @@allow('create,read', true)
    @@deny('update', x <= 0, 'NEGATIVE_X_UPDATE')
    @@allow('update', x > 0)
    @@deny('delete', x <= 0, 'NEGATIVE_X_DELETE')
    @@allow('delete', x > 0)
    @@deny('post-update', x <= 0, 'NEGATIVE_AFTER_UPDATE')
    @@allow('post-update', x > 0)
}
`,
            { plugins: [new PolicyPlugin({ fetchPolicyCodes: false })] },
        );
        // create: query-level true re-enables codes despite plugin false
        await expect(db.foo.create({ data: { x: 1, y: 0 }, fetchPolicyCodes: true })).toBeRejectedByPolicy(undefined, [
            'NEGATIVE_Y_CREATE',
        ]);
        // create: without override, codes are suppressed
        await expect(db.foo.create({ data: { x: 1, y: 0 } })).toBeRejectedByPolicy(undefined, []);
        const row = await db.foo.create({ data: { x: 1, y: 1 } });
        const negRow = await db.foo.create({ data: { x: -1, y: 1 } });
        // update: query-level true re-enables codes despite plugin false
        await expect(
            db.foo.update({ where: { id: negRow.id }, data: { x: 0 }, fetchPolicyCodes: true }),
        ).toBeRejectedByPolicy(undefined, ['NEGATIVE_X_UPDATE']);
        // update: without override, codes are suppressed
        await expect(db.foo.update({ where: { id: negRow.id }, data: { x: 0 } })).toBeRejectedByPolicy(undefined, []);
        // delete: query-level true re-enables codes despite plugin false
        await expect(db.foo.delete({ where: { id: negRow.id }, fetchPolicyCodes: true })).toBeRejectedByPolicy(
            undefined,
            ['NEGATIVE_X_DELETE'],
        );
        // delete: without override, codes are suppressed
        await expect(db.foo.delete({ where: { id: negRow.id } })).toBeRejectedByPolicy(undefined, []);
        // post-update: query-level true re-enables codes despite plugin false
        await expect(
            db.foo.update({ where: { id: row.id }, data: { x: -1 }, fetchPolicyCodes: true }),
        ).toBeRejectedByPolicy(undefined, ['NEGATIVE_AFTER_UPDATE']);
        // post-update: without override, codes are suppressed
        await expect(db.foo.update({ where: { id: row.id }, data: { x: -1 } })).toBeRejectedByPolicy(undefined, []);
    });
});
