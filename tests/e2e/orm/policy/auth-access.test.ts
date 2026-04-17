import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Auth access tests', () => {
    it('works with simple auth model', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    age Int
}

model Foo {
    id Int @id
    name String
    @@allow('all', auth().age > 18)
}
`,
        );

        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test' } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ age: 15 }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ age: 20 }).foo.findFirst()).toResolveTruthy();
    });

    it('works with simple auth type', async () => {
        const db = await createPolicyTestClient(
            `
type User {
    age Int
    @@auth
}

model Foo {
    id Int @id
    name String
    @@allow('all', auth().age > 18)
}
`,
        );

        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test' } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ age: 15 }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ age: 20 }).foo.findFirst()).toResolveTruthy();
    });

    it('works with deep model value access', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    profile Profile?
}

model Profile {
    id Int @id
    user User @relation(fields: [userId], references: [id])
    userId Int @unique
    age Int
}

model Foo {
    id Int @id
    name String
    @@allow('all', auth().profile.age > 18)
}`,
        );
        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test' } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profile: { age: 15 } }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ profile: { age: 20 } }).foo.findFirst()).toResolveTruthy();
    });

    it('works with deep type value access', async () => {
        const db = await createPolicyTestClient(
            `
type User {
    profile Profile?
    @@auth
}

type Profile {
    age Int
}

model Foo {
    id Int @id
    name String
    @@allow('all', auth().profile.age > 18)
}`,
        );
        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test' } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({}).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ profile: { age: 15 } }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ profile: { age: 20 } }).foo.findFirst()).toResolveTruthy();
    });

    it('works with shallow auth model simple collection predicates', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    profiles Profile[]
}

model Profile {
    id Int @id
    user User @relation(fields: [userId], references: [id])
    userId Int
    age Int
}

model Foo {
    id Int @id
    name String
    @@allow('all', auth().profiles?[age > 18])
}
`,
        );

        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test' } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profiles: [{ age: 15 }] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ profiles: [{ age: 20 }] }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ profiles: [{ age: 15 }, { age: 20 }] }).foo.findFirst()).toResolveTruthy();
    });

    it('uses iterator binding inside collection predicate for auth model', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    tenantId Int
    memberships Membership[] @relation("UserMemberships")
}

model Membership {
    id Int @id
    tenantId Int
    userId Int
    user User @relation("UserMemberships", fields: [userId], references: [id])
}

model Foo {
    id Int @id
    tenantId Int
    @@allow('read', auth().memberships?[m, m.tenantId == auth().tenantId])
}
`,
        );

        await db.$unuseAll().foo.createMany({
            data: [
                { id: 1, tenantId: 1 },
                { id: 2, tenantId: 2 },
            ],
        });

        // allowed because iterator binding matches tenantId = 1
        await expect(
            db.$setAuth({ tenantId: 1, memberships: [{ id: 10, tenantId: 1 }] }).foo.findMany(),
        ).toResolveWithLength(2);

        // denied because membership tenantId doesn't match
        await expect(
            db.$setAuth({ tenantId: 1, memberships: [{ id: 20, tenantId: 3 }] }).foo.findMany(),
        ).toResolveWithLength(0);
    });

    it('works with shallow auth model collection predicates involving fields - some', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    profiles Profile[]
}

model Profile {
    id Int @id
    user User @relation(fields: [userId], references: [id])
    userId Int
    age Int
}

model Foo {
    id Int @id
    name String
    requiredAge Int
    @@allow('all', auth().profiles?[age >= this.requiredAge])
}
`,
        );

        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test', requiredAge: 18 } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profiles: [] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profiles: [{ age: 15 }] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ profiles: [{ age: 20 }] }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ profiles: [{ age: 15 }, { age: 20 }] }).foo.findFirst()).toResolveTruthy();
    });

    it('works with deep auth model simple collection predicates', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    profiles Profile[]
}

model Profile {
    id Int @id
    user User @relation(fields: [userId], references: [id])
    userId Int
    records ProfileRecord[]
}

model ProfileRecord {
    id Int @id
    age Int
    profile Profile @relation(fields: [profileId], references: [id])
    profileId Int
}

model Foo {
    id Int @id
    name String
    @@allow('all', auth().profiles?[records?[age > 18]])
}
`,
        );

        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test' } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profiles: [] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profiles: [{ records: [] }] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profiles: [{ records: [{ age: 15 }] }] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ profiles: [{ records: [{ age: 20 }] }] }).foo.findFirst()).toResolveTruthy();
        await expect(
            db.$setAuth({ profiles: [{ records: [{ age: 15 }] }, { records: [{ age: 20 }] }] }).foo.findFirst(),
        ).toResolveTruthy();
        await expect(
            db.$setAuth({ profiles: [{ records: [{ age: 15 }, { age: 20 }] }] }).foo.findFirst(),
        ).toResolveTruthy();
    });

    it('works with shallow auth type collection predicates involving fields - some', async () => {
        const db = await createPolicyTestClient(
            `
type User {
    profiles Profile[]
}

type Profile {
    age Int
}

model Foo {
    id Int @id
    name String
    requiredAge Int
    @@allow('all', auth().profiles?[age >= this.requiredAge])
}
`,
        );

        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test', requiredAge: 18 } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profiles: [] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, profiles: [{ age: 15 }] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ profiles: [{ age: 20 }] }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ profiles: [{ age: 15 }, { age: 20 }] }).foo.findFirst()).toResolveTruthy();
    });

    it('works with shallow auth model collection predicates involving fields - every', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    profiles Profile[]
}

