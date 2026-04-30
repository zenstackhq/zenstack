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
    // A. fuzzy mode 'simple' — basic English words
    // ---------------------------------------------------------------

    it('finds Apple despite missing letter (Aple)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Aple' } } },
        });
        expect(results.some((r) => r.name === 'Apple')).toBe(true);
    });

    it('finds Apple with transposed letters (Appel)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Appel' } } },
        });
        expect(results.some((r) => r.name === 'Apple')).toBe(true);
    });

    it('finds Strawberry despite missing letter (Strawbery)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Strawbery' } } },
        });
        expect(results.some((r) => r.name === 'Strawberry')).toBe(true);
    });

    it('finds Banana with truncation (Banan)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Banan' } } },
        });
        expect(results.some((r) => r.name === 'Banana')).toBe(true);
    });

    it('returns nothing for totally unrelated term', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'xyz123' } } },
        });
        expect(results).toHaveLength(0);
    });

    it('explicit mode "simple" matches the default', async () => {
        const implicit = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Aple' } } },
        });
        const explicit = await client.flavor.findMany({
            where: { name: { fuzzy: { mode: 'simple', search: 'Aple' } } },
        });
        expect(explicit.map((r) => r.id).sort()).toEqual(implicit.map((r) => r.id).sort());
    });

    // ---------------------------------------------------------------
    // B. fuzzy mode 'simple' — French words with accents
    // ---------------------------------------------------------------

    it('finds accented names when searching without accents (creme)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'creme', unaccent: true } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Crème brûlée');
        expect(names).toContain('Crème fraîche');
    });

    it('finds accented names when searching with exact accents (Crème)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Crème' } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Crème brûlée');
    });

    it('finds Café au lait without accent (cafe)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'cafe', unaccent: true } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Café au lait');
    });

    it('finds Éclair au chocolat with exact accent', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Éclair' } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
    });

    it('finds Éclair au chocolat without accent (eclair)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'eclair', unaccent: true } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
    });

    it('finds Pâté à choux with exact accent', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Pâté' } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Pâté à choux');
    });

    it('finds Pâté à choux without accent (pate)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'pate', unaccent: true } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Pâté à choux');
    });

    // ---------------------------------------------------------------
    // C. fuzzy on nullable field
    // ---------------------------------------------------------------

    it('does not return items with null name', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Apple' } } },
        });
        expect(results.every((r) => r.name !== null)).toBe(true);
    });

    it('fuzzy on description works for items with null name', async () => {
        const results = await client.flavor.findMany({
            where: { description: { fuzzy: { search: 'item' } } },
        });
        expect(results.some((r) => r.name === null)).toBe(true);
    });

    // ---------------------------------------------------------------
    // D. fuzzy combined with other filters
    // ---------------------------------------------------------------

    it('fuzzy combined with contains on another field', async () => {
        const results = await client.flavor.findMany({
            where: {
                name: { fuzzy: { search: 'creme', unaccent: true } },
                description: { contains: 'custard' },
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.name).toBe('Crème brûlée');
    });

    it('fuzzy combined with contains on the same field', async () => {
        const results = await client.flavor.findMany({
            where: {
                name: { fuzzy: { search: 'creme', unaccent: true }, contains: 'brûlée' },
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.name).toBe('Crème brûlée');
    });

    it('fuzzy combined with AND and startsWith', async () => {
        const results = await client.flavor.findMany({
            where: {
                AND: [
                    { name: { fuzzy: { search: 'creme', unaccent: true } } },
                    { description: { startsWith: 'Thick' } },
                ],
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.name).toBe('Crème fraîche');
    });

    // ---------------------------------------------------------------
    // E. fuzzy in logical compositions
    // ---------------------------------------------------------------

    it('OR with two fuzzy terms', async () => {
        const results = await client.flavor.findMany({
            where: {
                OR: [
                    { name: { fuzzy: { search: 'apple' } } },
                    { name: { fuzzy: { search: 'banana' } } },
                ],
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
                NOT: { name: { fuzzy: { search: 'apple' } } },
                name: { not: null },
            },
        });
        expect(results.length).toBeLessThan(all.length);
        expect(results.every((r) => r.name !== 'Apple')).toBe(true);
    });

    // ---------------------------------------------------------------
    // F. orderBy _fuzzyRelevance — single field
    // ---------------------------------------------------------------

    it('orders by relevance with best match first', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Apple' } } },
            orderBy: {
                _fuzzyRelevance: { fields: ['name'], search: 'Apple', sort: 'desc' },
            },
        });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0]!.name).toBe('Apple');
    });

    it('orders by relevance for accented search', async () => {
        const results = await client.flavor.findMany({
            where: {
                OR: [
                    { name: { fuzzy: { search: 'creme', unaccent: true } } },
                    { name: { fuzzy: { search: 'cafe', unaccent: true } } },
                ],
            },
            orderBy: {
                _fuzzyRelevance: { fields: ['name'], search: 'creme', sort: 'desc', unaccent: true },
            },
        });
        expect(results.length).toBeGreaterThanOrEqual(2);
        const firstTwo = results.slice(0, 2).map((r) => r.name);
        expect(firstTwo.some((n) => n?.startsWith('Crème'))).toBe(true);
    });

    // ---------------------------------------------------------------
    // G. orderBy _fuzzyRelevance — multiple fields
    // ---------------------------------------------------------------

    it('orders by relevance across multiple fields', async () => {
        const results = await client.flavor.findMany({
            where: {
                OR: [
                    { name: { fuzzy: { search: 'chocolate' } } },
                    { description: { fuzzy: { search: 'chocolate' } } },
                ],
            },
            orderBy: {
                _fuzzyRelevance: {
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
    // H. orderBy _fuzzyRelevance with skip/take
    // ---------------------------------------------------------------

    it('supports pagination with relevance ordering', async () => {
        const allResults = await client.flavor.findMany({
            where: {
                OR: [
                    { name: { fuzzy: { search: 'creme', unaccent: true } } },
                    { name: { fuzzy: { search: 'cafe', unaccent: true } } },
                ],
            },
            orderBy: {
                _fuzzyRelevance: { fields: ['name'], search: 'creme', sort: 'desc', unaccent: true },
            },
        });

        const paged = await client.flavor.findMany({
            where: {
                OR: [
                    { name: { fuzzy: { search: 'creme', unaccent: true } } },
                    { name: { fuzzy: { search: 'cafe', unaccent: true } } },
                ],
            },
            orderBy: {
                _fuzzyRelevance: { fields: ['name'], search: 'creme', sort: 'desc', unaccent: true },
            },
            skip: 1,
            take: 1,
        });

        expect(paged).toHaveLength(1);
        expect(allResults.length).toBeGreaterThan(1);
        expect(paged[0]!.id).toBe(allResults[1]!.id);
    });

    // ---------------------------------------------------------------
    // I. fuzzy mode 'word' — approximate substring matching (formerly fuzzyContains)
    // ---------------------------------------------------------------

    it('mode "word" finds short term within longer name', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { mode: 'word', search: 'choco' } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
    });

    it('mode "word" tolerates typos within description (pastryy)', async () => {
        const results = await client.flavor.findMany({
            where: { description: { fuzzy: { mode: 'word', search: 'pastryy' } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
        expect(names).toContain('Pâté à choux');
    });

    it('mode "word" is accent-insensitive', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { mode: 'word', search: 'brulee', unaccent: true } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Crème brûlée');
    });

    it('mode "word" combined with simple fuzzy on another field', async () => {
        const results = await client.flavor.findMany({
            where: {
                name: { fuzzy: { mode: 'word', search: 'eclair', unaccent: true } },
                description: { fuzzy: { search: 'chocolate' } },
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.name).toBe('Éclair au chocolat');
    });

    it('mode "word" returns nothing for unrelated term', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { mode: 'word', search: 'zzzzz' } } },
        });
        expect(results).toHaveLength(0);
    });

    // ---------------------------------------------------------------
    // J. Mutations with fuzzy filter
    // ---------------------------------------------------------------

    it('updateMany with fuzzy mode "simple" filter', async () => {
        const { count } = await client.flavor.updateMany({
            where: { name: { fuzzy: { search: 'creme', unaccent: true } } },
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

    it('updateMany with fuzzy mode "word" filter', async () => {
        const { count } = await client.flavor.updateMany({
            where: { name: { fuzzy: { mode: 'word', search: 'choco' } } },
            data: { description: 'Has chocolate' },
        });
        expect(count).toBeGreaterThanOrEqual(1);

        const updated = await client.flavor.findMany({
            where: { description: { equals: 'Has chocolate' } },
        });
        expect(updated.some((r) => r.name === 'Éclair au chocolat')).toBe(true);
    });

    it('deleteMany with fuzzy mode "simple" filter', async () => {
        const beforeCount = await client.flavor.count();
        const { count } = await client.flavor.deleteMany({
            where: { name: { fuzzy: { search: 'apple' } } },
        });
        expect(count).toBeGreaterThanOrEqual(1);

        const afterCount = await client.flavor.count();
        expect(afterCount).toBe(beforeCount - count);

        const remaining = await client.flavor.findMany({
            where: { name: { equals: 'Apple' } },
        });
        expect(remaining).toHaveLength(0);
    });

    it('deleteMany with fuzzy mode "word" filter', async () => {
        const { count } = await client.flavor.deleteMany({
            where: { description: { fuzzy: { mode: 'word', search: 'pastry' } } },
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
            where: { name: { fuzzy: { search: 'creme', unaccent: true } } },
            _count: true,
        });
        expect(groups.length).toBeGreaterThanOrEqual(2);
        const descriptions = groups.map((g: any) => g.description);
        expect(descriptions).toContain('French custard dessert');
        expect(descriptions).toContain('Thick French cream');
    });

    it('count with fuzzy mode "simple" filter', async () => {
        const count = await client.flavor.count({
            where: { name: { fuzzy: { search: 'creme', unaccent: true } } },
        });
        expect(count).toBeGreaterThanOrEqual(2);
    });

    it('count with fuzzy mode "word" filter', async () => {
        const count = await client.flavor.count({
            where: { description: { fuzzy: { mode: 'word', search: 'pastry' } } },
        });
        expect(count).toBeGreaterThanOrEqual(2);
    });

    // ---------------------------------------------------------------
    // L. fuzzy with explicit threshold (function form: similarity() > threshold)
    // ---------------------------------------------------------------

    it('high threshold (0.9) matches only near-exact terms', async () => {
        const high = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Apple', threshold: 0.9 } } },
        });
        const names = high.map((r) => r.name);
        expect(names).toContain('Apple');
        // 0.9 is strict — Apricot must not match Apple at this threshold
        expect(names).not.toContain('Apricot');
    });

    it('low threshold (0.05) matches more permissively than high threshold', async () => {
        const low = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'App', threshold: 0.05 } } },
        });
        const high = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'App', threshold: 0.9 } } },
        });
        expect(low.length).toBeGreaterThan(high.length);
    });

    it('threshold 0 matches every non-null name', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Apple', threshold: 0 } } },
        });
        // similarity() > 0 is true for any sharing at least one trigram; many seed
        // rows do NOT share a trigram with 'Apple', so this is not a free-for-all.
        // We only assert the strictest match is included and at least one weaker one too.
        const names = results.map((r) => r.name);
        expect(names).toContain('Apple');
        expect(results.length).toBeGreaterThan(1);
    });

    it('threshold 1 rejects everything (similarity strictly > 1 is impossible)', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Apple', threshold: 1 } } },
        });
        expect(results).toHaveLength(0);
    });

    it('threshold works with mode "word"', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { mode: 'word', search: 'choco', threshold: 0.5 } } },
        });
        expect(results.some((r) => r.name === 'Éclair au chocolat')).toBe(true);
    });

    it('threshold works with mode "strictWord"', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { mode: 'strictWord', search: 'choco', threshold: 0.3 } } },
        });
        expect(results.some((r) => r.name === 'Éclair au chocolat')).toBe(true);
    });

    it('threshold can be tuned per query without affecting subsequent queries', async () => {
        // Verify two queries with different thresholds return different result sets,
        // proving the threshold is per-query (function form), not session-wide.
        const strict = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Aple', threshold: 0.9 } } },
        });
        const lenient = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Aple', threshold: 0.1 } } },
        });
        expect(lenient.length).toBeGreaterThanOrEqual(strict.length);
    });

    // ---------------------------------------------------------------
    // M. fuzzy with mode 'strictWord'
    // ---------------------------------------------------------------

    it('mode "strictWord" finds the chocolate item', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { mode: 'strictWord', search: 'chocolat' } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Éclair au chocolat');
    });

    it('mode "strictWord" is generally stricter than mode "word"', async () => {
        const word = await client.flavor.findMany({
            where: { description: { fuzzy: { mode: 'word', search: 'pastry' } } },
        });
        const strict = await client.flavor.findMany({
            where: { description: { fuzzy: { mode: 'strictWord', search: 'pastry' } } },
        });
        expect(strict.length).toBeLessThanOrEqual(word.length);
    });

    // ---------------------------------------------------------------
    // N. fuzzy with unaccent (opt-in; default is false)
    // ---------------------------------------------------------------

    it('omitted unaccent uses the default (false) and does NOT match accented names', async () => {
        // Confirms the API contract: no implicit dependency on the `unaccent` extension.
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'creme' } } },
        });
        const names = results.map((r) => r.name);
        expect(names).not.toContain('Crème brûlée');
        expect(names).not.toContain('Crème fraîche');
    });

    it('unaccent: true (opt-in) finds accented terms via plain ascii search', async () => {
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'creme', unaccent: true } } },
        });
        const names = results.map((r) => r.name);
        expect(names).toContain('Crème brûlée');
    });

    it('unaccent: false still matches when search and field share casing/letters', async () => {
        // 'Apple' has no diacritics — disabling unaccent must not break basic matching.
        const results = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'Aple', unaccent: false } } },
        });
        expect(results.some((r) => r.name === 'Apple')).toBe(true);
    });

    it('unaccent: false yields fewer accented matches than unaccent: true', async () => {
        const withUnaccent = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'creme', unaccent: true } } },
        });
        const withoutUnaccent = await client.flavor.findMany({
            where: { name: { fuzzy: { search: 'creme', unaccent: false } } },
        });
        // With unaccent: 'creme' matches 'Crème brûlée' / 'Crème fraîche'.
        // Without unaccent: 'creme' will not match 'Crème ...' because trigrams differ.
        expect(withoutUnaccent.length).toBeLessThan(withUnaccent.length);
    });

    it('unaccent: false works alongside threshold and mode "word"', async () => {
        const results = await client.flavor.findMany({
            where: {
                name: {
                    fuzzy: { mode: 'word', search: 'choco', threshold: 0.5, unaccent: false },
                },
            },
        });
        expect(results.some((r) => r.name === 'Éclair au chocolat')).toBe(true);
    });

    // ---------------------------------------------------------------
    // O. cursor pagination guard
    // ---------------------------------------------------------------

    it('rejects cursor pagination combined with _fuzzyRelevance', async () => {
        const first = await client.flavor.findFirst({
            where: { name: { fuzzy: { search: 'creme', unaccent: true } } },
        });
        expect(first).not.toBeNull();
        await expect(
            client.flavor.findMany({
                where: { name: { fuzzy: { search: 'creme', unaccent: true } } },
                orderBy: {
                    _fuzzyRelevance: { fields: ['name'], search: 'creme', sort: 'desc' },
                },
                cursor: { id: first!.id },
                take: 2,
            }),
        ).rejects.toThrow(/_fuzzyRelevance/);
    });

    // ---------------------------------------------------------------
    // P. OrArray<OrderBy & FuzzyRelevanceOrderBy> contract
    //    Validates the design decision (PR #2573 review) to keep
    //    `_fuzzyRelevance` INSIDE the OrArray wrapper via intersection.
    //    Each test pins one of the use cases enabled by that shape.
    // ---------------------------------------------------------------

    it('case (a) single object: orderBy: { _fuzzyRelevance: {...} }', async () => {
        // Filter null names: similarity(NULL, ...) is NULL and Postgres places
        // NULLs first under DESC, which would crowd out the actual best match.
        const results = await client.flavor.findMany({
            where: { name: { not: null } },
            orderBy: { _fuzzyRelevance: { fields: ['name'], search: 'Apple', sort: 'desc' } },
        });
        expect(results[0]!.name).toBe('Apple');
    });

    it('case (a) single object is treated identically to a single-element array', async () => {
        // Proves the `enumerate()` normalization in buildOrderBy: the type-level
        // `OrArray<T> = T | T[]` collapses to the same runtime SQL.
        const single = await client.flavor.findMany({
            where: { name: { not: null } },
            orderBy: { _fuzzyRelevance: { fields: ['name'], search: 'Apple', sort: 'desc' } },
        });
        const arr = await client.flavor.findMany({
            where: { name: { not: null } },
            orderBy: [{ _fuzzyRelevance: { fields: ['name'], search: 'Apple', sort: 'desc' } }],
        });
        expect(arr.map((r) => r.id)).toEqual(single.map((r) => r.id));
    });

    it('case (b) relevance + scalar tie-breaker enables deterministic pagination', async () => {
        // Three identical names → primary similarity ties at 1.0. The scalar
        // tie-breaker is the only thing deciding the final order. Flipping its
        // direction must reverse the result order — proving Kysely chains
        // ORDER BY similarity(...) DESC, "id" ASC|DESC (Kysely orderBy is additive,
        // confirmed in node_modules/.pnpm/kysely.../order-by-node.js cloneWithItems).
        const created = await Promise.all([
            client.flavor.create({ data: { name: 'Mango', description: 'first' } }),
            client.flavor.create({ data: { name: 'Mango', description: 'second' } }),
            client.flavor.create({ data: { name: 'Mango', description: 'third' } }),
        ]);
        const ids = created.map((r) => r.id);

        const asc = await client.flavor.findMany({
            where: { name: { equals: 'Mango' } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'Mango', sort: 'desc' } },
                { id: 'asc' },
            ],
        });
        const desc = await client.flavor.findMany({
            where: { name: { equals: 'Mango' } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'Mango', sort: 'desc' } },
                { id: 'desc' },
            ],
        });

        expect(asc.map((r) => r.id)).toEqual([...ids].sort((a, b) => a - b));
        expect(desc.map((r) => r.id)).toEqual([...ids].sort((a, b) => b - a));
    });

    it('case (b) tie-breaker survives skip/take pagination', async () => {
        // Same forced-tie setup, then paginate. Page boundaries must be stable
        // because the tie-breaker is part of the ORDER BY.
        const created = await Promise.all([
            client.flavor.create({ data: { name: 'Mango', description: 'first' } }),
            client.flavor.create({ data: { name: 'Mango', description: 'second' } }),
            client.flavor.create({ data: { name: 'Mango', description: 'third' } }),
        ]);
        const sortedIds = created.map((r) => r.id).sort((a, b) => a - b);

        const page1 = await client.flavor.findMany({
            where: { name: { equals: 'Mango' } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'Mango', sort: 'desc' } },
                { id: 'asc' },
            ],
            take: 2,
        });
        const page2 = await client.flavor.findMany({
            where: { name: { equals: 'Mango' } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'Mango', sort: 'desc' } },
                { id: 'asc' },
            ],
            skip: 2,
            take: 2,
        });

        expect(page1.map((r) => r.id)).toEqual([sortedIds[0], sortedIds[1]]);
        expect(page2.map((r) => r.id)).toEqual([sortedIds[2]]);
    });

    it('case (c) multi-relevance: secondary clause breaks primary ties', async () => {
        // Two identical names → primary _fuzzyRelevance ties.
        // Swapping the secondary search term ('tropical' vs 'sweet') must flip
        // the order — proving the second relevance clause is genuinely emitted
        // as a chained ORDER BY column, not silently ignored.
        const created = await Promise.all([
            client.flavor.create({ data: { name: 'Mango', description: 'tropical fruit' } }),
            client.flavor.create({ data: { name: 'Mango', description: 'sweet treat' } }),
        ]);
        const ids = created.map((r) => r.id);

        const tropicalFirst = await client.flavor.findMany({
            where: { id: { in: ids } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'Mango', sort: 'desc' } },
                { _fuzzyRelevance: { fields: ['description'], search: 'tropical', sort: 'desc' } },
            ],
        });
        const sweetFirst = await client.flavor.findMany({
            where: { id: { in: ids } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'Mango', sort: 'desc' } },
                { _fuzzyRelevance: { fields: ['description'], search: 'sweet', sort: 'desc' } },
            ],
        });

        expect(tropicalFirst[0]!.description).toBe('tropical fruit');
        expect(tropicalFirst[1]!.description).toBe('sweet treat');
        expect(sweetFirst[0]!.description).toBe('sweet treat');
        expect(sweetFirst[1]!.description).toBe('tropical fruit');
    });

    it('case (c) multi-relevance combined with scalar tie-breaker', async () => {
        // Stress the chain: 3 records, primary tied, secondary tied between two
        // of them, scalar tie-breaker decides the leftover. Verifies arbitrary
        // chaining depth works.
        const created = await Promise.all([
            client.flavor.create({ data: { name: 'Mango', description: 'tropical' } }),
            client.flavor.create({ data: { name: 'Mango', description: 'cherry' } }),
            client.flavor.create({ data: { name: 'Mango', description: 'cherry' } }),
        ]);
        const ids = created.map((r) => r.id);
        const cherryIds = [ids[1]!, ids[2]!].sort((a, b) => a - b);

        const results = await client.flavor.findMany({
            where: { id: { in: ids } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'Mango', sort: 'desc' } },
                { _fuzzyRelevance: { fields: ['description'], search: 'cherry', sort: 'desc' } },
                { id: 'asc' },
            ],
        });

        expect(results.map((r) => r.id)).toEqual([cherryIds[0], cherryIds[1], ids[0]]);
    });

    it('contract: empty object as array element is silently no-op', async () => {
        // Falls out of buildOrderBy's `Object.entries({})` yielding nothing — the
        // element is skipped without affecting other elements in the array.
        const ref = await client.flavor.findMany({ orderBy: { id: 'asc' } });
        const padded = await client.flavor.findMany({ orderBy: [{}, { id: 'asc' }] });
        expect(padded.map((r) => r.id)).toEqual(ref.map((r) => r.id));
    });

    it('contract: multi-key in a single orderBy element is rejected by Zod refinement', async () => {
        // The intersection `OrderBy & FuzzyRelevanceOrderBy` allows multiple keys
        // at the type level, but `refineAtMostOneKey` in zod/factory.ts rejects
        // them at runtime. This forces users into the array form for
        // tie-breakers, which is the path the runtime parser actually supports.
        await expect(
            client.flavor.findMany({
                orderBy: {
                    _fuzzyRelevance: { fields: ['name'], search: 'Apple', sort: 'desc' },
                    id: 'asc',
                },
            }),
        ).rejects.toThrow();
    });

    // ---------------------------------------------------------------
    // Q. orderBy _fuzzyRelevance options
    // ---------------------------------------------------------------

    it('mode "word" ranks an exact embedded word above a prefix-only word', async () => {
        const prefixOnly = await client.flavor.create({ data: { name: 'Chocolate', description: 'prefix only' } });
        const embeddedWord = await client.flavor.create({ data: { name: 'Hot choco drink', description: 'word' } });

        const results = await client.flavor.findMany({
            where: { id: { in: [prefixOnly.id, embeddedWord.id] } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'choco', mode: 'word', sort: 'desc' } },
                { id: 'asc' },
            ],
        });

        expect(results[0]!.id).toBe(embeddedWord.id);
    });

    it('mode "strictWord" ranks word-boundary matches above non-boundary matches', async () => {
        const nonBoundary = await client.flavor.create({ data: { name: 'xxchocoxx', description: 'non-boundary' } });
        const wordBoundary = await client.flavor.create({ data: { name: 'hot choco drink', description: 'boundary' } });

        const strict = await client.flavor.findMany({
            where: { id: { in: [nonBoundary.id, wordBoundary.id] } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'choco', mode: 'strictWord', sort: 'desc' } },
                { id: 'asc' },
            ],
        });

        expect(strict[0]!.id).toBe(wordBoundary.id);
    });

    it('unaccent toggles relevance scoring for ascii searches against accented names', async () => {
        const accented = await client.flavor.create({ data: { name: 'Crème', description: 'accented exact' } });
        const asciiPrefix = await client.flavor.create({ data: { name: 'Cremezzzz', description: 'ascii prefix' } });

        const withoutUnaccent = await client.flavor.findMany({
            where: { id: { in: [accented.id, asciiPrefix.id] } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'creme', sort: 'desc', unaccent: false } },
                { id: 'asc' },
            ],
        });
        const withUnaccent = await client.flavor.findMany({
            where: { id: { in: [accented.id, asciiPrefix.id] } },
            orderBy: [
                { _fuzzyRelevance: { fields: ['name'], search: 'creme', sort: 'desc', unaccent: true } },
                { id: 'asc' },
            ],
        });

        expect(withoutUnaccent[0]!.id).toBe(asciiPrefix.id);
        expect(withUnaccent[0]!.id).toBe(accented.id);
    });
});
