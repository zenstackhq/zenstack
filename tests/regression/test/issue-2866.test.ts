import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2866
describe('Regression for issue #2866', () => {
    const schema = `
enum Permission {
  VIEW
  EDIT
}

model Anchor {
  id                Int        @id
  defaultPermission Permission @default(VIEW)
  approvals         Approval[]
  roles             Role[]
  grants            Grant[]
  @@allow('all', true)
}

model Approval {
  id          Int          @id
  anchorId    Int
  anchor      Anchor       @relation(fields: [anchorId], references: [id])
  permission  Permission   @default(VIEW)
  permissions Permission[]
  @@allow('all', true)
}

model Role {
  id          Int          @id
  anchorId    Int
  anchor      Anchor       @relation(fields: [anchorId], references: [id])
  permissions Permission[]
  @@allow('read', true)
  @@allow('create', anchor.approvals?[permissions == this.permissions])
  @@allow('update', anchor.approvals?[permissions != this.permissions])
}

model Grant {
  id         Int        @id
  anchorId   Int
  anchor     Anchor     @relation(fields: [anchorId], references: [id])
  permission Permission
  @@allow('read', true)
  @@allow('create', permission == anchor.defaultPermission || anchor.approvals?[permission == this.permission])
}
`;

    async function setup() {
        const db = await createPolicyTestClient(schema, { provider: 'postgresql', usePrismaPush: true });
        const raw = db.$unuseAll();
        await raw.anchor.create({ data: { id: 1 } });
        await raw.anchor.create({ data: { id: 2 } });
        await raw.approval.create({ data: { id: 1, anchorId: 1, permissions: ['VIEW', 'EDIT'] } });
        await raw.approval.create({ data: { id: 2, anchorId: 2, permission: 'EDIT' } });
        return db;
    }

    it('compares a stored enum array with the create input', async () => {
        const db = await setup();

        await expect(
            db.role.create({ data: { id: 1, anchorId: 1, permissions: ['VIEW', 'EDIT'] } }),
        ).resolves.toMatchObject({ permissions: ['VIEW', 'EDIT'] });

        // array equality keeps order and multiplicity
        await expect(
            db.role.create({ data: { id: 2, anchorId: 1, permissions: ['EDIT', 'VIEW'] } }),
        ).toBeRejectedByPolicy();
        await expect(db.role.create({ data: { id: 3, anchorId: 1, permissions: ['VIEW'] } })).toBeRejectedByPolicy();
        await expect(
            db.role.create({ data: { id: 4, anchorId: 1, permissions: ['VIEW', 'EDIT', 'EDIT'] } }),
        ).toBeRejectedByPolicy();
    });

    it('compares stored enum arrays on update', async () => {
        const db = await setup();
        const raw = db.$unuseAll();
        await raw.role.create({ data: { id: 1, anchorId: 1, permissions: ['VIEW', 'EDIT'] } });
        await raw.role.create({ data: { id: 2, anchorId: 1, permissions: ['VIEW'] } });

        await expect(db.role.update({ where: { id: 1 }, data: { permissions: ['EDIT'] } })).toBeRejectedNotFound();
        await expect(db.role.update({ where: { id: 2 }, data: { permissions: ['EDIT'] } })).resolves.toMatchObject({
            permissions: ['EDIT'],
        });
    });

    it('compares a stored enum with the create input', async () => {
        const db = await setup();

        // top-level field compared with a relation field
        await expect(db.grant.create({ data: { id: 1, anchorId: 1, permission: 'VIEW' } })).resolves.toMatchObject({
            permission: 'VIEW',
        });
        // `this` field compared inside a collection predicate
        await expect(db.grant.create({ data: { id: 2, anchorId: 2, permission: 'EDIT' } })).resolves.toMatchObject({
            permission: 'EDIT',
        });
        await expect(db.grant.create({ data: { id: 3, anchorId: 1, permission: 'EDIT' } })).toBeRejectedByPolicy();
    });
});
