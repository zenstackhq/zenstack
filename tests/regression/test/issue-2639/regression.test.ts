import { createTestClient } from '@zenstackhq/testtools';
import { createSchemaFactory } from '@zenstackhq/zod';
import { describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { schema } from './schema';

// https://github.com/zenstackhq/zenstack/issues/2639
//
// The user reported that the type inferred from `factory.makeModelSchema('Test')`
// was not assignable to the ORM-inferred model type because the zod-inferred
// `metaData` field included `null` while the ORM `JsonValue` did not.

const factory = createSchemaFactory(schema);

describe('Regression for issue #2639', () => {
    it('zod-inferred model type is assignable to the ORM model type', async () => {
        const db = await createTestClient(schema);
        const _schema = factory.makeModelSchema('Test');
        type ZodTest = z.infer<typeof _schema>;
        type OrmTest = Awaited<ReturnType<typeof db.test.findFirstOrThrow>>;

        // Mirrors the user's reproduction:
        //   function testFunction(test: OrmTest) {}
        //   testFunction({} as ZodTest)
        expectTypeOf<ZodTest>().toExtend<OrmTest>();
    });

    it('zod-inferred metaData allows null and is assignable to the ORM metaData', async () => {
        const db = await createTestClient(schema);
        const _schema = factory.makeModelSchema('Test');
        type ZodTest = z.infer<typeof _schema>;
        type OrmTest = Awaited<ReturnType<typeof db.test.findFirstOrThrow>>;

        expectTypeOf<null>().toExtend<ZodTest['metaData']>();
        expectTypeOf<null>().toExtend<OrmTest['metaData']>();
        expectTypeOf<ZodTest['metaData']>().toExtend<OrmTest['metaData']>();
    });
});
