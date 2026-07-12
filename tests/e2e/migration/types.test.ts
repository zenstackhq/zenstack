import { describe, expect, it } from 'vitest';
import { compile, createTestDb, currentProvider, type Provider, runMigrateDev } from './support/harness';

const ID = 'id Int @id @default(autoincrement())';
const provider: Provider = currentProvider();

/**
 * Validates that the generated `migration.ts` type-checks inside a real scaffolded npm
 * project — i.e. the emitted Kysely DDL builder chains are valid TypeScript.
 */
describe(`generated migration types (${provider})`, () => {
    it('scaffolds a project whose migration files type-check', async () => {
        const db = await createTestDb(provider);
        try {
            // v1 -> v2 removes a relation, which emits `sql` + a table rebuild on SQLite —
            // exercising the migration.ts import/codegen paths in the type check.
            const v1 = await compile(
                `model User { ${ID}  posts Post[] }  model Post { ${ID}  author User @relation(fields: [authorId], references: [id])  authorId Int }`,
                provider,
            );
            const v2 = await compile(`model User { ${ID} }  model Post { ${ID}  title String }`, provider);
            await runMigrateDev(db, v1, v2);

            // the generated migration.ts resolves its types (Kysely API used correctly)
            expect(() => db.typecheck()).not.toThrow();
        } finally {
            await db.cleanup();
        }
    }, 120_000);
});
