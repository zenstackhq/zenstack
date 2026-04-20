import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2578
// Sibling of issue 2440, covering the to-one (non-array) relation filter path:
// `buildToOneRelationFilter` used to emit `(select count(1) ...) > 0` which
// PostgreSQL can't convert to a semi-join; it now emits `EXISTS (...)`.
describe('Regression for issue 2578', () => {
    const schema = `
model Post {
    id       Int    @id @default(autoincrement())
    title    String
    value    Int
    userId   Int?
    user     User?  @relation(fields: [userId], references: [id])
}

model User {
    id    Int    @id @default(autoincrement())
    name  String
    posts Post[]
}
    `;

    it('to-one relation filter with field predicate returns matching children', async () => {
        const db = await createTestClient(schema);

        const userA = await db.user.create({ data: { name: 'A' } });
        const userB = await db.user.create({ data: { name: 'B' } });

        const p1 = await db.post.create({ data: { title: 'p1', value: 1, userId: userA.id } });
        const p2 = await db.post.create({ data: { title: 'p2', value: 2, userId: userB.id } });
        const p3 = await db.post.create({ data: { title: 'p3', value: 3, userId: null } });

        // `user: { name: 'A' }` is a to-one relation filter
        const result = await db.post.findMany({
            where: { user: { name: 'A' } },
            orderBy: { id: 'asc' },
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(p1.id);

        // posts with no user should not match a user filter
        const result2 = await db.post.findMany({
            where: { user: { name: 'C' } },
            orderBy: { id: 'asc' },
        });
        expect(result2).toHaveLength(0);

        // keep references live so the test intent is readable
        expect([p1.id, p2.id, p3.id].length).toBe(3);
    });

    it('`is` with field predicate matches the related row', async () => {
        const db = await createTestClient(schema);

        const userA = await db.user.create({ data: { name: 'A' } });
        const userB = await db.user.create({ data: { name: 'B' } });
        const p1 = await db.post.create({ data: { title: 'p1', value: 1, userId: userA.id } });
        const p2 = await db.post.create({ data: { title: 'p2', value: 2, userId: userB.id } });
        await db.post.create({ data: { title: 'p3', value: 3, userId: null } });

        const result = await db.post.findMany({
            where: { user: { is: { name: 'B' } } },
            orderBy: { id: 'asc' },
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(p2.id);

        // sanity: other rows are still reachable
        expect(p1.id).toBeDefined();
    });

    it('`is: null` matches rows with no related record', async () => {
        const db = await createTestClient(schema);

        const userA = await db.user.create({ data: { name: 'A' } });
        await db.post.create({ data: { title: 'p1', value: 1, userId: userA.id } });
        const p2 = await db.post.create({ data: { title: 'p2', value: 2, userId: null } });

        const result = await db.post.findMany({
            where: { user: { is: null } },
            orderBy: { id: 'asc' },
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(p2.id);
    });

    it('`isNot: null` matches rows with a related record', async () => {
        const db = await createTestClient(schema);

        const userA = await db.user.create({ data: { name: 'A' } });
        const p1 = await db.post.create({ data: { title: 'p1', value: 1, userId: userA.id } });
        await db.post.create({ data: { title: 'p2', value: 2, userId: null } });

        const result = await db.post.findMany({
            where: { user: { isNot: null } },
            orderBy: { id: 'asc' },
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(p1.id);
    });

    it('`isNot` with field predicate matches rows where the related record does not satisfy the filter or has no related record', async () => {
        const db = await createTestClient(schema);

        const userA = await db.user.create({ data: { name: 'A' } });
        const userB = await db.user.create({ data: { name: 'B' } });
        const p1 = await db.post.create({ data: { title: 'p1', value: 1, userId: userA.id } });
        const p2 = await db.post.create({ data: { title: 'p2', value: 2, userId: userB.id } });
        const p3 = await db.post.create({ data: { title: 'p3', value: 3, userId: null } });

        // posts whose related user is NOT named 'A' (includes the no-user case)
        const result = await db.post.findMany({
            where: { user: { isNot: { name: 'A' } } },
            orderBy: { id: 'asc' },
        });
        const ids = result.map((p: any) => p.id);
        expect(ids).toContain(p2.id);
        expect(ids).toContain(p3.id);
        expect(ids).not.toContain(p1.id);
    });
});
