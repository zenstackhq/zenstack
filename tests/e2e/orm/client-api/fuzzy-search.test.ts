import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient, getTestDbProvider } from '@zenstackhq/testtools';
import { schema } from '../schemas/basic';

type Schema = typeof schema;
const provider = getTestDbProvider();

describe.skipIf(provider !== 'postgresql')('Fuzzy search tests', () => {
    let client: ClientContract<Schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);

        await client.$executeRaw`CREATE EXTENSION IF NOT EXISTS unaccent`;
        await client.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

        await client.flavor.createMany({
            data: [
                { name: 'Apple', description: 'A sweet red fruit' },
                { name: 'Apricot', description: 'Small orange fruit' },
                { name: 'Banana', description: 'Yellow tropical fruit' },
                { name: 'Strawberry', description: 'Red berry with seeds' },
                { name: 'Crème brûlée', description: 'French custard dessert' },
                { name: 'Crème fraîche', description: 'Thick French cream' },
                { name: 'Café au lait', description: 'Coffee with milk' },
                { name: 'Éclair au chocolat', description: 'French pastry with chocolate' },
                { name: 'Pâté à choux', description: 'Light pastry dough' },
                { name: null, description: 'No name item' },
            ],
        });
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    // ---------------------------------------------------------------
    // A. Fuzzy search — basic English words
    // ---------------------------------------------------------------

    it('finds Apple despite missing letter (Aple)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Aple' } },
        });
        expect(results.some((r) => r.name === 'Apple')).toBe(true);
    });

    it('finds Apple with transposed letters (Appel)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Appel' } },
        });
        expect(results.some((r) => r.name === 'Apple')).toBe(true);
    });

    it('finds Strawberry despite missing letter (Strawbery)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Strawbery' } },
        });
        expect(results.some((r) => r.name === 'Strawberry')).toBe(true);
    });

    it('finds Banana with truncation (Banan)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Banan' } },
        });
        expect(results.some((r) => r.name === 'Banana')).toBe(true);
    });

    it('returns nothing for totally unrelated term', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'xyz123' } },
        });
        expect(results).toHaveLength(0);
    });

    // ---------------------------------------------------------------
    // B. Fuzzy search — French words with accents
    // ---------------------------------------------------------------

    it('finds accented names when searching without accents (creme)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'creme' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Crème brûlée');
        expect(names).toContain('Crème fraîche');
    });

    it('finds accented names when searching with exact accents (Crème)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Crème' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Crème brûlée');
    });

    it('finds Café au lait without accent (cafe)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'cafe' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Café au lait');
    });

    it('finds Éclair au chocolat with exact accent', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Éclair' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
    });

    it('finds Éclair au chocolat without accent (eclair)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'eclair' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
    });

    it('finds Pâté à choux with exact accent', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Pâté' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Pâté à choux');
    });

    it('finds Pâté à choux without accent (pate)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'pate' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Pâté à choux');
    });

    // ---------------------------------------------------------------
    // C. Fuzzy on nullable field
    // ---------------------------------------------------------------

    it('does not return items with null name', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Apple' } },
        });
        expect(results.every((r) => r.name !== null)).toBe(true);
    });

    it('fuzzy on description works for items with null name', async () => {
        const results = await client.flavor.findMany({
            where: { description: { fuzzy: 'item' } },
        });
        expect(results.some((r) => r.name === null)).toBe(true);
    });

    // ---------------------------------------------------------------
    // D. Fuzzy combined with other filters
    // ---------------------------------------------------------------

    it('fuzzy combined with contains on another field', async () => {
        const results = await client.flavor.findMany({
            where: {
                name: { fuzzy: 'creme' },
                description: { contains: 'custard' },
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.name).toBe('Crème brûlée');
    });

    it('fuzzy combined with contains on the same field', async () => {
        const results = await client.flavor.findMany({
            where: {
                name: { fuzzy: 'creme', contains: 'brûlée' },
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.name).toBe('Crème brûlée');
    });

    it('fuzzy combined with AND and startsWith', async () => {
        const results = await client.flavor.findMany({
            where: {
                AND: [{ name: { fuzzy: 'creme' } }, { description: { startsWith: 'Thick' } }],
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.name).toBe('Crème fraîche');
    });

    // ---------------------------------------------------------------
    // E. Fuzzy in logical compositions
    // ---------------------------------------------------------------

    it('OR with two fuzzy terms', async () => {
        const results = await client.flavor.findMany({
            where: {
                OR: [{ name: { fuzzy: 'apple' } }, { name: { fuzzy: 'banana' } }],
            },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Apple');
        expect(names).toContain('Banana');
    });

    it('NOT excludes matching items', async () => {
        const all = await client.flavor.findMany({
            where: { name: { not: null } },
        });
        const results = await client.flavor.findMany({
            where: {
                NOT: { name: { fuzzy: 'apple' } },
                name: { not: null },
            },
        });
        expect(results.length).toBeLessThan(all.length);
        expect(results.every((r) => r.name !== 'Apple')).toBe(true);
    });

    // ---------------------------------------------------------------
    // F. orderBy _relevance — single field
    // ---------------------------------------------------------------

    it('orders by relevance with best match first', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: 'Apple' } },
            orderBy: {
                _relevance: { fields: ['name'], search: 'Apple', sort: 'desc' },
            },
        });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0]!.name).toBe('Apple');
    });

    it('orders by relevance for accented search', async () => {
        const results = await client.flavor.findMany({
            where: {
                OR: [{ name: { fuzzy: 'creme' } }, { name: { fuzzy: 'cafe' } }],
            },
            orderBy: {
                _relevance: { fields: ['name'], search: 'creme', sort: 'desc' },
            },
        });
        expect(results.length).toBeGreaterThanOrEqual(2);
        const firstTwo = results.slice(0, 2).map((r) => r.name);
        expect(firstTwo.some((n) => n?.startsWith('Crème'))).toBe(true);
    });

    // ---------------------------------------------------------------
    // G. orderBy _relevance — multiple fields
    // ---------------------------------------------------------------

    it('orders by relevance across multiple fields', async () => {
        const results = await client.flavor.findMany({
            where: {
                OR: [
                    { name: { fuzzy: 'chocolate' } },
                    { description: { fuzzy: 'chocolate' } },
                ],
            },
            orderBy: {
                _relevance: {
                    fields: ['name', 'description'],
                    search: 'chocolate',
                    sort: 'desc',
                },
            },
        });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0]!.name).toBe('Éclair au chocolat');
    });

    // ---------------------------------------------------------------
    // H. orderBy _relevance with skip/take
    // ---------------------------------------------------------------

    it('supports pagination with relevance ordering', async () => {
        const allResults = await client.flavor.findMany({
            where: {
                OR: [{ name: { fuzzy: 'creme' } }, { name: { fuzzy: 'cafe' } }],
            },
            orderBy: {
                _relevance: { fields: ['name'], search: 'creme', sort: 'desc' },
            },
        });

        const paged = await client.flavor.findMany({
            where: {
                OR: [{ name: { fuzzy: 'creme' } }, { name: { fuzzy: 'cafe' } }],
            },
            orderBy: {
                _relevance: { fields: ['name'], search: 'creme', sort: 'desc' },
            },
            skip: 1,
            take: 1,
        });

        expect(paged).toHaveLength(1);
        expect(allResults.length).toBeGreaterThan(1);
        expect(paged[0]!.id).toBe(allResults[1]!.id);
    });

    // ---------------------------------------------------------------
    // I. fuzzyContains — approximate substring matching
    // ---------------------------------------------------------------

    it('fuzzyContains finds short term within longer name', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzyContains: 'choco' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
    });

    it('fuzzyContains finds term within description', async () => {
        const results = await client.flavor.findMany({
            where: { description: { fuzzyContains: 'pastryy' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
        expect(names).toContain('Pâté à choux');
    });

    it('fuzzyContains is accent-insensitive', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzyContains: 'brulee' } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Crème brûlée');
    });

    it('fuzzyContains combined with fuzzy on another field', async () => {
        const results = await client.flavor.findMany({
            where: {
                name: { fuzzyContains: 'eclair' },
                description: { fuzzy: 'chocolate' },
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.name).toBe('Éclair au chocolat');
    });

    it('fuzzyContains returns nothing for unrelated term', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzyContains: 'zzzzz' } },
        });
        expect(results).toHaveLength(0);
    });

    // ---------------------------------------------------------------
    // J. Mutations with fuzzy filter
    // ---------------------------------------------------------------

    it('updateMany with fuzzy filter', async () => {
        const { count } = await client.flavor.updateMany({
            where: { name: { fuzzy: 'creme' } },
            data: { description: 'Updated via fuzzy' },
        });
        expect(count).toBeGreaterThanOrEqual(2);

        const updated = await client.flavor.findMany({
            where: { description: { equals: 'Updated via fuzzy' } },
        });
        const names = updated.map((r) => r.name);
        expect(names).toContain('Crème brûlée');
        expect(names).toContain('Crème fraîche');
    });

    it('updateMany with fuzzyContains filter', async () => {
        const { count } = await client.flavor.updateMany({
            where: { name: { fuzzyContains: 'choco' } },
            data: { description: 'Has chocolate' },
        });
        expect(count).toBeGreaterThanOrEqual(1);

        const updated = await client.flavor.findMany({
            where: { description: { equals: 'Has chocolate' } },
        });
        expect(updated.some((r) => r.name === 'Éclair au chocolat')).toBe(true);
    });

    it('deleteMany with fuzzy filter', async () => {
        const beforeCount = await client.flavor.count();
        const { count } = await client.flavor.deleteMany({
            where: { name: { fuzzy: 'apple' } },
        });
        expect(count).toBeGreaterThanOrEqual(1);

        const afterCount = await client.flavor.count();
        expect(afterCount).toBe(beforeCount - count);

        const remaining = await client.flavor.findMany({
            where: { name: { equals: 'Apple' } },
        });
        expect(remaining).toHaveLength(0);
    });

    it('deleteMany with fuzzyContains filter', async () => {
        const { count } = await client.flavor.deleteMany({
            where: { description: { fuzzyContains: 'pastry' } },
        });
        expect(count).toBeGreaterThanOrEqual(1);

        const remaining = await client.flavor.findMany({
            where: { name: { equals: 'Éclair au chocolat' } },
        });
        expect(remaining).toHaveLength(0);
    });

    // ---------------------------------------------------------------
    // K. GroupBy with fuzzy filter
    // ---------------------------------------------------------------

    it('groupBy with fuzzy where filter', async () => {
        const groups = await client.flavor.groupBy({
            by: ['description'],
            where: { name: { fuzzy: 'creme' } },
            _count: true,
        });
        expect(groups.length).toBeGreaterThanOrEqual(2);
        const descriptions = groups.map((g: any) => g.description);
        expect(descriptions).toContain('French custard dessert');
        expect(descriptions).toContain('Thick French cream');
    });

    it('count with fuzzy filter', async () => {
        const count = await client.flavor.count({
            where: { name: { fuzzy: 'creme' } },
        });
        expect(count).toBeGreaterThanOrEqual(2);
    });

    it('count with fuzzyContains filter', async () => {
        const count = await client.flavor.count({
            where: { description: { fuzzyContains: 'pastry' } },
        });
        expect(count).toBeGreaterThanOrEqual(2);
    });
});
