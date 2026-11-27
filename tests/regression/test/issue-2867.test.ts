import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2867
describe('Regression for issue 2867', () => {
    const schema = (rule: string, arrays = false) => `
enum PostStatus {
    DRAFT     @map('st_draft')
    ACTIVE    @map('st_active')
    CANCELLED @map('st_cancelled')
}

model User {
    id       Int          @id @default(autoincrement())
    status   PostStatus
    role     String?
    ${arrays ? 'statuses PostStatus[]' : ''}
    ${arrays ? 'roles    String[]' : ''}
    posts    Post[]
    @@allow('all', true)
}

model Post {
    id       Int          @id
    status   PostStatus
    label    String
    ${arrays ? 'statuses PostStatus[]' : ''}
    authorId Int
    author   User         @relation(fields: [authorId], references: [id])
    @@allow('create', true)
    @@allow('read', ${rule})
}
`;

    async function setup(rule: string, arrays = false, auth: Record<string, unknown> = {}) {
        const db = await createPolicyTestClient(schema(rule, arrays), arrays ? { provider: 'postgresql' } : undefined);
        const raw = db.$unuseAll();
        await raw.user.create({
            data: { id: 1, status: 'ACTIVE', ...(arrays ? { statuses: ['DRAFT', 'ACTIVE'] } : {}) },
        });
        await raw.post.create({
            data: { id: 1, status: 'DRAFT', label: 'DRAFT', authorId: 1, ...(arrays ? { statuses: ['DRAFT'] } : {}) },
        });
        await raw.post.create({
            data: {
                id: 2,
                status: 'ACTIVE',
                label: 'ACTIVE',
                authorId: 1,
                ...(arrays ? { statuses: ['ACTIVE', 'CANCELLED'] } : {}),
            },
        });
        await raw.post.create({
            // a label holding a database value rather than a member name
            data: {
                id: 3,
                status: 'CANCELLED',
                label: 'st_active',
                authorId: 1,
                ...(arrays ? { statuses: ['CANCELLED'] } : {}),
            },
        });
        return db.$setAuth({
            id: 1,
            status: 'ACTIVE',
            ...(arrays ? { statuses: ['DRAFT', 'ACTIVE'] } : {}),
            ...auth,
        });
    }

    async function readIds(rule: string, arrays = false, auth: Record<string, unknown> = {}) {
        const db = await setup(rule, arrays, auth);
        const posts = await db.post.findMany({ orderBy: { id: 'asc' } });
        return posts.map((p: { id: number }) => p.id);
    }

    describe('column on the right side of a comparison', () => {
        it('enum literal == field', async () => {
            await expect(readIds('ACTIVE == status')).resolves.toEqual([2]);
        });

        it('enum literal != field', async () => {
            await expect(readIds('CANCELLED != status')).resolves.toEqual([1, 2]);
        });

        it('auth() member == field', async () => {
            await expect(readIds('auth().status == status')).resolves.toEqual([2]);
        });
    });

    describe('column vs. column through a relation', () => {
        it('relation field == field', async () => {
            await expect(readIds('author.status == status')).resolves.toEqual([2]);
        });

        it('field == relation field', async () => {
            await expect(readIds('status == author.status')).resolves.toEqual([2]);
        });

        it('relation field == enum literal', async () => {
            await expect(readIds('author.status == ACTIVE')).resolves.toEqual([1, 2, 3]);
        });

        it('enum literal == relation field', async () => {
            await expect(readIds('ACTIVE == author.status')).resolves.toEqual([1, 2, 3]);
        });

        it('relation field == auth() member', async () => {
            await expect(readIds('author.status == auth().status')).resolves.toEqual([1, 2, 3]);
        });

        it('relation field in enum list', async () => {
            await expect(readIds('author.status in [DRAFT, ACTIVE]')).resolves.toEqual([1, 2, 3]);
        });

        it('collection predicate comparing a related field with this field', async () => {
            await expect(readIds('author.posts?[status == this.status && id != this.id]')).resolves.toEqual([]);
        });
    });

    describe('existing passing shapes', () => {
        it('field == enum literal', async () => {
            await expect(readIds('status == ACTIVE')).resolves.toEqual([2]);
        });

        it('field == auth() member', async () => {
            await expect(readIds('status == auth().status')).resolves.toEqual([2]);
        });

        it('field in enum list', async () => {
            await expect(readIds('status in [DRAFT, ACTIVE]')).resolves.toEqual([1, 2]);
        });
    });

    describe.runIf(process.env['TEST_DB_PROVIDER'] === 'postgresql')('enum array fields', () => {
        it('enum literal in array field', async () => {
            await expect(readIds('ACTIVE in statuses', true)).resolves.toEqual([2]);
        });

        it('auth() member in array field', async () => {
            await expect(readIds('auth().status in statuses', true)).resolves.toEqual([2]);
        });

        it('field in auth() array member', async () => {
            await expect(readIds('status in auth().statuses', true)).resolves.toEqual([1, 2]);
        });

        it('enum literal in auth() array member', async () => {
            await expect(readIds('CANCELLED in auth().statuses', true)).resolves.toEqual([]);
        });

        it('enum literal in auth() array member (positive)', async () => {
            await expect(readIds('ACTIVE in auth().statuses', true)).resolves.toEqual([1, 2, 3]);
        });

        it('field in relation array field', async () => {
            await expect(readIds('status in author.statuses', true)).resolves.toEqual([1, 2]);
        });

        it('array field has enum literal', async () => {
            await expect(readIds('has(statuses, CANCELLED)', true)).resolves.toEqual([2, 3]);
        });

        it('array field hasSome enum literals', async () => {
            await expect(readIds('hasSome(statuses, [DRAFT, CANCELLED])', true)).resolves.toEqual([1, 2, 3]);
        });

        it('array field hasEvery enum literals', async () => {
            await expect(readIds('hasEvery(statuses, [ACTIVE, CANCELLED])', true)).resolves.toEqual([2]);
        });

        it('array field equals auth() array member', async () => {
            await expect(readIds('statuses == auth().statuses', true)).resolves.toEqual([]);
        });
    });

    // Strings compared with enums hold member names, like in ORM filters and validation
    describe('String operands compared with enums', () => {
        it('field == String literal', async () => {
            await expect(readIds('status == "ACTIVE"')).resolves.toEqual([2]);
        });

        it('String literal == field', async () => {
            await expect(readIds('"ACTIVE" == status')).resolves.toEqual([2]);
        });

        it('field != String literal', async () => {
            await expect(readIds('status != "ACTIVE"')).resolves.toEqual([1, 3]);
        });

        it('field in String literal list', async () => {
            await expect(readIds('status in ["ACTIVE", "DRAFT"]')).resolves.toEqual([1, 2]);
        });

        it('field == String literal not naming a member', async () => {
            // `st_active` is a database value, not a member name
            await expect(readIds('status == "st_active"')).resolves.toEqual([]);
        });

        it('field != String literal not naming a member', async () => {
            await expect(readIds('status != "st_active"')).resolves.toEqual([1, 2, 3]);
        });

        it('field in String literal list with a non-member', async () => {
            await expect(readIds('status in ["ACTIVE", "st_active"]')).resolves.toEqual([2]);
        });

        it('field == auth() String member', async () => {
            await expect(readIds('status == auth().role', false, { role: 'ACTIVE' })).resolves.toEqual([2]);
        });

        it('field == auth() String member not naming a member', async () => {
            // `st_active` is a database value, not a member name
            await expect(readIds('status == auth().role', false, { role: 'st_active' })).resolves.toEqual([]);
        });

        it('field != auth() String member not naming a member', async () => {
            await expect(readIds('status != auth().role', false, { role: 'st_active' })).resolves.toEqual([1, 2, 3]);
        });

        it('field == null auth() String member', async () => {
            await expect(readIds('status == auth().role')).resolves.toEqual([]);
        });

        it('field == String field', async () => {
            await expect(readIds('status == label')).resolves.toEqual([1, 2]);
        });

        it('String field != field', async () => {
            await expect(readIds('label != status')).resolves.toEqual([3]);
        });

        it('String field == enum literal', async () => {
            await expect(readIds('label == ACTIVE')).resolves.toEqual([2]);
        });

        it('String field in enum list', async () => {
            await expect(readIds('label in [ACTIVE, CANCELLED]')).resolves.toEqual([2]);
        });

        it('String field == relation field', async () => {
            await expect(readIds('label == author.status')).resolves.toEqual([2]);
        });

        it('relation field == String field', async () => {
            await expect(readIds('author.status == label')).resolves.toEqual([2]);
        });

        it('create rule comparing create input with a String literal', async () => {
            const db = await createPolicyTestClient(`
enum PostStatus {
    DRAFT     @map('st_draft')
    ACTIVE    @map('st_active')
}
model Post {
    id     Int        @id
    status PostStatus
    label  String
    @@allow('read', true)
    @@allow('create', status == "ACTIVE" && status == label)
}
`);
            await expect(db.post.create({ data: { id: 1, status: 'ACTIVE', label: 'ACTIVE' } })).resolves.toMatchObject(
                {
                    status: 'ACTIVE',
                },
            );
            await expect(
                db.post.create({ data: { id: 2, status: 'ACTIVE', label: 'st_active' } }),
            ).toBeRejectedByPolicy();
            await expect(db.post.create({ data: { id: 3, status: 'DRAFT', label: 'DRAFT' } })).toBeRejectedByPolicy();
        });

        it('post-update rule comparing before() with a String literal', async () => {
            const db = await createPolicyTestClient(`
enum PostStatus {
    DRAFT     @map('st_draft')
    ACTIVE    @map('st_active')
}
model Post {
    id     Int        @id
    status PostStatus
    @@allow('create,read,update', true)
    @@deny('post-update', before().status == "ACTIVE")
}
`);
            await db.post.create({ data: { id: 1, status: 'DRAFT' } });
            await db.post.create({ data: { id: 2, status: 'ACTIVE' } });
            await expect(db.post.update({ where: { id: 1 }, data: { status: 'ACTIVE' } })).resolves.toMatchObject({
                status: 'ACTIVE',
            });
            await expect(db.post.update({ where: { id: 2 }, data: { status: 'DRAFT' } })).toBeRejectedByPolicy();
        });

        describe.runIf(process.env['TEST_DB_PROVIDER'] === 'postgresql')('enum array fields', () => {
            it('String literal in array field', async () => {
                await expect(readIds('"ACTIVE" in statuses', true)).resolves.toEqual([2]);
            });

            it('array field has String literal', async () => {
                await expect(readIds('has(statuses, "ACTIVE")', true)).resolves.toEqual([2]);
            });

            it('array field hasSome String literals', async () => {
                await expect(readIds('hasSome(statuses, ["ACTIVE", "DRAFT"])', true)).resolves.toEqual([1, 2]);
            });

            it('String field in array field', async () => {
                await expect(readIds('label in statuses', true)).resolves.toEqual([1, 2]);
            });

            it('array field has String field', async () => {
                await expect(readIds('has(statuses, label)', true)).resolves.toEqual([1, 2]);
            });

            it('field in auth() String array member', async () => {
                await expect(readIds('status in auth().roles', true, { roles: ['ACTIVE', 'DRAFT'] })).resolves.toEqual([
                    1, 2,
                ]);
            });

            it('field in auth() String array member not naming members', async () => {
                await expect(readIds('status in auth().roles', true, { roles: ['st_active'] })).resolves.toEqual([]);
            });
        });
    });

    // enum fields are converted to member names for comparisons, which the ORM turns back into
    // comparisons of database values in the common shapes so that they stay index-friendly
    describe('index-friendly comparisons', () => {
        const isPg = process.env['TEST_DB_PROVIDER'] === 'postgresql';

        async function whereClause(rule: string) {
            const sqls: string[] = [];
            const db = await createPolicyTestClient(
                `
enum S {
    DRAFT  @map('st_draft')
    ACTIVE @map('st_active')
}
model User {
    id       Int @id
    status   S
    ${isPg ? 'statuses S[]' : ''}
    posts    Post[]
    @@allow('all', true)
}
model Post {
    id       Int @id
    status   S?
    prev     S
    ${isPg ? 'statuses S[]' : ''}
    label    String
    authorId Int
    author   User @relation(fields: [authorId], references: [id])
    @@allow('read', ${rule})
}
`,
                {
                    log: (e: { level: string; query: { sql: string } }) => {
                        if (e.level === 'query') {
                            sqls.push(e.query.sql);
                        }
                    },
                } as any,
            );
            await db.$setAuth({ id: 1, status: 'ACTIVE', ...(isPg ? { statuses: ['ACTIVE'] } : {}) }).post.findMany();
            return sqls.at(-1)!.replace(/^.* where /is, '');
        }

        it.each([
            'status == ACTIVE',
            'status == "ACTIVE"',
            'ACTIVE != status',
            'status in [ACTIVE, DRAFT]',
            'status == auth().status',
            'status == prev',
            'status == null',
        ])('%s', async (rule) => {
            await expect(whereClause(rule)).resolves.not.toMatch(/case when/i);
        });

        it
            .runIf(isPg)
            .each([
                'status in auth().statuses',
                'ACTIVE in statuses',
                'status in statuses',
                'has(statuses, ACTIVE)',
                'hasSome(statuses, [ACTIVE, DRAFT])',
                'hasEvery(statuses, [ACTIVE])',
                'statuses == auth().statuses',
            ])('%s', async (rule) => {
            await expect(whereClause(rule)).resolves.not.toMatch(/case when|unnest/i);
        });

        it('compares by names otherwise', async () => {
            await expect(whereClause('status == label')).resolves.toMatch(/case when/i);
        });
    });

    describe('mutation policies', () => {
        const ENUM = `
enum PostStatus {
    DRAFT     @map('st_draft')
    ACTIVE    @map('st_active')
    CANCELLED @map('st_cancelled')
}
`;

        it('create rule comparing create input with a stored related field', async () => {
            const db = await createPolicyTestClient(`
${ENUM}
model User {
    id     Int        @id
    status PostStatus
    posts  Post[]
    @@allow('all', true)
}
model Post {
    id       Int        @id
    status   PostStatus
    authorId Int
    author   User       @relation(fields: [authorId], references: [id])
    @@allow('read', true)
    @@allow('create', status == author.status && status != CANCELLED)
}
`);
            await db.$unuseAll().user.create({ data: { id: 1, status: 'ACTIVE' } });
            await expect(db.post.create({ data: { id: 1, status: 'ACTIVE', authorId: 1 } })).resolves.toMatchObject({
                status: 'ACTIVE',
            });
            await expect(db.post.create({ data: { id: 2, status: 'DRAFT', authorId: 1 } })).toBeRejectedByPolicy();
        });

        it('post-update rule comparing before() with a stored field', async () => {
            const db = await createPolicyTestClient(`
${ENUM}
model Post {
    id     Int        @id
    status PostStatus
    prev   PostStatus
    @@allow('create,read', true)
    @@allow('update', status != CANCELLED)
    @@deny('post-update', before().status != prev)
}
`);
            await db.post.create({ data: { id: 1, status: 'ACTIVE', prev: 'ACTIVE' } });
            await db.post.create({ data: { id: 2, status: 'DRAFT', prev: 'ACTIVE' } });
            await expect(db.post.update({ where: { id: 1 }, data: { status: 'DRAFT' } })).resolves.toMatchObject({
                status: 'DRAFT',
            });
            await expect(db.post.update({ where: { id: 2 }, data: { status: 'ACTIVE' } })).toBeRejectedByPolicy();
        });

        it('update and delete rules with an enum literal on the left', async () => {
            const db = await createPolicyTestClient(`
${ENUM}
model Post {
    id     Int        @id
    status PostStatus
    @@allow('create,read', true)
    @@allow('update,delete', ACTIVE == status)
}
`);
            await db.post.create({ data: { id: 1, status: 'ACTIVE' } });
            await db.post.create({ data: { id: 2, status: 'DRAFT' } });
            await expect(db.post.update({ where: { id: 1 }, data: { status: 'CANCELLED' } })).resolves.toMatchObject({
                status: 'CANCELLED',
            });
            await expect(db.post.update({ where: { id: 2 }, data: { status: 'CANCELLED' } })).toBeRejectedNotFound();
            await expect(db.post.delete({ where: { id: 2 } })).toBeRejectedNotFound();
        });
    });

    describe('delegate models', () => {
        it('compares inherited enum fields', async () => {
            const db = await createPolicyTestClient(`
enum PostStatus {
    DRAFT     @map('st_draft')
    ACTIVE    @map('st_active')
    CANCELLED @map('st_cancelled')
}
model User {
    id     Int        @id
    status PostStatus
    assets Asset[]
    @@allow('all', true)
}
model Asset {
    id      Int        @id
    status  PostStatus
    ownerId Int
    owner   User       @relation(fields: [ownerId], references: [id])
    type    String
    @@delegate(type)
    @@allow('create,read', true)
}
model Post extends Asset {
    title String
    // inherits the base read rule, narrowed down by deny rules
    @@deny('read', DRAFT == status || owner.status != status)
}
`);
            const raw = db.$unuseAll();
            await raw.user.create({ data: { id: 1, status: 'ACTIVE' } });
            await raw.post.create({ data: { id: 1, status: 'ACTIVE', ownerId: 1, title: 'a' } });
            await raw.post.create({ data: { id: 2, status: 'DRAFT', ownerId: 1, title: 'b' } });
            await raw.post.create({ data: { id: 3, status: 'CANCELLED', ownerId: 1, title: 'c' } });
            await expect(db.post.findMany()).resolves.toMatchObject([{ id: 1, status: 'ACTIVE' }]);
            await expect(db.asset.findMany()).resolves.toHaveLength(3);
        });

        it('compares inherited enum fields with Strings', async () => {
            const db = await createPolicyTestClient(`
enum PostStatus {
    DRAFT     @map('st_draft')
    ACTIVE    @map('st_active')
    CANCELLED @map('st_cancelled')
}
model Asset {
    id     Int        @id
    status PostStatus
    label  String
    type   String
    @@delegate(type)
    @@allow('create,read', true)
}
model Post extends Asset {
    title String
    @@deny('read', status == "DRAFT" || label != status)
}
`);
            const raw = db.$unuseAll();
            await raw.post.create({ data: { id: 1, status: 'ACTIVE', label: 'ACTIVE', title: 'a' } });
            await raw.post.create({ data: { id: 2, status: 'DRAFT', label: 'DRAFT', title: 'b' } });
            await raw.post.create({ data: { id: 3, status: 'CANCELLED', label: 'st_active', title: 'c' } });
            await expect(db.post.findMany()).resolves.toMatchObject([{ id: 1, status: 'ACTIVE' }]);
        });
    });
});
