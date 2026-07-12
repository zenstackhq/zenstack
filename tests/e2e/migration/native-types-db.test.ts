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

// The provider is selected by `TEST_DB_PROVIDER` (default `sqlite`).
const provider: Provider = currentProvider();

// A model exercising Prisma-style native database types.
const NATIVE = `
model Widget {
    id        Int      @id @default(autoincrement())
    code      String   @db.VarChar(64)
    uid       String   @db.Uuid
    price     Decimal  @db.Decimal(10, 2)
    qty       Int      @db.SmallInt
    createdAt DateTime @db.Timestamptz
}
`;

// Expected introspected column types on Postgres (Kysely reports pg type names).
const PG_TYPES: Record<string, string> = {
    code: 'varchar',
    uid: 'uuid',
    price: 'numeric',
    qty: 'int2',
    createdAt: 'timestamptz',
};

describe(`native @db.* types applied via CLI flows (${provider})`, () => {
    it.each(['push', 'dev'] as const)('%s', async (flow) => {
        const db = await createTestDb(provider);
        try {
            const schema = await compile(NATIVE, provider);
            if (flow === 'push') {
                await runDbPush(db, undefined, schema);
            } else {
                await runMigrateDev(db, undefined, schema);
            }

            const intro = await db.introspect();
            expect(columnNames(intro, 'Widget')).toEqual(['code', 'createdAt', 'id', 'price', 'qty', 'uid']);

            if (provider === 'postgresql') {
                // native types map to the concrete Postgres column types
                for (const [column, expected] of Object.entries(PG_TYPES)) {
                    expect(columnType(intro, 'Widget', column)).toBe(expected);
                }
            }
            // on SQLite native types are advisory (dynamic typing) — applying without error
            // and creating the columns is the contract.
        } finally {
            await db.cleanup();
        }
    });
});
