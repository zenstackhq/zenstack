import { createPolicyTestClient } from '@zenstackhq/testtools';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2394', () => {
    it('should work with post-update rules when uuid fields are used', async () => {
        const db = await createPolicyTestClient(
            `
model Item {
    id     String @id @default(uuid()) @db.Uuid
    status String

    @@allow('create,read,update', true)
    @@deny('post-update', before().status == status)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        const item = await db.item.create({ data: { status: 'draft' } });

        // updating with a different status should succeed (post-update policy: deny if status didn't change)
        const updated = await db.item.update({ where: { id: item.id }, data: { status: 'published' } });
        expect(updated.status).toBe('published');

        // updating with the same status should be denied
        await expect(
            db.item.update({ where: { id: updated.id }, data: { status: 'published' } }),
        ).toBeRejectedByPolicy();
    });

    it('should work with policies comparing string field with uuid field', async () => {
        const db = await createPolicyTestClient(
            `
model Foo {
    id    String @id @default(uuid()) @db.Uuid
    id1   String
    value Int
    @@allow('all', id == id1)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        const newId = randomUUID();

        await expect(db.foo.create({ data: { id: newId, id1: newId, value: 0 } })).toResolveTruthy();
        await expect(db.foo.update({ where: { id: newId }, data: { value: 1 } })).toResolveTruthy();
    });

    it('should work with policies comparing related @db.Uuid field to plain string field (single-hop)', async () => {
        // `owner.tag` (a non-FK @db.Uuid field) generates a correlated subquery whose result
        // type is uuid, compared against tagRef which is plain text. FK fields are all kept
        // type-compatible so the migration engine doesn't reject the schema.
        const db = await createPolicyTestClient(
            `
model User {
    id    String @id @default(uuid()) @db.Uuid
    tag   String @db.Uuid
    items Item[]

    @@allow('all', true)
}

model Item {
    id      String @id @default(uuid()) @db.Uuid
    ownerId String @db.Uuid
    owner   User   @relation(fields: [ownerId], references: [id])
    tagRef  String

    @@allow('all', owner.tag == tagRef)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        const rawDb = db.$unuseAll();
        const tag = randomUUID();
        const user = await rawDb.user.create({ data: { tag } });
        await rawDb.item.create({ data: { ownerId: user.id, tagRef: tag } });

        const items = await db.item.findMany();
        expect(items).toHaveLength(1);
    });

    it('should work with policies comparing related @db.Uuid field to plain string field (multi-hop)', async () => {
        // `org.owner.token` is a two-hop chain through non-FK @db.Uuid fields; without
        // multi-hop traversal the terminal FieldDef is invisible and the uuid/text mismatch
        // is not caught. All FK fields are kept type-compatible with their PKs.
        const db = await createPolicyTestClient(
            `
model User {
    id        String      @id @default(uuid()) @db.Uuid
    token     String      @db.Uuid
    ownedOrgs Org[]
    orgs      OrgMember[]

    @@allow('all', true)
}

model Org {
    id      String      @id @default(uuid()) @db.Uuid
    ownerId String      @db.Uuid
    owner   User        @relation(fields: [ownerId], references: [id])
    members OrgMember[]

    @@allow('all', true)
}

model OrgMember {
    id         String @id @default(uuid()) @db.Uuid
    orgId      String @db.Uuid
    org        Org    @relation(fields: [orgId], references: [id])
    userId     String @db.Uuid
    user       User   @relation(fields: [userId], references: [id])
    tokenRef   String

    @@allow('all', org.owner.token == tokenRef)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        const rawDb = db.$unuseAll();
        const token = randomUUID();
        const user = await rawDb.user.create({ data: { token } });
        const org = await rawDb.org.create({ data: { ownerId: user.id } });
        await rawDb.orgMember.create({ data: { orgId: org.id, userId: user.id, tokenRef: token } });

        const members = await db.orgMember.findMany();
        expect(members).toHaveLength(1);
    });

    it('should work with policies comparing @db.Uuid field to auth()', async () => {
        // Exercises transformAuthBinary: `id == auth()` expands to `id == auth().id`, where auth().id
        // is emitted as a text parameter even though the auth model's id also has @db.Uuid.
        const db = await createPolicyTestClient(
            `
model User {
    id    String @id @default(uuid()) @db.Uuid
    value Int

    @@allow('all', id == auth().id)
}
            `,
            { provider: 'postgresql', usePrismaPush: true },
        );

        const rawDb = db.$unuseAll();
        const user = await rawDb.user.create({ data: { value: 0 } });

        const authedDb = db.$setAuth(user);
        await expect(authedDb.user.findMany()).toResolveTruthy();
        await expect(authedDb.user.update({ where: { id: user.id }, data: { value: 1 } })).toResolveTruthy();
    });
});
