import { describe, expect, it } from 'vitest';
import {
    columnNames,
    columnType,
    compile,
    createTestDb,
    currentProvider,
    runDbPush,
    runMigrateDev,
    type Provider,
} from './support/harness';

const provider: Provider = currentProvider();
const ID = 'id Int @id @default(autoincrement())';

// Native `@db.*` types are provider-specific; use a valid set per provider.
const POSTGRES_MODEL = `model Widget { ${ID}  code String @db.VarChar(64)  uid String @db.Uuid  price Decimal @db.Decimal(10, 2)  qty Int @db.SmallInt  createdAt DateTime @db.Timestamptz }`;
const MYSQL_MODEL = `model Widget { ${ID}  code String @db.VarChar(64)  price Decimal @db.Decimal(10, 2)  qty Int @db.SmallInt  createdAt DateTime @db.DateTime(6) }`;
// SQLite rejects foreign native types, so it only gets a plain model as a smoke test.
const SQLITE_MODEL = `model Widget { ${ID}  code String  price Decimal  qty Int  createdAt DateTime }`;

// The concrete column types the database reports for each provider (Kysely introspection).
const EXPECTED: Partial<Record<Provider, Record<string, string>>> = {
    postgresql: { code: 'varchar', uid: 'uuid', price: 'numeric', qty: 'int2', createdAt: 'timestamptz' },
    mysql: { code: 'varchar', price: 'decimal', qty: 'smallint', createdAt: 'datetime' },
};

const MODEL = provider === 'mysql' ? MYSQL_MODEL : provider === 'sqlite' ? SQLITE_MODEL : POSTGRES_MODEL;

describe(`native @db.* types applied via CLI flows (${provider})`, () => {
    it.each(['push', 'dev'] as const)('%s', async (flow) => {
        const db = await createTestDb(provider);
        try {
            const schema = await compile(MODEL, provider);
            if (flow === 'push') {
                await runDbPush(db, undefined, schema);
            } else {
                await runMigrateDev(db, undefined, schema);
            }

            const intro = await db.introspect();
            expect(columnNames(intro, 'Widget')).toContain('code');

            // native types map to the concrete column types
            const expected = EXPECTED[provider];
            if (expected) {
                for (const [column, type] of Object.entries(expected)) {
                    expect(columnType(intro, 'Widget', column)).toBe(type);
                }
            }
        } finally {
            await db.cleanup();
        }
    });
});
