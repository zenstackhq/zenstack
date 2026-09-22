import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Self-relation policy tests', () => {
    const tenantSchema = `
type Auth {
    id String @id
    tenantId String
    @@auth
}

model Item {
    id String @id
    tenantId String
    parentId String?
    parent Item? @relation("ItemParent", fields: [parentId], references: [id])
    children Item[] @relation("ItemParent")

    @@allow('all', auth().tenantId == tenantId)
    @@deny('create', parentId != null && parent.tenantId != this.tenantId)
    @@deny('post-update', parentId != null && parent.tenantId != this.tenantId)
}
`;

    it('denies cross-tenant parent via foreign key on create and update', async () => {
        const db = await createPolicyTestClient(tenantSchema);
        const a = db.$setAuth({ id: 'user-a', tenantId: 'a' });
        const b = db.$setAuth({ id: 'user-b', tenantId: 'b' });

        await a.item.create({ data: { id: 'a-parent', tenantId: 'a' } });
        await b.item.create({ data: { id: 'b-parent', tenantId: 'b' } });
        await expect(a.item.findUnique({ where: { id: 'b-parent' } })).toResolveNull();

        // same-tenant create is allowed
        await expect(a.item.create({ data: { id: 'a-child', tenantId: 'a', parentId: 'a-parent' } })).toResolveTruthy();

        // cross-tenant create via fk is denied
        await expect(
            a.item.create({ data: { id: 'a-cross', tenantId: 'a', parentId: 'b-parent' } }),
        ).toBeRejectedByPolicy();

        // cross-tenant update via fk is denied
        await expect(
            a.item.update({ where: { id: 'a-child' }, data: { parentId: 'b-parent' } }),
        ).toBeRejectedByPolicy();
        // cross-tenant update via connect is rejected (target not readable)
        await expect(
            a.item.update({ where: { id: 'a-child' }, data: { parent: { connect: { id: 'b-parent' } } } }),
        ).toBeRejectedNotFound();

        // same-tenant update and clearing the relation are allowed
        await expect(a.item.update({ where: { id: 'a-child' }, data: { parentId: null } })).toResolveTruthy();
        await expect(a.item.update({ where: { id: 'a-child' }, data: { parentId: 'a-parent' } })).toResolveTruthy();
        await expect(a.item.update({ where: { id: 'a-child' }, data: { parentId: null } })).toResolveTruthy();

        // nothing leaked
        await expect(db.$unuseAll().item.findMany({ where: { parentId: 'b-parent' } })).resolves.toHaveLength(0);
    });

    it('reads through self relation with distinct outer/inner rows', async () => {
        const db = await createPolicyTestClient(
            `
model Node {
    id Int @id
    value Int
    parentId Int?
    parent Node? @relation("Tree", fields: [parentId], references: [id])
    children Node[] @relation("Tree")

    @@allow('create', true)
    @@allow('read', parent.value > this.value)
}
`,
        );
        const raw = db.$unuseAll();
        await raw.node.create({ data: { id: 1, value: 10 } });
        await raw.node.create({ data: { id: 2, value: 5, parentId: 1 } });
        await raw.node.create({ data: { id: 3, value: 20, parentId: 1 } });

        // root has no parent -> not readable; 2's parent value 10 > 5 -> readable; 3's 10 > 20 false
        await expect(db.node.findMany()).resolves.toEqual([expect.objectContaining({ id: 2 })]);
    });

    it('works with collection predicate on self relation referencing this', async () => {
        const db = await createPolicyTestClient(
            `
model Node {
    id Int @id
    value Int
    parentId Int?
    parent Node? @relation("Tree", fields: [parentId], references: [id])
    children Node[] @relation("Tree")

    @@allow('create', true)
    @@allow('read', children?[value > this.value])
}
`,
        );
        const raw = db.$unuseAll();
        await raw.node.create({ data: { id: 1, value: 10 } });
        await raw.node.create({ data: { id: 2, value: 5, parentId: 1 } });
        await raw.node.create({ data: { id: 3, value: 20, parentId: 1 } });
        await raw.node.create({ data: { id: 4, value: 1, parentId: 3 } });

        // 1 has child 3 (20 > 10) -> readable; 3 has child 4 (1 > 20 false); 2 and 4 have no children
        await expect(db.node.findMany()).resolves.toEqual([expect.objectContaining({ id: 1 })]);
    });

    it('works with multi-hop self relation access', async () => {
        const db = await createPolicyTestClient(
            `
model Node {
    id Int @id
    value Int
    parentId Int?
    parent Node? @relation("Tree", fields: [parentId], references: [id])
    children Node[] @relation("Tree")

    @@allow('create', true)
    @@allow('read', parent.parent.value > this.value)
}
`,
        );
        const raw = db.$unuseAll();
        await raw.node.create({ data: { id: 1, value: 10 } });
        await raw.node.create({ data: { id: 2, value: 100, parentId: 1 } });
        await raw.node.create({ data: { id: 3, value: 5, parentId: 2 } });
        await raw.node.create({ data: { id: 4, value: 50, parentId: 2 } });

        // 3's grandparent is 1 (10 > 5) -> readable; 4: 10 > 50 false
        await expect(db.node.findMany()).resolves.toEqual([expect.objectContaining({ id: 3 })]);
    });

    it('works with this-rooted self relation nested inside a collection predicate', async () => {
        const db = await createPolicyTestClient(
            `
model Node {
    id Int @id
    value Int
    parentId Int?
    parent Node? @relation("Tree", fields: [parentId], references: [id])
    children Node[] @relation("Tree")

    @@allow('create', true)
    // readable if it has two distinct children with the same value
    @@allow('read', children?[c, this.children?[id != c.id && value == c.value]])
}
`,
        );
        const raw = db.$unuseAll();
        await raw.node.create({ data: { id: 1, value: 0 } });
        await raw.node.create({ data: { id: 2, value: 5, parentId: 1 } });
        await raw.node.create({ data: { id: 3, value: 5, parentId: 1 } });
        await raw.node.create({ data: { id: 4, value: 0 } });
        await raw.node.create({ data: { id: 5, value: 1, parentId: 4 } });
        await raw.node.create({ data: { id: 6, value: 2, parentId: 4 } });

        await expect(db.node.findMany()).resolves.toEqual([expect.objectContaining({ id: 1 })]);
    });

    it('works with binding-rooted self relation nested inside a collection predicate', async () => {
        const db = await createPolicyTestClient(
            `
model Node {
    id Int @id
    value Int
    parentId Int?
    parent Node? @relation("Tree", fields: [parentId], references: [id])
    children Node[] @relation("Tree")

    @@allow('create', true)
    // readable if it has a child that has two distinct children with the same value
    @@allow('read', children?[c, c.children?[d, c.children?[id != d.id && value == d.value]]])
}
`,
        );
        const raw = db.$unuseAll();
        await raw.node.create({ data: { id: 1, value: 0 } });
        await raw.node.create({ data: { id: 2, value: 0, parentId: 1 } });
        await raw.node.create({ data: { id: 3, value: 7, parentId: 2 } });
        await raw.node.create({ data: { id: 4, value: 7, parentId: 2 } });
        await raw.node.create({ data: { id: 5, value: 0 } });
        await raw.node.create({ data: { id: 6, value: 0, parentId: 5 } });
        await raw.node.create({ data: { id: 7, value: 1, parentId: 6 } });
        await raw.node.create({ data: { id: 8, value: 2, parentId: 6 } });

        await expect(db.node.findMany()).resolves.toEqual([expect.objectContaining({ id: 1 })]);
    });

    it('works with self many-to-many relation', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    name String
    friends User[] @relation("Friends")
    friendOf User[] @relation("Friends")

    @@allow('create', true)
    @@allow('read', friends?[name == this.name])
}
`,
            { usePrismaPush: true },
        );
        const raw = db.$unuseAll();
        await raw.user.create({ data: { id: 1, name: 'x' } });
        await raw.user.create({ data: { id: 2, name: 'x', friends: { connect: { id: 1 } } } });
        await raw.user.create({ data: { id: 3, name: 'y', friends: { connect: { id: 1 } } } });

        // 2 has friend 1 with same name -> readable; 3's friend 1 has a different name; 1 has no friends
        await expect(db.user.findMany()).resolves.toEqual([expect.objectContaining({ id: 2 })]);
    });
});
