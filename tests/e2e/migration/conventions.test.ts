import { describe, expect, it } from 'vitest';
import {
    buildSnapshot,
    diffSnapshots,
    emptySnapshot,
    foreignKeyName,
    generateMigrateBody,
    indexName,
    primaryKeyName,
    uniqueIndexName,
} from '@zenstackhq/migration';
import { compile, createTestDb, currentProvider, runDbPush, type Provider } from './support/harness';

const ID = 'id Int @id @default(autoincrement())';
const provider: Provider = currentProvider();

// A 69-char model name and a 66-char field name, matching the truncation fixtures captured
// from `prisma migrate diff` (Prisma v7).
const LONG_TABLE = 'ThisIsAVeryLongModelNameForTestingConstraintTruncationBehaviorInPrisma';
const LONG_COL = 'aReallyLongFieldNameToPushThePizzaOverSixtyThreeCharactersLimitHere';

describe('Prisma naming conventions', () => {
    it('matches Prisma constraint/index names', () => {
        expect(primaryKeyName('postgresql', 'users')).toBe('users_pkey');
        expect(foreignKeyName('postgresql', 'Post', ['authorId'])).toBe('Post_authorId_fkey');
        expect(uniqueIndexName('postgresql', 'users', ['email'])).toBe('users_email_key');
        expect(uniqueIndexName('postgresql', 'Post', ['title', 'slug'])).toBe('Post_title_slug_key');
        expect(indexName('postgresql', 'users', ['full_name'])).toBe('users_full_name_idx');
    });

    it('truncates to 63 chars on postgres (matching Prisma)', () => {
        expect(primaryKeyName('postgresql', LONG_TABLE)).toBe(
            'ThisIsAVeryLongModelNameForTestingConstraintTruncationBeha_pkey',
        );
        expect(uniqueIndexName('postgresql', LONG_TABLE, [LONG_COL])).toBe(
            'ThisIsAVeryLongModelNameForTestingConstraintTruncationBehav_key',
        );
    });

    it('does not truncate on sqlite (matching Prisma)', () => {
        expect(uniqueIndexName('sqlite', LONG_TABLE, [LONG_COL])).toBe(`${LONG_TABLE}_${LONG_COL}_key`);
    });
});

describe(`snapshot uses physical (mapped) names (${provider})`, () => {
    it('names indexes/fks after the mapped table, not the model', async () => {
        const schema = await compile(
            `model User { ${ID}  email String @unique  full String @map("full_name")  @@index([full])  @@map("users") }`,
            provider,
        );
        const table = buildSnapshot(schema).tables['users']!;
        expect(table.indexes.find((i) => i.columns.join() === 'email')?.name).toBe('users_email_key');
        expect(table.indexes.find((i) => i.columns.join() === 'full_name')?.name).toBe('users_full_name_idx');
    });
});

describe(`physical database gets Prisma-style names (${provider})`, () => {
    it('creates indexes named after the mapped table', async () => {
        const db = await createTestDb(provider);
        try {
            const schema = await compile(
                `model User { ${ID}  email String @unique  handle String  @@index([handle])  @@map("users") }`,
                provider,
            );
            await runDbPush(db, undefined, schema);
            const names = ((await db.introspect()).tables['users']?.indexes ?? []).map((i) => i.name);
            expect(names).toContain('users_email_key');
            expect(names).toContain('users_handle_idx');
        } finally {
            await db.cleanup();
        }
    });
});

describe(`emits Prisma default types (${provider})`, () => {
    it('maps DateTime and Decimal like Prisma', async () => {
        const schema = await compile(`model M { ${ID}  at DateTime  amt Decimal }`, provider);
        const snapshot = buildSnapshot(schema);
        const body = generateMigrateBody(diffSnapshots(emptySnapshot(provider), snapshot), provider, snapshot);
        if (provider === 'postgresql') {
            expect(body).toContain('timestamp(3)');
            expect(body).toContain('decimal(65,30)');
        } else {
            expect(body).toContain('datetime');
            expect(body).toContain('decimal');
        }
    });
});
