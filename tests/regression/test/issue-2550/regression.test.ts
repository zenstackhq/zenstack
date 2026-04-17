import type { JsonValue } from '@zenstackhq/orm';
import { createSchemaFactory } from '@zenstackhq/zod';
import { describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { schema } from './schema';
import { createTestClient } from '@zenstackhq/testtools';

// https://github.com/zenstackhq/zenstack/issues/2550

const factory = createSchemaFactory(schema);

describe('Regression for issue #2550', () => {
    it('matches ORM signature', async () => {
        const db = await createTestClient(schema);
        const _schema = factory.makeModelSchema('Test');
        const _result = await db.test.findFirstOrThrow();
        expectTypeOf<typeof _result>().toExtend<z.infer<typeof _schema>>();
    });

    it('makeModelSchema Json field type accepts JsonValue (including readonly arrays)', () => {
        const _schema = factory.makeModelSchema('Test');
        type Test = z.infer<typeof _schema>;

        // `metaData` is `Json` with a default in the schema. Assigning a `JsonValue`
        // returned by the ORM (which includes readonly arrays) to the inferred type
        // must compile without error.
        // Before the fix this failed because `readonly T[]` is not assignable to `T[]`.
        expectTypeOf<JsonValue>().toExtend<NonNullable<Test['metaData']>>();
    });

    it('makeModelSchema with optionality:defaults Json field type accepts JsonValue', () => {
        const _schema = factory.makeModelSchema('Test', { optionality: 'defaults' });
        type TestCreate = z.infer<typeof _schema>;

        expectTypeOf<JsonValue>().toExtend<NonNullable<TestCreate['metaData']>>();
    });

    it('makeModelSchema with optionality:all Json field type accepts JsonValue', () => {
        const _schema = factory.makeModelSchema('Test', { optionality: 'all' });
        type TestUpdate = z.infer<typeof _schema>;

        expectTypeOf<JsonValue>().toExtend<NonNullable<TestUpdate['metaData']>>();
    });
});
