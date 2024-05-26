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

        const m = policy.policy.m.modelLevel;

        expect((m.read.guard as Function)({ user: undefined })).toEqual(FALSE);
        expect((m.read.guard as Function)({ user: { id: '1' } })).toEqual(TRUE);

        expect((m.create.guard as Function)({ user: undefined })).toEqual(FALSE);
        expect((m.create.guard as Function)({ user: { id: '1' } })).toEqual(FALSE);
        expect((m.create.guard as Function)({ user: { id: '1', value: 0 } })).toEqual(FALSE);
        expect((m.create.guard as Function)({ user: { id: '1', value: 1 } })).toEqual(TRUE);

        expect((m.update.guard as Function)({ user: undefined })).toEqual(FALSE);
        expect((m.update.guard as Function)({ user: { id: '1' } })).toEqual(FALSE);
        expect((m.update.guard as Function)({ user: { id: '1', value: 0 } })).toEqual(FALSE);
        expect((m.update.guard as Function)({ user: { id: '1', value: 1 } })).toEqual(TRUE);
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

        expect((policy.policy.m.modelLevel.read.guard as Function)({ user: undefined })).toEqual(
            expect.objectContaining({ AND: [{ OR: [] }, { value: { gt: 0 } }] })
        );
        expect((policy.policy.m.modelLevel.read.guard as Function)({ user: { id: '1' } })).toEqual(
            expect.objectContaining({ AND: [{ AND: [] }, { value: { gt: 0 } }] })
        );
    });

    it('auth() multiple level member access', async () => {
        const model = `
         model User {
            id Int @id @default(autoincrement())
            cart Cart?
          }
          
          model Cart {
            id Int @id @default(autoincrement())
            tasks Task[]
            user User @relation(fields: [userId], references: [id])
            userId Int @unique
          }
          
          model Task {
            id Int @id @default(autoincrement())
            cart Cart @relation(fields: [cartId], references: [id])
            cartId Int
            value Int
            @@allow('read', auth().cart.tasks?[id == 123] && value >10)
          }
                `;

        const { policy } = await loadSchema(model);
        expect(
            (policy.policy.task.modelLevel.read.guard as Function)({ user: { cart: { tasks: [{ id: 1 }] } } })
        ).toEqual(expect.objectContaining({ AND: [{ OR: [] }, { value: { gt: 10 } }] }));

        expect(
            (policy.policy.task.modelLevel.read.guard as Function)({ user: { cart: { tasks: [{ id: 123 }] } } })
        ).toEqual(expect.objectContaining({ AND: [{ AND: [] }, { value: { gt: 10 } }] }));
    });
});
