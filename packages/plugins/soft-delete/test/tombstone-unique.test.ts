import { createTestClient, getTestDbProvider } from '@zenstackhq/testtools';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SoftDeletePlugin } from '../src';

// The `@deletedAt` attribute is defined in this plugin's `plugin.zmodel`. We feed it to the
// test client explicitly so that `@zenstackhq/testtools` doesn't need to depend on this plugin.
const PLUGIN_MODEL_FILE = fileURLToPath(new URL('../plugin.zmodel', import.meta.url));

function createSoftDeleteTestClient(schema: string, provider?: 'sqlite' | 'postgresql' | 'mysql') {
    return createTestClient(schema, { extraPluginModelFiles: [PLUGIN_MODEL_FILE], provider });
}

// A column-based soft delete leaves a tombstone behind, so a plain `@unique` would reject reusing
// the value. The mitigation is a unique index scoped to live (non-deleted) rows. ZModel can't
// express that condition, so each test below emits the dialect-specific DDL directly (no `@unique`
// on the model) and asserts the same behavior: live rows are unique, tombstones may share a value.
describe('tombstone unique conflict mitigation (per-dialect index)', () => {
    const uniqueSchema = `
model User {
    id        Int       @id @default(autoincrement())
    email     String
    deletedAt DateTime? @deletedAt
}
`;

    async function expectTombstoneUniqueBehavior(db: any) {
        const a = await db.user.create({ data: { email: 'a@x.com' } });

        // a second *live* row with the same email collides
        await expect(db.user.create({ data: { email: 'a@x.com' } })).rejects.toThrow();

        // soft-deleting frees the value — the tombstone leaves the index's scope
        await db.user.delete({ where: { id: a.id } });
        const b = await db.user.create({ data: { email: 'a@x.com' } });
        expect(b.id).not.toBe(a.id);

        // uniqueness is still enforced among the remaining live rows
        await expect(db.user.create({ data: { email: 'a@x.com' } })).rejects.toThrow();
    }

    it('sqlite: partial unique index scoped to live rows', async ({ skip }) => {
        if (getTestDbProvider() !== 'sqlite') {
            skip();
        }
        const raw = await createSoftDeleteTestClient(uniqueSchema, 'sqlite');
        const db = raw.$use(new SoftDeletePlugin());
        await raw.$executeRawUnsafe(
            `CREATE UNIQUE INDEX "User_email_active" ON "User" ("email") WHERE "deletedAt" IS NULL`,
        );
        await expectTombstoneUniqueBehavior(db);
    });

    it('postgresql: partial unique index scoped to live rows', async ({ skip }) => {
        if (getTestDbProvider() !== 'postgresql') {
            skip();
        }
        const raw = await createSoftDeleteTestClient(uniqueSchema, 'postgresql');
        const db = raw.$use(new SoftDeletePlugin());
        await raw.$executeRawUnsafe(
            `CREATE UNIQUE INDEX "User_email_active" ON "User" ("email") WHERE "deletedAt" IS NULL`,
        );
        await expectTombstoneUniqueBehavior(db);
    });

    it('mysql: functional unique index over a CASE expression', async ({ skip }) => {
        if (getTestDbProvider() !== 'mysql') {
            skip();
        }
        const raw = await createSoftDeleteTestClient(uniqueSchema, 'mysql');
        const db = raw.$use(new SoftDeletePlugin());
        // MySQL has no partial indexes; a functional key part over a CASE expr yields NULL for
        // tombstones (and MySQL allows multiple NULLs in a unique index). Requires MySQL 8.0.13+.
        await raw.$executeRawUnsafe(
            'ALTER TABLE `User` ADD UNIQUE INDEX `User_email_active` ((CASE WHEN `deletedAt` IS NULL THEN `email` END))',
        );
        await expectTombstoneUniqueBehavior(db);
    });
});
