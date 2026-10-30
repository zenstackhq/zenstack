import { describe, expect, it } from 'vitest';
import {
    columnType,
    compile,
    createTestDb,
    currentProvider,
    runDbPush,
    runMigrateDev,
    type Provider,
} from './support/harness';

const provider: Provider = currentProvider();

const MODEL = `
model User {
    id      Int      @id @default(autoincrement())
    email   Email
    age     Age      @default(18)
    profile Profile  @json
}

type Email with String {
    this String
}

type Age with Int {
    this Int
}

type Profile {
    bio String
}
`;

// The concrete column types the database reports for each provider (Kysely introspection).
const EXPECTED: Partial<Record<Provider, Record<string, string>>> = {
    sqlite: { email: 'TEXT', age: 'INTEGER', profile: 'jsonb' },
    postgresql: { email: 'text', age: 'int4', profile: 'jsonb' },
};

describe(`primitive custom types (${provider})`, () => {
    it.each(['push', 'dev'] as const)('%s stores them as their base type', async (flow) => {
        const db = await createTestDb(provider);
        try {
            const schema = await compile(MODEL, provider);
            if (flow === 'push') {
                await runDbPush(db, undefined, schema);
            } else {
                await runMigrateDev(db, undefined, schema);
            }

            const intro = await db.introspect();
            const expected = EXPECTED[provider];
            if (expected) {
                for (const [column, type] of Object.entries(expected)) {
                    expect(columnType(intro, 'User', column)).toBe(type);
                }
            } else {
                // primitive custom types must not fall back to typed-JSON storage
                expect(columnType(intro, 'User', 'email')).not.toBe(columnType(intro, 'User', 'profile'));
                expect(columnType(intro, 'User', 'age')).not.toBe(columnType(intro, 'User', 'profile'));
            }
        } finally {
            await db.cleanup();
        }
    });
});
