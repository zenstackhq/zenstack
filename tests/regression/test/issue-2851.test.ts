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
    id      String @id @default(uuid()) @db.Uuid
    ownerId String @db.Uuid
    @@allow('read', ownerId != auth().id)
}
            `,
        );

        const rawDb = db.$unuseAll();
        const uid = randomUUID();
        await rawDb.item.create({ data: { ownerId: uid } });
        await rawDb.note.create({ data: { ownerId: uid } });

        const badAuthDb = db.$setAuth({ id: 'not-a-uuid' });
        // `==` against a malformed uuid is always false
        await expect(badAuthDb.item.findMany()).resolves.toHaveLength(0);
        // `!=` against a malformed uuid is always true
        await expect(badAuthDb.note.findMany()).resolves.toHaveLength(1);

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
            expect(teams.map((t) => t.id).sort()).toEqual([team1.id, team2.id].sort());

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
});
