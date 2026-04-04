import { AnyNull, DbNull, JsonNull } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { describe, it, expect } from 'vitest';
import { schema } from './schema';

// https://github.com/zenstackhq/zenstack/issues/2411
// TypeScript errors with nullable custom JSON types when using DbNull/JsonNull/AnyNull

describe('Regression for issue #2411', () => {
    it('should accept DbNull/JsonNull/AnyNull for nullable typed JSON fields in create/update/find', async () => {
        const db = await createTestClient(schema);
        const metadata = { someInt: 1, someString: 'test' };

        /* --------------------------------- CREATE --------------------------------- */

        // metadata (non nullable) - these should cause TS errors
        // @ts-expect-error - should not be able to set a null value to the non nullable field
        await expect(db.foo.create({ data: { metadata: DbNull } })).rejects.toThrow();
        // @ts-expect-error - should not be able to set a null value to the non nullable field
        await expect(db.foo.create({ data: { metadata: JsonNull } })).rejects.toThrow();
        // @ts-expect-error - should not be able to set a null value to the non nullable field
        await expect(db.foo.create({ data: { metadata: AnyNull } })).rejects.toThrow();
        // @ts-expect-error - should not be able to set a null value to the non nullable field
        await expect(db.foo.create({ data: { metadata: null } })).rejects.toThrow();

        await db.foo.create({ data: { metadata } }); // ✅ No typescript error

        // optionalMetadata (nullable) - DbNull/JsonNull should NOT cause TS errors
        await db.foo.create({ data: { metadata, optionalMetadata: DbNull } });
        await db.foo.create({ data: { metadata, optionalMetadata: JsonNull } });
        // @ts-expect-error - AnyNull is not accepted for typed JSON fields (TS + runtime rejection)
        await expect(db.foo.create({ data: { metadata, optionalMetadata: AnyNull } })).rejects.toThrow();
        await db.foo.create({ data: { metadata, optionalMetadata: null } }); // ✅ No typescript error

        /* --------------------------------- UPDATE --------------------------------- */

        const firstFoo = await db.foo.findFirst();
        expect(firstFoo).not.toBeNull();
        const where = { id: firstFoo!.id };

        // metadata (non nullable) - these should cause TS errors
        // @ts-expect-error - should not be able to set a null value to the non nullable field
        await expect(db.foo.update({ where, data: { metadata: DbNull } })).rejects.toThrow();
        // @ts-expect-error - should not be able to set a null value to the non nullable field
        await expect(db.foo.update({ where, data: { metadata: JsonNull } })).rejects.toThrow();
        // @ts-expect-error - should not be able to set a null value to the non nullable field
        await expect(db.foo.update({ where, data: { metadata: AnyNull } })).rejects.toThrow();
        // @ts-expect-error - should not be able to set a null value to the non nullable field
        await expect(db.foo.update({ where, data: { metadata: null } })).rejects.toThrow();

        await db.foo.update({ where, data: { metadata } }); // ✅ No typescript error

        // optionalMetadata (nullable) - DbNull/JsonNull should NOT cause TS errors
        await db.foo.update({ where, data: { metadata, optionalMetadata: DbNull } });
        await db.foo.update({ where, data: { metadata, optionalMetadata: JsonNull } });
        // @ts-expect-error - AnyNull is not accepted for typed JSON fields (TS + runtime rejection)
        await expect(db.foo.update({ where, data: { metadata, optionalMetadata: AnyNull } })).rejects.toThrow();
        await db.foo.update({ where, data: { metadata, optionalMetadata: null } }); // ✅ No typescript error

        /* ---------------------------------- FIND ---------------------------------- */

        // metadata (non nullable) - these should cause TS errors
        // @ts-expect-error - should not be able to filter by DbNull on a non nullable field
        void db.foo.findMany({ where: { metadata: DbNull } });
        // @ts-expect-error - should not be able to filter by JsonNull on a non nullable field
        void db.foo.findMany({ where: { metadata: JsonNull } });
        // @ts-expect-error - should not be able to filter by AnyNull on a non nullable field
        void db.foo.findMany({ where: { metadata: AnyNull } });
        // @ts-expect-error - should not be able to filter by null on a non nullable field
        void db.foo.findMany({ where: { metadata: null } });

        // optionalMetadata (nullable) - these should NOT cause TS errors
        await db.foo.findMany({ where: { optionalMetadata: DbNull } });
        await db.foo.findMany({ where: { optionalMetadata: JsonNull } });
        await db.foo.findMany({ where: { optionalMetadata: AnyNull } });
        await db.foo.findMany({ where: { optionalMetadata: null } }); // ✅ No typescript error
    });
});
