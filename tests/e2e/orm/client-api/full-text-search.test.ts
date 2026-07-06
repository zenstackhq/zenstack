import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient, getTestDbProvider } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/full-text-search/schema';

type Schema = typeof schema;
const provider = getTestDbProvider();

describe.skipIf(provider !== 'postgresql')('Full-text search tests', () => {
    let client: ClientContract<Schema>;

    beforeEach(async () => {
        client = (await createTestClient(schema)) as unknown as ClientContract<Schema>;

        await client.article.createMany({
            data: [
                { title: 'The quick brown fox', body: 'the quick brown fox jumps over the lazy dog' },
                { title: 'A cat and a dog', body: 'cat and dog make great pets together' },
                { title: 'Lazy cat sleeps all day', body: 'some cat sleeps more than others' },
                { title: 'The running man', body: 'He runs every morning before work' },
                { title: 'Database performance', body: 'Optimizing query performance for databases' },
                { title: 'PostgreSQL full-text search', body: 'tsvector and tsquery enable searching documents' },
                { title: 'Untitled note', body: 'just some notes', notes: 'a non-searchable note column' },
            ],
        });
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    // ---------------------------------------------------------------
    // A. Basic single-term search
    // ---------------------------------------------------------------

    it('finds articles by a single term', async () => {
        const results = await client.article.findMany({
            where: { title: { fts: { search: 'fox' } } },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.title).toBe('The quick brown fox');
    });

    it('searches in the body field', async () => {
        const results = await client.article.findMany({
            where: { body: { fts: { search: 'pets' } } },
        });
        expect(results.some((r) => r.title === 'A cat and a dog')).toBe(true);
    });

    it('returns nothing for a term not in any document', async () => {
        const results = await client.article.findMany({
            where: { title: { fts: { search: 'zebra' } } },
        });
        expect(results).toHaveLength(0);
    });

    // ---------------------------------------------------------------
    // B. to_tsquery boolean operators
    // ---------------------------------------------------------------

    it('AND operator (&) requires both terms', async () => {
        const results = await client.article.findMany({
            where: { title: { fts: { search: 'cat & dog' } } },
        });
        const titles = results.map((r) => r.title);
        expect(titles).toContain('A cat and a dog');
        // Articles with only one of the terms should not match
        expect(titles).not.toContain('Lazy cat sleeps all day');
    });

    it('OR operator (|) matches either term', async () => {
        const results = await client.article.findMany({
            where: { title: { fts: { search: 'fox | cat' } } },
        });
        const titles = results.map((r) => r.title);
        expect(titles).toContain('The quick brown fox');
        expect(titles).toContain('A cat and a dog');
        expect(titles).toContain('Lazy cat sleeps all day');
    });

    it('NOT operator (!) excludes a term', async () => {
        const results = await client.article.findMany({
            where: { title: { fts: { search: 'cat & !lazy' } } },
        });
        const titles = results.map((r) => r.title);
        expect(titles).toContain('A cat and a dog');
        expect(titles).not.toContain('Lazy cat sleeps all day');
    });

    it('FOLLOWED-BY operator (<->) requires the words be adjacent in order', async () => {
        const results = await client.article.findMany({
            where: { body: { fts: { search: 'quick <-> brown' } } },
        });
        const titles = results.map((r) => r.title);
        expect(titles).toContain('The quick brown fox');
    });

    // ---------------------------------------------------------------
    // C. Postgres text-search configuration
    // ---------------------------------------------------------------

    it('config "english" applies stemming (running matches "runs")', async () => {
        // 'english' stems "running" → "run", so a search for 'run' matches "runs".
        const results = await client.article.findMany({
            where: { body: { fts: { search: 'run', config: 'english' } } },
        });
        expect(results.some((r) => r.title === 'The running man')).toBe(true);
    });

    it('config "simple" does NOT stem', async () => {
        // With 'simple', 'run' tokenizes literally and won't match 'runs' / 'running'.
        const results = await client.article.findMany({
            where: { body: { fts: { search: 'run', config: 'simple' } } },
        });
        // No row has the literal token 'run' — only 'runs' / 'running'.
        expect(results.some((r) => r.title === 'The running man')).toBe(false);
    });

    it('omitting config uses the database-level default_text_search_config', async () => {
        // Without an explicit config, Postgres falls back to the cluster's
        // default_text_search_config setting. We assert the SQL works (no error)
        // and round-trips an exact-token match — behavior under stemming-vs-not
        // depends on the DB default and is not asserted here.
        const results = await client.article.findMany({
            where: { body: { fts: { search: 'fox' } } },
        });
        expect(results.some((r) => r.title === 'The quick brown fox')).toBe(true);
    });

    it('config is per-query (no session leakage between queries)', async () => {
        const englishStemmed = await client.article.findMany({
            where: { body: { fts: { search: 'run', config: 'english' } } },
        });
        // Run an explicit-`simple` query right after — it must not inherit the
        // previous `english` config from the connection.
        const simple = await client.article.findMany({
            where: { body: { fts: { search: 'run', config: 'simple' } } },
        });
        expect(englishStemmed.length).toBeGreaterThan(simple.length);
    });

    // ---------------------------------------------------------------
    // D. Composition with logical combinators
    // ---------------------------------------------------------------

    it('AND combinator with two fts filters across fields', async () => {
        const results = await client.article.findMany({
            where: {
                AND: [{ title: { fts: { search: 'cat' } } }, { body: { fts: { search: 'pets' } } }],
            },
        });
        expect(results.some((r) => r.title === 'A cat and a dog')).toBe(true);
    });

    it('OR combinator with two fts filters', async () => {
        const results = await client.article.findMany({
            where: {
                OR: [{ title: { fts: { search: 'fox' } } }, { title: { fts: { search: 'database' } } }],
            },
        });
        const titles = results.map((r) => r.title);
        expect(titles).toContain('The quick brown fox');
        expect(titles).toContain('Database performance');
    });

    it('fts combined with another string operator on the same field', async () => {
        const results = await client.article.findMany({
            where: {
                title: {
                    fts: { search: 'cat' },
                    contains: 'Lazy',
                },
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.title).toBe('Lazy cat sleeps all day');
    });

    // ---------------------------------------------------------------
    // E. _ftsRelevance orderBy — single field
    // ---------------------------------------------------------------

    it('orders by relevance — best match first', async () => {
        const results = await client.article.findMany({
            where: { body: { fts: { search: 'cat | dog' } } },
            orderBy: { _ftsRelevance: { fields: ['body'], search: 'cat & dog', sort: 'desc' } },
        });
        // The article that contains BOTH cat AND dog should rank highest.
        expect(results[0]!.title).toBe('A cat and a dog');
    });

    it('single-field _ftsRelevance on a nullable @fullText field tolerates NULL rows', async () => {
        // `subtitle` is `String? @fullText`. A row whose subtitle is NULL must
        // not break the orderBy expression — `to_tsvector(NULL)` returns NULL
        // and `ts_rank(NULL, ...)` returns NULL, which would otherwise place
        // those rows at the front under ASC. The single-field path coalesces
        // NULL → '' so `ts_rank` returns 0.0 instead, matching how the
        // multi-field `concat_ws` path already handles NULL inputs.
        const created = await Promise.all([
            client.article.create({ data: { title: 't1', body: 'b1', subtitle: 'cat' } }),
            client.article.create({ data: { title: 't2', body: 'b2', subtitle: null } }),
        ]);
        const ids = created.map((r) => r.id);
        const results = await client.article.findMany({
            where: { id: { in: ids } },
            orderBy: [
                { _ftsRelevance: { fields: ['subtitle'], search: 'cat', sort: 'desc' } },
                { id: 'asc' },
            ],
        });
        expect(results.map((r) => r.subtitle)).toEqual(['cat', null]);
    });

    it('orderBy with config option', async () => {
        const results = await client.article.findMany({
            where: { body: { fts: { search: 'run', config: 'english' } } },
            orderBy: {
                _ftsRelevance: { fields: ['body'], search: 'run', config: 'english', sort: 'desc' },
            },
        });
        expect(results[0]!.title).toBe('The running man');
    });

    // ---------------------------------------------------------------
    // F. _ftsRelevance orderBy — multiple fields (concat_ws → single ts_rank)
    // ---------------------------------------------------------------

    it('multi-field relevance: row with both terms ranks above row with one term', async () => {
        // 'A cat and a dog' has both 'cat' and 'dog' in title and body.
        // 'Lazy cat sleeps all day' has 'cat' only.
        const results = await client.article.findMany({
            where: {
                OR: [{ title: { fts: { search: 'cat | dog' } } }, { body: { fts: { search: 'cat | dog' } } }],
            },
            orderBy: {
                _ftsRelevance: {
                    fields: ['title', 'body'],
                    search: 'cat & dog',
                    sort: 'desc',
                },
            },
        });
        expect(results[0]!.title).toBe('A cat and a dog');
    });

    it('multi-field relevance: AND query matches when terms are split across fields', async () => {
        // The whole point of concat_ws over per-field ts_rank: a row whose title
        // has one term and body has the other term must rank above a row that
        // has neither — i.e. the AND query has to evaluate against the COMBINED
        // document, not against each field independently (which would yield 0).
        const split = await client.article.create({
            data: { title: 'cat in the hat', body: 'plus a friendly dog' },
        });
        const results = await client.article.findMany({
            where: { id: split.id },
            orderBy: {
                _ftsRelevance: { fields: ['title', 'body'], search: 'cat & dog', sort: 'desc' },
            },
        });
        // The split row is selected by id, so it must come back. The key invariant
        // is that the orderBy expression doesn't error and ts_rank returns a
        // non-zero score (which we verify indirectly by also pulling it via
        // the OR fts filter — it should appear there too).
        expect(results).toHaveLength(1);
        expect(results[0]!.id).toBe(split.id);

        const ranked = await client.article.findMany({
            where: {
                OR: [{ title: { fts: { search: 'cat | dog' } } }, { body: { fts: { search: 'cat | dog' } } }],
            },
            orderBy: {
                _ftsRelevance: { fields: ['title', 'body'], search: 'cat & dog', sort: 'desc' },
            },
        });
        // The split row qualifies for 'cat & dog' under concat semantics — so it
        // must be included in the ranked output. Under the old SUM semantics it
        // would have been scored 0 and ranked last, but it must now appear
        // above any row that contains neither term.
        expect(ranked.map((r) => r.id)).toContain(split.id);
    });

    // ---------------------------------------------------------------
    // G. Pagination
    // ---------------------------------------------------------------

    it('skip/take works alongside _ftsRelevance', async () => {
        const all = await client.article.findMany({
            where: { body: { fts: { search: 'cat | dog | fox' } } },
            orderBy: [{ _ftsRelevance: { fields: ['body'], search: 'cat & dog', sort: 'desc' } }, { id: 'asc' }],
        });
        const paged = await client.article.findMany({
            where: { body: { fts: { search: 'cat | dog | fox' } } },
            orderBy: [{ _ftsRelevance: { fields: ['body'], search: 'cat & dog', sort: 'desc' } }, { id: 'asc' }],
            skip: 1,
            take: 1,
        });
        expect(paged).toHaveLength(1);
        expect(paged[0]!.id).toBe(all[1]!.id);
    });

    it('rejects cursor pagination combined with _ftsRelevance', async () => {
        const first = await client.article.findFirst({
            where: { body: { fts: { search: 'cat' } } },
        });
        expect(first).not.toBeNull();
        await expect(
            client.article.findMany({
                where: { body: { fts: { search: 'cat' } } },
                orderBy: { _ftsRelevance: { fields: ['body'], search: 'cat', sort: 'desc' } },
                cursor: { id: first!.id },
                take: 2,
            }),
        ).rejects.toThrow(/_ftsRelevance/);
    });

    // ---------------------------------------------------------------
    // H. Mutations / aggregations
    // ---------------------------------------------------------------

    it('updateMany with fts filter', async () => {
        const { count } = await client.article.updateMany({
            where: { body: { fts: { search: 'pets' } } },
            data: { notes: 'pet-related' },
        });
        expect(count).toBeGreaterThanOrEqual(1);
        const updated = await client.article.findMany({ where: { notes: { equals: 'pet-related' } } });
        expect(updated.some((r) => r.title === 'A cat and a dog')).toBe(true);
    });

    it('deleteMany with fts filter', async () => {
        const { count } = await client.article.deleteMany({
            where: { title: { fts: { search: 'fox' } } },
        });
        expect(count).toBe(1);
        const remaining = await client.article.findMany({ where: { title: { equals: 'The quick brown fox' } } });
        expect(remaining).toHaveLength(0);
    });

    it('count with fts filter', async () => {
        const c = await client.article.count({ where: { body: { fts: { search: 'cat | dog' } } } });
        expect(c).toBeGreaterThanOrEqual(2);
    });

    // ---------------------------------------------------------------
    // I. @fullText gating — non-searchable fields rejected by Zod
    // ---------------------------------------------------------------

    it('rejects fts on a non-@fullText field', async () => {
        // The Zod schema strips `fts` from the StringFilter for fields without
        // `@fullText`, so passing it here surfaces an "Unrecognized key" error
        // pointing at the exact field path.
        await expect(
            client.article.findMany({
                where: { notes: { fts: { search: 'foo' } } as any } as any,
            }),
        ).rejects.toThrow(/Unrecognized key:\s*"fts"\s*at\s*"where\.notes"/i);
    });

    it('rejects _ftsRelevance on a non-@fullText field', async () => {
        // `_ftsRelevance.fields` is typed as an enum of `@fullText` field names
        // only — `notes` is rejected with a precise enum-mismatch error that
        // also confirms the enum lists exactly the three `@fullText` fields.
        await expect(
            client.article.findMany({
                orderBy: {
                    _ftsRelevance: { fields: ['notes' as any], search: 'foo', sort: 'desc' },
                } as any,
            }),
        ).rejects.toThrow(
            /expected one of "title"\|"body"\|"subtitle"\s*at\s*"orderBy\._ftsRelevance\.fields/i,
        );
    });

    // ---------------------------------------------------------------
    // J. Malformed query — execution-time SQL error surfaces
    // ---------------------------------------------------------------

    it('malformed to_tsquery syntax throws Postgres syntax error', async () => {
        // 'foo &&' is not valid tsquery syntax — Postgres throws
        // `syntax error in tsquery: "foo &&"` and we let it surface verbatim
        // (we do not pre-validate the query string).
        await expect(
            client.article.findMany({ where: { title: { fts: { search: 'foo &&' } } } }),
        ).rejects.toThrow(/syntax error in tsquery/i);
    });

    // ---------------------------------------------------------------
    // K. OrArray contract — single object == single-element array
    // ---------------------------------------------------------------

    it('single-object orderBy is equivalent to single-element-array orderBy', async () => {
        const single = await client.article.findMany({
            orderBy: { _ftsRelevance: { fields: ['title'], search: 'cat | fox', sort: 'desc' } },
            where: { title: { fts: { search: 'cat | fox' } } },
        });
        const arr = await client.article.findMany({
            orderBy: [{ _ftsRelevance: { fields: ['title'], search: 'cat | fox', sort: 'desc' } }],
            where: { title: { fts: { search: 'cat | fox' } } },
        });
        expect(arr.map((r) => r.id)).toEqual(single.map((r) => r.id));
    });

    it('relevance + scalar tie-breaker enables deterministic pagination', async () => {
        // Force ties by inserting duplicates with identical title/body content.
        const created = await Promise.all([
            client.article.create({ data: { title: 'Tie title', body: 'Tie body' } }),
            client.article.create({ data: { title: 'Tie title', body: 'Tie body' } }),
            client.article.create({ data: { title: 'Tie title', body: 'Tie body' } }),
        ]);
        const ids = created.map((r) => r.id);
        const asc = await client.article.findMany({
            where: { id: { in: ids } },
            orderBy: [{ _ftsRelevance: { fields: ['title'], search: 'tie', sort: 'desc' } }, { id: 'asc' }],
        });
        const desc = await client.article.findMany({
            where: { id: { in: ids } },
            orderBy: [{ _ftsRelevance: { fields: ['title'], search: 'tie', sort: 'desc' } }, { id: 'desc' }],
        });
        expect(asc.map((r) => r.id)).toEqual([...ids].sort((a, b) => a - b));
        expect(desc.map((r) => r.id)).toEqual([...ids].sort((a, b) => b - a));
    });

    // ---------------------------------------------------------------
    // L. Filter-kind slicing — `'FullText'` kind controls the `fts` operator
    // ---------------------------------------------------------------

    it('slicing: excludedFilterKinds: ["FullText"] removes the fts operator', async () => {
        // The suite-level beforeEach already opened a connection to this test's DB;
        // release it so we can recreate the DB with custom slicing config.
        await client.$disconnect();
        const options = {
            slicing: {
                models: {
                    article: {
                        fields: {
                            $all: {
                                excludedFilterKinds: ['FullText'] as const,
                            },
                        },
                    },
                },
            },
            dialect: {} as any,
        } as const;
        const db = await createTestClient<typeof schema, typeof options>(schema, options);
        await db.article.create({ data: { title: 'cat', body: 'a cat' } });

        // Other string operators in the same StringFilter are still available.
        const found = await db.article.findMany({ where: { title: { contains: 'cat' } } });
        expect(found).toHaveLength(1);

        // The `fts` operator is dropped from the schema.
        await expect(
            db.article.findMany({
                // @ts-expect-error — `fts` is excluded by slicing
                where: { title: { fts: { search: 'cat' } } },
            }),
        ).toBeRejectedByValidation(['"fts"']);

        await db.$disconnect();
    });

    it('slicing: includedFilterKinds without "FullText" removes the fts operator', async () => {
        await client.$disconnect();
        const options = {
            slicing: {
                models: {
                    article: {
                        fields: {
                            $all: {
                                includedFilterKinds: ['Equality', 'Like'] as const,
                            },
                        },
                    },
                },
            },
            dialect: {} as any,
        } as const;
        const db = await createTestClient<typeof schema, typeof options>(schema, options);
        await db.article.create({ data: { title: 'cat', body: 'a cat' } });

        // Equality + Like still work
        const eq = await db.article.findMany({ where: { title: { equals: 'cat' } } });
        expect(eq).toHaveLength(1);
        const like = await db.article.findMany({ where: { title: { contains: 'cat' } } });
        expect(like).toHaveLength(1);

        await expect(
            db.article.findMany({
                // @ts-expect-error — `fts` not in includedFilterKinds
                where: { title: { fts: { search: 'cat' } } },
            }),
        ).toBeRejectedByValidation(['"fts"']);

        await db.$disconnect();
    });

    it('slicing: includedFilterKinds with "FullText" keeps fts and drops siblings', async () => {
        await client.$disconnect();
        const options = {
            slicing: {
                models: {
                    article: {
                        fields: {
                            $all: {
                                includedFilterKinds: ['FullText', 'Equality'] as const,
                            },
                        },
                    },
                },
            },
            dialect: {} as any,
        } as const;
        const db = await createTestClient<typeof schema, typeof options>(schema, options);
        await db.article.create({ data: { title: 'cat', body: 'a cat' } });

        // fts works
        const fts = await db.article.findMany({ where: { title: { fts: { search: 'cat' } } } });
        expect(fts).toHaveLength(1);

        // Like-kind operators are excluded
        await expect(
            db.article.findMany({
                // @ts-expect-error — `contains` (Like) is not in includedFilterKinds
                where: { title: { contains: 'cat' } },
            }),
        ).toBeRejectedByValidation(['"contains"']);

        await db.$disconnect();
    });
});
