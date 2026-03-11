import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2472
// Filtering by `{ not: null }` returns empty array instead of non-null records
describe('Regression for issue 2472', () => {
    const schema = `
model Post {
    id           Int       @id @default(autoincrement())
    title        String
    published_at DateTime?
}
    `;

    it('should filter records where nullable field is not null', async () => {
        const db = await createTestClient(schema);

        await db.post.create({ data: { title: 'published', published_at: new Date('2025-01-01') } });
        await db.post.create({ data: { title: 'draft' } });

        // { not: null } should return only records where the field is NOT NULL
        const results = await db.post.findMany({
            where: {
                published_at: {
                    not: null,
                },
            },
        });

        expect(results).toHaveLength(1);
        expect(results[0].title).toBe('published');
    });

    it('should also work with { not: null } on string fields', async () => {
        const db = await createTestClient(`
model Item {
    id    Int     @id @default(autoincrement())
    name  String
    note  String?
}
        `);

        await db.item.create({ data: { name: 'a', note: 'has note' } });
        await db.item.create({ data: { name: 'b' } });

        const results = await db.item.findMany({
            where: { note: { not: null } },
        });

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('a');
    });
});