model Profile {
    id Int @id
    user User @relation(fields: [userId], references: [id])
    userId Int
    age Int
}

model Foo {
    id Int @id
    name String
    requiredAge Int
    @@allow('all', auth().profiles![age >= this.requiredAge])
}
`,
        );

        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test', requiredAge: 18 } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ id: 1, profiles: [] }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ id: 1, profiles: [{ age: 15 }] }).foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ profiles: [{ age: 18 }, { age: 20 }] }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ profiles: [{ age: 15 }, { age: 20 }] }).foo.findFirst()).toResolveFalsy();
    });

    it('works with shallow auth model collection predicates involving fields - none', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    profiles Profile[]
}

model Profile {
    id Int @id
    user User @relation(fields: [userId], references: [id])
    userId Int
    age Int
}

model Foo {
    id Int @id
    name String
    requiredAge Int
    @@allow('all', auth().profiles^[age >= this.requiredAge])
}
`,
        );

        await db.$unuseAll().foo.create({ data: { id: 1, name: 'Test', requiredAge: 18 } });
        await expect(db.foo.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ id: 1, profiles: [] }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ id: 1, profiles: [{ age: 15 }] }).foo.findFirst()).toResolveTruthy();
        await expect(db.$setAuth({ profiles: [{ age: 15 }, { age: 18 }] }).foo.findFirst()).toResolveNull();
    });

    it('works with deep auth model collection predicates involving fields', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    roles Role[]
}

model Role {
    id Int @id
    user User @relation(fields: [userId], references: [id])
    userId Int
    permissions Permission[]
}

model Permission {
    id Int @id
    role Role @relation(fields: [roleId], references: [id])
    roleId Int
    canReadTypes String[]
}

model Post {
    id Int @id
    type String
    @@allow('all', auth().roles?[permissions![this.type in canReadTypes]] )
}
`,
            { provider: 'postgresql' },
        );

        await db.$unuseAll().post.create({ data: { id: 1, type: 'News' } });

        await expect(db.post.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1 }).post.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, roles: [] }).post.findFirst()).toResolveNull();
        await expect(db.$setAuth({ id: 1, roles: [{ permissions: [] }] }).post.findFirst()).toResolveTruthy();
        await expect(
            db.$setAuth({ id: 1, roles: [{ permissions: [{ canReadTypes: [] }] }] }).post.findFirst(),
        ).toResolveNull();
        await expect(
            db.$setAuth({ id: 1, roles: [{ permissions: [{ canReadTypes: ['News'] }] }] }).post.findFirst(),
        ).toResolveTruthy();
        await expect(
            db.$setAuth({ roles: [{ permissions: [{ canReadTypes: ['Blog'] }] }] }).post.findFirst(),
        ).toResolveNull();
        await expect(
            db.$setAuth({ roles: [{ permissions: [{ canReadTypes: ['Blog', 'News'] }] }] }).post.findFirst(),
        ).toResolveTruthy();
        await expect(
            db
                .$setAuth({ roles: [{ permissions: [{ canReadTypes: ['Blog'] }, { canReadTypes: ['News'] }] }] })
                .post.findFirst(),
        ).toResolveNull();
        await expect(
            db
                .$setAuth({
                    roles: [
                        { permissions: [{ canReadTypes: ['Blog'] }] },
                        { permissions: [{ canReadTypes: ['News', 'Story'] }, { canReadTypes: ['Weather'] }] },
                    ],
                })
                .post.findFirst(),
        ).toResolveNull();
        await expect(
            db
                .$setAuth({
                    roles: [{ permissions: [{ canReadTypes: ['Blog', 'News'] }, { canReadTypes: ['News'] }] }],
                })
                .post.findFirst(),
        ).toResolveTruthy();
    });

    it('works with regression1', async () => {
        const schema = `
model User { 
  id Int @id @default(autoincrement())
  permissions Permission[]
}

model Permission {
  id Int @id @default(autoincrement())
  name String
  canUpdateChannelById Int[]
  user User @relation(fields: [userId], references: [id])
  userId Int
}

model Channel {
  id Int @id @default(autoincrement())
  name String

  @@allow('create,read', true)
  @@allow('update', auth().permissions?[this.id in canUpdateChannelById])
}
`;

        const db = await createPolicyTestClient(schema, { provider: 'postgresql' });

        await db.channel.create({ data: { id: 1, name: 'general' } });

        await expect(db.channel.update({ where: { id: 1 }, data: { name: 'general-updated' } })).toBeRejectedNotFound();

        const userDb1 = db.$setAuth({
            id: 3,
            permissions: [
                {
                    id: 3,
                    name: 'update-general',
                    canUpdateChannelById: [2],
                },
            ],
        });
        await expect(
            userDb1.channel.update({ where: { id: 1 }, data: { name: 'general-updated' } }),
        ).toBeRejectedNotFound();

        const userDb2 = db.$setAuth({
            id: 3,
            permissions: [
                {
                    id: 3,
                    name: 'update-general',
                    canUpdateChannelById: [1],
                },
            ],
        });
        await expect(
            userDb2.channel.update({ where: { id: 1 }, data: { name: 'general-updated' } }),
        ).resolves.toBeTruthy();
    });
});
