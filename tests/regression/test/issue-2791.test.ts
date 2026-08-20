import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2791
// Policy pre-create checks unwrap insert values and used to treat any object with a
// `kind` key as a Kysely operation node. A Json payload like `{ kind: "artwork" }`
// then failed with `Invariant failed: expecting a ValueNode`.
const schema = `
model User {
    id Int @id @default(autoincrement())
}

model Item {
    id      Int  @id @default(autoincrement())
    payload Json

    // non-constant: constant @@allow('all', true) skips pre-create value unwrapping
    @@allow('all', auth() == null)
}
`;

describe('Regression for issue 2791', () => {
    it('creates a Json value that has a top-level kind key', async () => {
        const db = await createPolicyTestClient(schema, { provider: 'postgresql' });

        await expect(db.item.create({ data: { payload: { kind: 'artwork' } } })).resolves.toMatchObject({
            payload: { kind: 'artwork' },
        });
    });

    it('creates many Json values that have a top-level kind key', async () => {
        const db = await createPolicyTestClient(schema, { provider: 'postgresql' });

        await expect(
            db.item.createMany({ data: [{ payload: { kind: 'artwork' } }, { payload: { kind: 'photo' } }] }),
        ).resolves.toMatchObject({ count: 2 });

        await expect(db.item.findMany()).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ payload: { kind: 'artwork' } }),
                expect.objectContaining({ payload: { kind: 'photo' } }),
            ]),
        );
    });

    it('still accepts the same Json payload via update', async () => {
        const db = await createPolicyTestClient(schema, { provider: 'postgresql' });

        const item = await db.item.create({ data: { payload: {} } });
        await expect(
            db.item.update({ where: { id: item.id }, data: { payload: { kind: 'artwork' } } }),
        ).resolves.toMatchObject({ payload: { kind: 'artwork' } });
    });
});
