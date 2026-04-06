import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2529
describe('Regression for issue #2529', () => {
    async function setup() {
        const db = await createTestClient(
            `
model Post {
    id        Int      @id @default(autoincrement())
    title     String
    createdAt DateTime @default(now())
}
            `,
            { provider: 'postgresql' },
        );
        await db.post.create({ data: { title: 'A' } });
        await db.post.create({ data: { title: 'A' } });
        await db.post.create({ data: { title: 'B' } });
        return db;
    }

    it('distinct only without orderBy', async () => {
        const db = await setup();

        const result = await db.post.findMany({ distinct: ['title'] });

        expect(result).toHaveLength(2);
        const titles = result.map((p: any) => p.title).sort();
        expect(titles).toEqual(['A', 'B']);
    });

    it('orderBy only without distinct', async () => {
        const db = await setup();

        const result = await db.post.findMany({ orderBy: { title: 'desc' } });

        expect(result).toHaveLength(3);
        expect(result.map((p: any) => p.title)).toEqual(['B', 'A', 'A']);
    });

    it('prepends the distinct field to orderBy when user-supplied orderBy does not start with it', async () => {
        const db = await setup();

        const result = await db.post.findMany({
            distinct: ['title'],
            orderBy: { createdAt: 'desc' },
        });

        expect(result).toHaveLength(2);
        const titles = result.map((p: any) => p.title).sort();
        expect(titles).toEqual(['A', 'B']);
    });

    it('does not double-prepend when user-supplied orderBy already starts with the distinct field', async () => {
        const db = await setup();

        // User already satisfies pg's requirement: ORDER BY "title" DESC, "createdAt" DESC
        // The distinct field must NOT be prepended again, which would change sort semantics.
        const result = await db.post.findMany({
            distinct: ['title'],
            orderBy: [{ title: 'desc' }, { createdAt: 'desc' }],
        });

        expect(result).toHaveLength(2);
        // With ORDER BY title DESC, we expect 'B' before 'A'
        expect(result.map((p: any) => p.title)).toEqual(['B', 'A']);
    });
});
