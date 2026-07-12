import type { SchemaDef } from '@zenstackhq/schema';
import { describe, expect, it } from 'vitest';
import {
    columnNames,
    compile,
    createTestDb,
    currentProvider,
    hasForeignKey,
    hasIndex,
    runDbPush,
    runMigrateDeploy,
    runMigrateDev,
    tableNames,
    type DbSchema,
    type Provider,
} from './support/harness';

type Flow = 'push' | 'dev' | 'deploy';
const FLOWS: Flow[] = ['push', 'dev', 'deploy'];

interface Scenario {
    name: string;
    /** ZModel body of the starting state; omit for an initial migration (empty db). */
    from?: string;
    /** ZModel body of the target state. */
    to: string;
    /** Assertions on the introspected database after the flow. */
    assert: (db: DbSchema, provider: Provider) => void;
}

const ID = 'id Int @id @default(autoincrement())';

const SCENARIOS: Scenario[] = [
    {
        name: 'initial migration',
        to: `model User { ${ID}  name String }`,
        assert: (db) => {
            expect(tableNames(db)).toContain('User');
            expect(columnNames(db, 'User')).toEqual(['id', 'name']);
        },
    },
    {
        name: 'add a new model',
        from: `model User { ${ID} }`,
        to: `model User { ${ID} }  model Post { ${ID}  title String }`,
        assert: (db) => {
            expect(tableNames(db)).toContain('Post');
            expect(columnNames(db, 'Post')).toEqual(['id', 'title']);
        },
    },
    {
        name: 'remove a model',
        from: `model User { ${ID} }  model Post { ${ID} }`,
        to: `model User { ${ID} }`,
        assert: (db) => {
            expect(tableNames(db)).toContain('User');
            expect(tableNames(db)).not.toContain('Post');
        },
    },
    {
        name: 'rename a model',
        from: `model User { ${ID}  name String }`,
        to: `model Account { ${ID}  name String }`,
        assert: (db) => {
            expect(tableNames(db)).toContain('Account');
            expect(tableNames(db)).not.toContain('User');
        },
    },
    {
        name: 'add a field',
        from: `model User { ${ID} }`,
        to: `model User { ${ID}  email String }`,
        assert: (db) => {
            expect(columnNames(db, 'User')).toContain('email');
        },
    },
    {
        name: 'remove a field',
        from: `model User { ${ID}  email String }`,
        to: `model User { ${ID} }`,
        assert: (db) => {
            expect(columnNames(db, 'User')).not.toContain('email');
        },
    },
    {
        name: 'rename a field',
        from: `model User { ${ID}  name String }`,
        to: `model User { ${ID}  fullName String }`,
        assert: (db) => {
            expect(columnNames(db, 'User')).toContain('fullName');
            expect(columnNames(db, 'User')).not.toContain('name');
        },
    },
    {
        name: 'add a relation',
        from: `model User { ${ID} }  model Post { ${ID} }`,
        to: `model User { ${ID}  posts Post[] }  model Post { ${ID}  author User @relation(fields: [authorId], references: [id])  authorId Int }`,
        assert: (db) => {
            expect(columnNames(db, 'Post')).toContain('authorId');
            expect(hasForeignKey(db, 'Post', 'User')).toBe(true);
        },
    },
    {
        name: 'remove a relation',
        from: `model User { ${ID}  posts Post[] }  model Post { ${ID}  author User @relation(fields: [authorId], references: [id])  authorId Int }`,
        to: `model User { ${ID} }  model Post { ${ID} }`,
        assert: (db) => {
            expect(columnNames(db, 'Post')).not.toContain('authorId');
            expect(hasForeignKey(db, 'Post', 'User')).toBe(false);
        },
    },
    {
        name: 'rename a relation',
        from: `model User { ${ID}  posts Post[] }  model Post { ${ID}  author User @relation(fields: [authorId], references: [id])  authorId Int }`,
        to: `model User { ${ID}  articles Post[] }  model Post { ${ID}  writer User @relation(fields: [authorId], references: [id])  authorId Int }`,
        assert: (db) => {
            // the relation is logical; the FK column/target are unchanged
            expect(columnNames(db, 'Post')).toContain('authorId');
            expect(hasForeignKey(db, 'Post', 'User')).toBe(true);
        },
    },
    {
        name: 'add a unique index',
        from: `model User { ${ID}  email String }`,
        to: `model User { ${ID}  email String @unique }`,
        assert: (db) => {
            expect(hasIndex(db, 'User', ['email'], true)).toBe(true);
        },
    },
    {
        name: 'add a regular index',
        from: `model User { ${ID}  email String }`,
        to: `model User { ${ID}  email String  @@index([email]) }`,
        assert: (db) => {
            expect(hasIndex(db, 'User', ['email'], false)).toBe(true);
        },
    },
    {
        name: 'remove an index',
        from: `model User { ${ID}  email String  @@index([email]) }`,
        to: `model User { ${ID}  email String }`,
        assert: (db) => {
            expect(hasIndex(db, 'User', ['email'])).toBe(false);
        },
    },
    {
        name: 'rename an index (map)',
        from: `model User { ${ID}  email String  @@index([email]) }`,
        to: `model User { ${ID}  email String  @@index([email], map: "custom_email_idx") }`,
        assert: (db) => {
            const idx = (db.tables['User']?.indexes ?? []).find((i) => i.columns.join(',') === 'email');
            expect(idx?.name).toBe('custom_email_idx');
        },
    },
];

// The provider is selected by `TEST_DB_PROVIDER` (default `sqlite`); the suite runs once
// per provider (e.g. `pnpm test:sqlite`, `pnpm test:postgresql`).
const provider: Provider = currentProvider();

describe(`migration scenarios (${provider})`, () => {
    // cache compiled schemas per scenario body
    const cache = new Map<string, Promise<SchemaDef>>();
    const compileCached = (body: string) => {
        if (!cache.has(body)) {
            cache.set(body, compile(body, provider));
        }
        return cache.get(body)!;
    };

    describe.each(SCENARIOS)('$name', (scenario) => {
        it.each(FLOWS)('%s', async (flow) => {
            const db = await createTestDb(provider, { debug: true });
            try {
                const from = scenario.from ? await compileCached(scenario.from) : undefined;
                const to = await compileCached(scenario.to);

                if (flow === 'push') {
                    await runDbPush(db, from, to);
                } else if (flow === 'dev') {
                    await runMigrateDev(db, from, to);
                } else {
                    await runMigrateDeploy(db, from, to);
                }

                scenario.assert(await db.introspect(), provider);
            } finally {
                // await db.cleanup();
            }
        });
    });
});
