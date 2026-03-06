import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2440
describe('Regression for issue 2440', () => {
    const schema = `
model User {
    id    Int    @id @default(autoincrement())
    name  String
    posts Post[]
}

model Post {
    id       Int    @id @default(autoincrement())
    title    String
    value    Int
    userId   Int
    user     User   @relation(fields: [userId], references: [id])
}
    `;

    it('some filter should return users that have at least one matching post', async () => {
        const db = await createTestClient(schema);

        // userA has posts with value 1 and 3
        const userA = await db.user.create({
            data: {
                name: 'A',
                posts: {
                    create: [
                        { title: 'p1', value: 1 },
                        { title: 'p2', value: 3 },
                    ],
                },
            },
        });
        // userB has only a post with value 2
        const userB = await db.user.create({ data: { name: 'B', posts: { create: [{ title: 'p3', value: 2 }] } } });
        // userC has no posts
        await db.user.create({ data: { name: 'C' } });

        const result = await db.user.findMany({
            where: { posts: { some: { value: { gt: 2 } } } },
            orderBy: { id: 'asc' },
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(userA.id);

        const result2 = await db.user.findMany({ where: { posts: { some: {} } }, orderBy: { id: 'asc' } });
        expect(result2).toHaveLength(2);
        expect(result2.map((u: any) => u.id)).toEqual([userA.id, userB.id]);
    });

    it('none filter should return users that have no matching posts', async () => {
        const db = await createTestClient(schema);

        const userA = await db.user.create({
            data: {
                name: 'A',
                posts: {
                    create: [
                        { title: 'p1', value: 1 },
                        { title: 'p2', value: 3 },
                    ],
                },
            },
        });
        await db.user.create({ data: { name: 'B', posts: { create: [{ title: 'p3', value: 2 }] } } });
        const userC = await db.user.create({ data: { name: 'C' } });

        const result = await db.user.findMany({
            where: { posts: { none: { value: { gt: 2 } } } },
            orderBy: { id: 'asc' },
        });
        // userB (value 2, not > 2) and userC (no posts) have none with value > 2
        expect(result).toHaveLength(2);
        const ids = result.map((u: any) => u.id);
        expect(ids).not.toContain(userA.id);
        expect(ids).toContain(userC.id);
    });

    it('every filter should return users where all posts match the condition', async () => {
        const db = await createTestClient(schema);

        const userA = await db.user.create({
            data: {
                name: 'A',
                posts: {
                    create: [
                        { title: 'p1', value: 3 },
                        { title: 'p2', value: 5 },
                    ],
                },
            },
        });
        await db.user.create({
            data: {
                name: 'B',
                posts: {
                    create: [
                        { title: 'p3', value: 2 },
                        { title: 'p4', value: 4 },
                    ],
                },
            },
        });
        const userC = await db.user.create({ data: { name: 'C' } });

        // userA: all posts have value > 2 (3 and 5) ✓
        // userB: has a post with value 2, not > 2 ✗
        // userC: no posts, every filter vacuously true ✓
        const result = await db.user.findMany({
            where: { posts: { every: { value: { gt: 2 } } } },
            orderBy: { id: 'asc' },
        });
        expect(result).toHaveLength(2);
        expect(result.map((u: any) => u.id)).toEqual([userA.id, userC.id]);
    });
});
