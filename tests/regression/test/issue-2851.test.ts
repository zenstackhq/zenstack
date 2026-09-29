import { createPolicyTestClient } from '@zenstackhq/testtools';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2851', () => {
    async function createClient(schema: string) {
        const sqls: string[] = [];
        const db = await createPolicyTestClient(schema, {
            provider: 'postgresql',
            usePrismaPush: true,
            log: (event) => {
                if (event.level === 'query') {
                    sqls.push(event.query.sql);
                }
            },
        });
        return { db, sqls };
    }

    it('does not cast a uuid column when comparing with a uuid auth() field', async () => {
        const { db, sqls } = await createClient(
            `
model User {
    id          String @id @default(uuid()) @db.Uuid
    memberships Membership[]
    @@allow('all', true)
}

model Membership {
    id     String @id @default(uuid()) @db.Uuid
    userID String @db.Uuid
    user   User   @relation(fields: [userID], references: [id])
    @@allow('read', userID == auth().id)
}
            `,
        );

        const rawDb = db.$unuseAll();
        const user1 = await rawDb.user.create({ data: {} });
        const user2 = await rawDb.user.create({ data: {} });
        await rawDb.membership.create({ data: { userID: user1.id } });
        await rawDb.membership.create({ data: { userID: user2.id } });

        sqls.length = 0;
        const result = await db.$setAuth({ id: user1.id }).membership.findMany();
        expect(result).toHaveLength(1);
        expect(result[0]!.userID).toBe(user1.id);

        const query = sqls.find((sql) => sql.includes('from "public"."Membership"'));
        expect(query).toBeDefined();
        expect(query).not.toContain('cast(');
        expect(query).toContain('"Membership"."userID" = $1');
    });

    it('does not cast a uuid column when comparing a relation with auth()', async () => {
        const { db, sqls } = await createClient(
            `
model User {
    id          String @id @default(uuid()) @db.Uuid
    memberships Membership[]
    @@allow('all', true)
}

model Membership {
    id     String @id @default(uuid()) @db.Uuid
    userID String @db.Uuid
    user   User   @relation(fields: [userID], references: [id])
    @@allow('read', user == auth())
}
            `,
        );

        const rawDb = db.$unuseAll();
        const user1 = await rawDb.user.create({ data: {} });
        const user2 = await rawDb.user.create({ data: {} });
        await rawDb.membership.create({ data: { userID: user1.id } });
        await rawDb.membership.create({ data: { userID: user2.id } });

        sqls.length = 0;
        const result = await db.$setAuth({ id: user1.id }).membership.findMany();
        expect(result).toHaveLength(1);
        expect(result[0]!.userID).toBe(user1.id);

        const query = sqls.find((sql) => sql.includes('from "public"."Membership"'));
        expect(query).toBeDefined();
        expect(query).not.toContain('as text');
    });

    it('still works when comparing a plain string column with a uuid auth() field', async () => {
        const { db } = await createClient(
            `
model User {
    id String @id @default(uuid()) @db.Uuid
    @@allow('all', true)
}

model Item {
    id      String @id @default(uuid()) @db.Uuid
    ownerId String
    @@allow('all', ownerId == auth().id)
}
            `,
        );

        const rawDb = db.$unuseAll();
        const uid = randomUUID();
        await rawDb.user.create({ data: { id: uid } });
        await rawDb.item.create({ data: { ownerId: uid } });
        await rawDb.item.create({ data: { ownerId: randomUUID() } });

        const result = await db.$setAuth({ id: uid }).item.findMany();
        expect(result).toHaveLength(1);
        expect(result[0]!.ownerId).toBe(uid);
    });

    it('does not cast a uuid column when comparing with a plain string auth() field', async () => {
        const { db, sqls } = await createClient(
            `
model User {
    id String @id @default(uuid())
    @@allow('all', true)
}

model Item {
    id      String @id @default(uuid()) @db.Uuid
    ownerId String @db.Uuid
    @@allow('all', ownerId == auth().id)
}
            `,
        );

        const rawDb = db.$unuseAll();
        const uid = randomUUID();
        await rawDb.user.create({ data: { id: uid } });
        await rawDb.item.create({ data: { ownerId: uid } });
        await rawDb.item.create({ data: { ownerId: randomUUID() } });

        sqls.length = 0;
        const result = await db.$setAuth({ id: uid }).item.findMany();
        expect(result).toHaveLength(1);
        expect(result[0]!.ownerId).toBe(uid);

        // the auth value is a bound parameter, PostgreSQL infers its type from the column
        const query = sqls.find((sql) => sql.includes('from "public"."Item"'));
        expect(query).not.toContain('cast(');
        expect(query).toContain('"Item"."ownerId" = $1');
    });

    it('denies instead of failing when auth() id is not a well-formed uuid', async () => {
        const { db } = await createClient(
            `
model User {
    id String @id @default(uuid())
    @@allow('all', true)
}

model Item {
    id      String @id @default(uuid()) @db.Uuid
    ownerId String @db.Uuid
    @@allow('read', ownerId == auth().id)
}

model Note {
    id      String  @id @default(uuid()) @db.Uuid
    ownerId String? @db.Uuid
    @@allow('read', ownerId != auth().id)
}
            `,
        );

        const rawDb = db.$unuseAll();
        const uid = randomUUID();
        await rawDb.item.create({ data: { ownerId: uid } });
        const note = await rawDb.note.create({ data: { ownerId: uid } });
        // a note with null owner: `ownerId != x` is null in SQL, so it must never match
        await rawDb.note.create({ data: { ownerId: null } });

        const badAuthDb = db.$setAuth({ id: 'not-a-uuid' });
        // `==` against a malformed uuid is always false
        await expect(badAuthDb.item.findMany()).resolves.toHaveLength(0);
        // `!=` against a malformed uuid is true for non-null columns only
        const notes = await badAuthDb.note.findMany();
        expect(notes).toHaveLength(1);
        expect(notes[0]!.id).toBe(note.id);

        // well-formed uuids are still compared natively regardless of casing or dashes
        await expect(db.$setAuth({ id: uid.toUpperCase() }).item.findMany()).resolves.toHaveLength(1);
        await expect(db.$setAuth({ id: uid.replace(/-/g, '') }).item.findMany()).resolves.toHaveLength(1);

        // uuids that are not RFC 4122 compliant (no version/variant bits) are still valid for PostgreSQL
        const seedId = '00000000-0000-0000-0000-000000000001';
        await rawDb.item.create({ data: { ownerId: seedId } });
        await expect(db.$setAuth({ id: seedId }).item.findMany()).resolves.toHaveLength(1);
    });

    it('does not cast a varchar column when comparing with an auth() field', async () => {
        const { db, sqls } = await createClient(
            `
model User {
    id String @id @default(uuid())
    @@allow('all', true)
}

model Item {
    id      String @id @default(uuid())
    ownerId String @db.VarChar(64)
    @@allow('read', ownerId == auth().id)
}
            `,
        );

        const rawDb = db.$unuseAll();
        const uid = randomUUID();
        await rawDb.item.create({ data: { ownerId: uid } });
        await rawDb.item.create({ data: { ownerId: randomUUID() } });

        sqls.length = 0;
        const result = await db.$setAuth({ id: uid }).item.findMany();
        expect(result).toHaveLength(1);

        const query = sqls.find((sql) => sql.includes('from "public"."Item"'));
        expect(query).not.toContain('cast(');
        expect(query).toContain('"Item"."ownerId" = $1');
    });

    describe('collection predicates compile to EXISTS', () => {
        const schema = `
model User {
    id          String @id @default(uuid()) @db.Uuid
    memberships Membership[]
    @@allow('all', true)
}

model Team {
    id       String @id @default(uuid()) @db.Uuid
    name     String
    members  Membership[]
    projects Project[]
    @@allow('create', true)
    @@allow('read', members?[userID == auth().id])
    @@allow('update', members![userID == auth().id])
    @@allow('delete', members^[userID == auth().id])
}

model Membership {
    id     String @id @default(uuid()) @db.Uuid
    teamID String @db.Uuid
    team   Team   @relation(fields: [teamID], references: [id], onDelete: Cascade)
    userID String @db.Uuid
    user   User   @relation(fields: [userID], references: [id])
    @@allow('all', true)
}

model Project {
    id     String @id @default(uuid()) @db.Uuid
    teamID String @db.Uuid
    team   Team   @relation(fields: [teamID], references: [id], onDelete: Cascade)
    @@allow('read', team.members?[userID == auth().id])
}
`;

        async function setup() {
            const { db, sqls } = await createClient(schema);
            const rawDb = db.$unuseAll();
            const user1 = await rawDb.user.create({ data: {} });
            const user2 = await rawDb.user.create({ data: {} });
            // team1: only user1; team2: user1 and user2; team3: only user2
            const team1 = await rawDb.team.create({
                data: { name: 't1', members: { create: [{ userID: user1.id }] } },
            });
            const team2 = await rawDb.team.create({
                data: { name: 't2', members: { create: [{ userID: user1.id }, { userID: user2.id }] } },
            });
            const team3 = await rawDb.team.create({
                data: { name: 't3', members: { create: [{ userID: user2.id }] } },
            });
            await rawDb.project.create({ data: { teamID: team1.id } });
            await rawDb.project.create({ data: { teamID: team3.id } });
            return { db, rawDb, sqls, user1, user2, team1, team2, team3 };
        }

        it('uses EXISTS for `?` (some)', async () => {
            const { db, sqls, user1, team1, team2 } = await setup();
            sqls.length = 0;
            const teams = await db.$setAuth({ id: user1.id }).team.findMany();
            expect(teams.map((t: any) => t.id).sort()).toEqual([team1.id, team2.id].sort());

            const query = sqls.find((sql) => sql.includes('from "public"."Team"'));
            expect(query).toContain('exists (select 1');
            expect(query).not.toContain('count(');
            expect(query).not.toContain('cast(');
        });

        it('uses EXISTS for nested relation chains', async () => {
            const { db, sqls, user1, team1 } = await setup();
            sqls.length = 0;
            const projects = await db.$setAuth({ id: user1.id }).project.findMany();
            expect(projects).toHaveLength(1);
            expect(projects[0]!.teamID).toBe(team1.id);

            const query = sqls.find((sql) => sql.includes('from "public"."Project"'));
            expect(query).toContain('exists (select 1');
            expect(query).not.toContain('count(');
        });

        it('uses NOT EXISTS for `!` (all)', async () => {
            const { db, sqls, user1, team1 } = await setup();
            sqls.length = 0;
            // only team1 has all members equal to user1
            const result = await db.$setAuth({ id: user1.id }).team.updateMany({ data: { name: 'updated' } });
            expect(result.count).toBe(1);
            expect((await db.$unuseAll().team.findUnique({ where: { id: team1.id } }))?.name).toBe('updated');

            const query = sqls.find((sql) => sql.startsWith('update "public"."Team"'));
            expect(query).toContain('not exists (select 1');
            expect(query).not.toContain('count(');
        });

        it('uses NOT EXISTS for `^` (none)', async () => {
            const { db, sqls, user1, team3 } = await setup();
            sqls.length = 0;
            // only team3 has no member equal to user1
            const result = await db.$setAuth({ id: user1.id }).team.deleteMany();
            expect(result.count).toBe(1);
            expect(await db.$unuseAll().team.findUnique({ where: { id: team3.id } })).toBeNull();

            const query = sqls.find((sql) => sql.startsWith('delete from "public"."Team"'));
            expect(query).toContain('not exists (select 1');
            expect(query).not.toContain('count(');
        });
    });

    describe('relation == auth() uses the foreign key instead of a subquery', () => {
        it('rewrites direct and chained to-one relations owning the foreign key', async () => {
            const { db, sqls } = await createClient(
                `
model User {
    id         String      @id @default(uuid()) @db.Uuid
    orgMembers OrgMember[]
    posts      Post[]
    @@allow('all', true)
}

model OrgMember {
    id          String       @id @default(uuid()) @db.Uuid
    userID      String       @db.Uuid
    user        User         @relation(fields: [userID], references: [id])
    teamMembers TeamMember[]
    @@allow('all', true)
}

model TeamMember {
    id          String    @id @default(uuid()) @db.Uuid
    orgMemberID String    @db.Uuid
    orgMember   OrgMember @relation(fields: [orgMemberID], references: [id])
    @@allow('read', orgMember.user == auth())
}

model Post {
    id       String  @id @default(uuid()) @db.Uuid
    title    String
    authorID String? @db.Uuid
    author   User?   @relation(fields: [authorID], references: [id])
    @@allow('read', author == auth())
    @@allow('update', this.author == auth())
    @@allow('delete', author != auth())
}
                `,
            );

            const rawDb = db.$unuseAll();
            const user1 = await rawDb.user.create({ data: {} });
            const user2 = await rawDb.user.create({ data: {} });
            const om1 = await rawDb.orgMember.create({ data: { userID: user1.id } });
            const om2 = await rawDb.orgMember.create({ data: { userID: user2.id } });
            const tm1 = await rawDb.teamMember.create({ data: { orgMemberID: om1.id } });
            await rawDb.teamMember.create({ data: { orgMemberID: om2.id } });
            const post1 = await rawDb.post.create({ data: { title: 'p1', authorID: user1.id } });
            await rawDb.post.create({ data: { title: 'p2', authorID: user2.id } });
            const post3 = await rawDb.post.create({ data: { title: 'p3', authorID: null } });

            const authDb = db.$setAuth({ id: user1.id });

            // chained: `orgMember.user == auth()` -> `orgMember.userID`
            sqls.length = 0;
            const teamMembers = await authDb.teamMember.findMany();
            expect(teamMembers.map((t: any) => t.id)).toEqual([tm1.id]);
            let query = sqls.find((sql) => sql.includes('from "public"."TeamMember"'));
            expect(query).toContain('"userID"');
            expect(query).not.toContain('from "public"."User"');

            // direct: `author == auth()` -> `authorID`
            sqls.length = 0;
            const posts = await authDb.post.findMany();
            expect(posts.map((p: any) => p.id)).toEqual([post1.id]);
            query = sqls.find((sql) => sql.includes('from "public"."Post"'));
            expect(query).toContain('"Post"."authorID"');
            expect(query).not.toContain('from "public"."User"');
            // plain column comparison, no subquery at all
            expect(query).not.toContain('(select');

            // `this.author == auth()` -> `authorID`
            sqls.length = 0;
            const updated = await authDb.post.updateMany({ data: { title: 'updated' } });
            expect(updated.count).toBe(1);
            query = sqls.find((sql) => sql.startsWith('update "public"."Post"'));
            expect(query).not.toContain('from "public"."User"');

            // `author != auth()` with null fk: the null-author post must not match (sql null semantics)
            sqls.length = 0;
            const deleted = await authDb.post.deleteMany();
            expect(deleted.count).toBe(1);
            const remaining = await rawDb.post.findMany();
            expect(remaining.map((p: any) => p.id).sort()).toEqual([post1.id, post3.id].sort());
        });

        it('rewrites compound id relations field by field', async () => {
            const { db, sqls } = await createClient(
                `
model User {
    tenantId String
    localId  String
    docs     Doc[]
    @@id([tenantId, localId])
    @@allow('all', true)
}

model Doc {
    id            String @id @default(uuid()) @db.Uuid
    ownerTenantId String
    ownerLocalId  String
    owner         User   @relation(fields: [ownerTenantId, ownerLocalId], references: [tenantId, localId])
    @@allow('read', owner == auth())
}
                `,
            );

            const rawDb = db.$unuseAll();
            await rawDb.user.create({ data: { tenantId: 't1', localId: 'u1' } });
            await rawDb.user.create({ data: { tenantId: 't1', localId: 'u2' } });
            const doc1 = await rawDb.doc.create({ data: { ownerTenantId: 't1', ownerLocalId: 'u1' } });
            await rawDb.doc.create({ data: { ownerTenantId: 't1', ownerLocalId: 'u2' } });

            sqls.length = 0;
            const docs = await db.$setAuth({ tenantId: 't1', localId: 'u1' }).doc.findMany();
            expect(docs.map((d: any) => d.id)).toEqual([doc1.id]);
            const query = sqls.find((sql) => sql.includes('from "public"."Doc"'));
            expect(query).toContain('"ownerTenantId"');
            expect(query).toContain('"ownerLocalId"');
            expect(query).not.toContain('from "public"."User"');
        });

        it('falls back to a subquery when the relation does not own the foreign key', async () => {
            const { db, sqls } = await createClient(
                `
model User {
    id         String   @id @default(uuid()) @db.Uuid
    settingsId String   @unique @db.Uuid
    settings   Settings @relation(fields: [settingsId], references: [id])
    @@allow('all', true)
}

model Settings {
    id   String @id @default(uuid()) @db.Uuid
    user User?
    @@allow('create', true)
    @@allow('read', user == auth())
}
                `,
            );

            const rawDb = db.$unuseAll();
            const s1 = await rawDb.settings.create({ data: {} });
            const s2 = await rawDb.settings.create({ data: {} });
            const user1 = await rawDb.user.create({ data: { settingsId: s1.id } });
            await rawDb.user.create({ data: { settingsId: s2.id } });

            sqls.length = 0;
            const result = await db.$setAuth({ id: user1.id }).settings.findMany();
            expect(result.map((r: any) => r.id)).toEqual([s1.id]);
            const query = sqls.find((sql) => sql.includes('from "public"."Settings"'));
            // fk lives on User, so the related row must still be looked up
            expect(query).toContain('from "public"."User"');
        });

        it('rewrites only the SQL side when comparing a relation with a value binding', async () => {
            const { db, sqls } = await createClient(
                `
model User {
    id          Int          @id
    assignments Assignment[]
    @@allow('all', true)
}

model Scope {
    id          Int          @id
    assignments Assignment[]
    documents   Document[]
    @@allow('all', true)
}

model Assignment {
    id      Int   @id
    userId  Int
    scopeId Int
    user    User  @relation(fields: [userId], references: [id])
    scope   Scope @relation(fields: [scopeId], references: [id])
    @@allow('all', true)
}

model Document {
    id      Int   @id
    scopeId Int
    scope   Scope @relation(fields: [scopeId], references: [id])
    @@allow('create', true)
    @@allow('read', auth().assignments?[a, a.scope == this.scope])
}
                `,
            );

            const rawDb = db.$unuseAll();
            await rawDb.scope.createMany({ data: [{ id: 1 }, { id: 2 }] });
            await rawDb.user.create({ data: { id: 1 } });
            await rawDb.assignment.create({ data: { id: 1, userId: 1, scopeId: 1 } });
            await rawDb.document.createMany({
                data: [
                    { id: 10, scopeId: 1 },
                    { id: 20, scopeId: 2 },
                ],
            });

            sqls.length = 0;
            // `a.scope` is read from the auth value tree (as `scope.id`), `this.scope` becomes `scopeId`
            const documents = await db
                .$setAuth({ id: 1, assignments: [{ id: 1, scopeId: 1, scope: { id: 1 } }] })
                .document.findMany();
            expect(documents.map((d: any) => d.id)).toEqual([10]);
            const query = sqls.find((sql) => sql.includes('from "public"."Document"'));
            expect(query).toContain('"Document"."scopeId"');
            expect(query).not.toContain('from "public"."Scope"');
        });

        it('rewrites both sides of relation == relation comparisons not involving auth()', async () => {
            const { db, sqls } = await createClient(
                `
model User {
    id          String       @id @default(uuid()) @db.Uuid
    owned       Task[]       @relation('owner')
    reviewed    Task[]       @relation('reviewer')
    memberships Membership[]
    @@allow('all', true)
}

model Tenant {
    id          String       @id @default(uuid()) @db.Uuid
    memberships Membership[]
    tasks       Task[]
    @@allow('all', true)
}

model Membership {
    id       String @id @default(uuid()) @db.Uuid
    userId   String @db.Uuid
    user     User   @relation(fields: [userId], references: [id])
    tenantId String @db.Uuid
    tenant   Tenant @relation(fields: [tenantId], references: [id])
    @@allow('all', true)
}

model Task {
    id         String @id @default(uuid()) @db.Uuid
    ownerId    String @db.Uuid
    owner      User   @relation('owner', fields: [ownerId], references: [id])
    reviewerId String @db.Uuid
    reviewer   User   @relation('reviewer', fields: [reviewerId], references: [id])
    tenantId   String @db.Uuid
    tenant     Tenant @relation(fields: [tenantId], references: [id])
    @@allow('create', true)
    @@allow('read', this.owner == this.reviewer)
    @@allow('delete', owner.memberships?[m, m.tenant == this.tenant])
}
                `,
            );

            const rawDb = db.$unuseAll();
            const user1 = await rawDb.user.create({ data: {} });
            const user2 = await rawDb.user.create({ data: {} });
            const tenant1 = await rawDb.tenant.create({ data: {} });
            const tenant2 = await rawDb.tenant.create({ data: {} });
            await rawDb.membership.create({ data: { userId: user1.id, tenantId: tenant1.id } });
            const selfReviewed = await rawDb.task.create({
                data: { ownerId: user1.id, reviewerId: user1.id, tenantId: tenant1.id },
            });
            await rawDb.task.create({ data: { ownerId: user1.id, reviewerId: user2.id, tenantId: tenant2.id } });

            // `this.owner == this.reviewer` -> `ownerId = reviewerId`
            sqls.length = 0;
            const tasks = await db.task.findMany();
            expect(tasks.map((t: any) => t.id)).toEqual([selfReviewed.id]);
            let query = sqls.find((sql) => sql.includes('from "public"."Task"'));
            expect(query).toContain('"Task"."ownerId" = "Task"."reviewerId"');
            expect(query).not.toContain('from "public"."User"');

            // binding relation vs `this` relation inside a collection predicate, both SQL-backed:
            // `m.tenant == this.tenant` -> `m.tenantId = Task.tenantId`
            sqls.length = 0;
            // only the task in tenant1 has its owner as a member of the same tenant
            const deleted = await db.task.deleteMany();
            expect(deleted.count).toBe(1);
            expect(await rawDb.task.findUnique({ where: { id: selfReviewed.id } })).toBeNull();
            query = sqls.find((sql) => sql.startsWith('delete from "public"."Task"'));
            expect(query).toContain('"tenantId" = "Task"."tenantId"');
            expect(query).not.toContain('from "public"."Tenant"');
        });

        it('resolves inherited relations and scalars of delegate sub-types through the base table', async () => {
            const { db } = await createClient(
                `
model User {
    id       String    @id @default(uuid()) @db.Uuid
    contents Content[]
    @@allow('all', true)
}

model Content {
    id      String @id @default(uuid()) @db.Uuid
    type    String
    ownerId String @db.Uuid
    owner   User   @relation(fields: [ownerId], references: [id])
    @@delegate(type)
}

model Post extends Content {
    title    String
    comments Comment[]
    likes    Like[]
    @@allow('create', true)
    @@allow('read', owner == auth())
}

model Comment {
    id     String @id @default(uuid()) @db.Uuid
    postId String @db.Uuid
    post   Post   @relation(fields: [postId], references: [id])
    @@allow('create', true)
    @@allow('read', post.owner == auth())
}

model Like {
    id     String @id @default(uuid()) @db.Uuid
    postId String @db.Uuid
    post   Post   @relation(fields: [postId], references: [id])
    @@allow('create', true)
    @@allow('read', post.ownerId == auth().id)
}
                `,
            );

            const rawDb = db.$unuseAll();
            const user1 = await rawDb.user.create({ data: {} });
            const user2 = await rawDb.user.create({ data: {} });
            const post1 = await rawDb.post.create({ data: { title: 'p1', ownerId: user1.id } });
            const post2 = await rawDb.post.create({ data: { title: 'p2', ownerId: user2.id } });
            const comment1 = await rawDb.comment.create({ data: { postId: post1.id } });
            await rawDb.comment.create({ data: { postId: post2.id } });
            const like1 = await rawDb.like.create({ data: { postId: post1.id } });
            await rawDb.like.create({ data: { postId: post2.id } });

            const authDb = db.$setAuth({ id: user1.id });
            // direct inherited relation on the sub-type
            expect((await authDb.post.findMany()).map((p: any) => p.id)).toEqual([post1.id]);
            // chained inherited relation
            expect((await authDb.comment.findMany()).map((c: any) => c.id)).toEqual([comment1.id]);
            // chained inherited scalar
            expect((await authDb.like.findMany()).map((l: any) => l.id)).toEqual([like1.id]);
        });
    });
});
