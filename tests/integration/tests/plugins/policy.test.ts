/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';

describe('Policy plugin tests', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    const TRUE = { AND: [] };
    const FALSE = { OR: [] };

    it('short-circuit', async () => {
        const model = `
model User {
    id String @id @default(cuid())
    value Int
}

model M {
    id String @id @default(cuid())
    value Int
    @@allow('read', auth() != null)
    @@allow('create', auth().value > 0)

    @@allow('update', auth() != null)
    @@deny('update', auth().value == null || auth().value <= 0)
}
        `;

        const { policy } = await loadSchema(model);

        expect(policy.guard.m.read({ user: undefined })).toEqual(FALSE);
        expect(policy.guard.m.read({ user: { id: '1' } })).toEqual(TRUE);

        expect(policy.guard.m.create({ user: undefined })).toEqual(FALSE);
        expect(policy.guard.m.create({ user: { id: '1' } })).toEqual(FALSE);
        expect(policy.guard.m.create({ user: { id: '1', value: 0 } })).toEqual(FALSE);
        expect(policy.guard.m.create({ user: { id: '1', value: 1 } })).toEqual(TRUE);

        expect(policy.guard.m.update({ user: undefined })).toEqual(FALSE);
        expect(policy.guard.m.update({ user: { id: '1' } })).toEqual(FALSE);
        expect(policy.guard.m.update({ user: { id: '1', value: 0 } })).toEqual(FALSE);
        expect(policy.guard.m.update({ user: { id: '1', value: 1 } })).toEqual(TRUE);
    });

    it('no short-circuit', async () => {
        const model = `
model User {
    id String @id @default(cuid())
    value Int
}

model M {
    id String @id @default(cuid())
    value Int
    @@allow('read', auth() != null && value > 0)
}
        `;

        const { policy } = await loadSchema(model);

        expect(policy.guard.m.read({ user: undefined })).toEqual(
            expect.objectContaining({ AND: [{ OR: [] }, { value: { gt: 0 } }] })
        );
        expect(policy.guard.m.read({ user: { id: '1' } })).toEqual(
            expect.objectContaining({ AND: [{ AND: [] }, { value: { gt: 0 } }] })
        );
    });
});
