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
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveNull();
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
        await expect(db.$setAuth({ id: 1 }).foo.findFirst()).toResolveNull();
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

    it('resolves this.relation.field against @@allow model in collection predicates (Fix #1)', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    level Int
    permissions Permission[]
    posts Post[]
    @@auth
}

model Permission {
    id Int @id @default(autoincrement())
    user User @relation(fields: [userId], references: [id])
    userId Int
    clearance Int
}

model Post {
    id Int @id @default(autoincrement())
    author User @relation(fields: [authorId], references: [id])
    authorId Int

    @@allow('read', auth().permissions?[p, p.clearance >= this.author.level])
}
`,
            { provider: 'postgresql' },
        );

        await db.$unuseAll().post.create({
            data: { id: 1, author: { create: { id: 1, level: 5 } } },
        });
        await db.$unuseAll().post.create({
            data: { id: 2, author: { create: { id: 2, level: 10 } } },
        });

        // no auth: no permissions → cannot read any post
        await expect(db.post.findMany()).resolves.toHaveLength(0);

        // clearance 5: can read author level ≤ 5 → only post 1 (author level 5)
        const user1 = db.$setAuth({
            id: 3,
            permissions: [{ id: 1, clearance: 5 }],
        });
        const posts1 = await user1.post.findMany();
        expect(posts1.map((p) => p.id).sort()).toEqual([1]);

        // clearance 10: can read author level ≤ 10 → both posts
        const user2 = db.$setAuth({
            id: 4,
            permissions: [{ id: 2, clearance: 10 }],
        });
        const posts2 = await user2.post.findMany();
        expect(posts2.map((p) => p.id).sort()).toEqual([1, 2]);
    });

    it('handles this.relation.arrayField with in operator (Fix #2)', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    permissions Permission[]
    @@auth
}

model Group {
    id Int @id @default(autoincrement())
    visibleDocIds Int[]
    docs Doc[]
}

model Permission {
    id Int @id @default(autoincrement())
    user User @relation(fields: [userId], references: [id])
    userId Int
    allowedDocIds Int[]
}

model Doc {
    id Int @id @default(autoincrement())
    group Group @relation(fields: [groupId], references: [id])
    groupId Int

    @@allow('read',
        auth().permissions?[p, this.id in p.allowedDocIds] ||
        this.id in this.group.visibleDocIds
    )
}
`,
            { provider: 'postgresql' },
        );

        await db.$unuseAll().group.create({
            data: { id: 1, visibleDocIds: [1] },
        });
        await db.$unuseAll().group.create({
            data: { id: 2, visibleDocIds: [] },
        });
        await db.$unuseAll().user.create({
            data: { id: 1 },
        });
        await db.$unuseAll().user.create({
            data: { id: 2 },
        });
        await db.$unuseAll().permission.create({
            data: { id: 10, userId: 2, allowedDocIds: [2] },
        });
        await db.$unuseAll().doc.createMany({
            data: [
                { id: 1, groupId: 1 },
                { id: 2, groupId: 2 },
            ],
        });

        // User 1 (no perms): doc 1 visible via group.visibleDocIds
        const user1 = db.$setAuth({ id: 1, permissions: [] });
        expect((await user1.doc.findMany()).map((d) => d.id).sort()).toEqual([1]);

        // User 2 (perm allows doc 2): sees doc 1 (group-visible) + doc 2 (permission)
        const user2 = db.$setAuth({
            id: 2,
            permissions: [{ id: 10, allowedDocIds: [2] }],
        });
        expect((await user2.doc.findMany()).map((d) => d.id).sort()).toEqual([1, 2]);
    });

    it('keeps this-rooted collection predicates on the @@allow model inside auth bindings (Fix #3)', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id
    assignments RoleAssignment[]
    @@auth
}

model Scope {
    id Int @id
    parentId Int?
    parent Scope? @relation("ScopeParent", fields: [parentId], references: [id])
    children Scope[] @relation("ScopeParent")
    ancestors ScopeClosure[] @relation("Descendant")
    descendants ScopeClosure[] @relation("Ancestor")
    docs Doc[]
    assignments RoleAssignment[]
    @@allow('all', true)
}

model ScopeClosure {
    ancestorId Int
    descendantId Int
    ancestor Scope @relation("Ancestor", fields: [ancestorId], references: [id])
    descendant Scope @relation("Descendant", fields: [descendantId], references: [id])
    @@id([ancestorId, descendantId])
    @@allow('all', true)
}

model RoleAssignment {
    id Int @id
    userId Int
    scopeId Int
    user User @relation(fields: [userId], references: [id])
    scope Scope @relation(fields: [scopeId], references: [id])
    @@allow('all', true)
}

model Doc {
    id Int @id
    authScopeId Int
    authScope Scope @relation(fields: [authScopeId], references: [id])

    @@allow('read', auth().assignments?[rs,
        rs.scope == this.authScope ||
        this.authScope.ancestors?[ancestor == rs.scope]
    ])
}
`,
            { provider: 'postgresql' },
        );

        await db.$unuseAll().scope.createMany({
            data: [
                { id: 1 },
                { id: 2, parentId: 1 },
            ],
        });
        await db.$unuseAll().scopeClosure.createMany({
            data: [
                { ancestorId: 1, descendantId: 1 },
                { ancestorId: 2, descendantId: 2 },
                { ancestorId: 1, descendantId: 2 },
            ],
        });
        await db.$unuseAll().doc.create({
            data: { id: 1, authScopeId: 2 },
        });

        const reader = db.$setAuth({
            id: 1,
            assignments: [{ id: 1, scopeId: 1, scope: { id: 1 } }],
        });

        await expect(reader.doc.findUnique({ where: { id: 1 } })).toResolveTruthy();
    });
});
