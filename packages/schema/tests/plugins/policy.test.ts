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

        expect(policy.guard.m.read({ user: undefined })).toEqual(false);
        expect(policy.guard.m.read({ user: { id: '1' } })).toEqual(true);

        expect(policy.guard.m.create({ user: undefined })).toEqual(false);
        expect(policy.guard.m.create({ user: { id: '1' } })).toEqual(false);
        expect(policy.guard.m.create({ user: { id: '1', value: 0 } })).toEqual(false);
        expect(policy.guard.m.create({ user: { id: '1', value: 1 } })).toEqual(true);

        expect(policy.guard.m.update({ user: undefined })).toEqual(false);
        expect(policy.guard.m.update({ user: { id: '1' } })).toEqual(false);
        expect(policy.guard.m.update({ user: { id: '1', value: 0 } })).toEqual(false);
        expect(policy.guard.m.update({ user: { id: '1', value: 1 } })).toEqual(true);
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
            expect.objectContaining({ AND: [{ zenstack_guard: false }, { value: { gt: 0 } }] })
        );
        expect(policy.guard.m.read({ user: { id: '1' } })).toEqual(
            expect.objectContaining({ AND: [{ zenstack_guard: true }, { value: { gt: 0 } }] })
        );
    });
});
