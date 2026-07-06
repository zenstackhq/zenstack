import { createTestClient } from '@zenstackhq/testtools';
import { createSchemaFactory } from '@zenstackhq/zod';
import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { schema } from './schema';

// https://github.com/zenstackhq/zenstack/issues/2647

const factory = createSchemaFactory(schema);

describe('Regression for issue #2647', () => {
    it('ORM-inferred type for a required Json field allows null', async () => {
        const db = await createTestClient(schema);
        type Test = Awaited<ReturnType<typeof db.test.findFirstOrThrow>>;

        // A required Json column can still hold a JSON `null`, so the inferred
        // model type for the field must include `null`.
        expectTypeOf<null>().toExtend<Test['metaData']>();
    });

    it('zod-inferred type for a required Json field allows null', () => {
        const _schema = factory.makeModelSchema('Test');
        type Test = z.infer<typeof _schema>;

        expectTypeOf<null>().toExtend<Test['metaData']>();
    });

    it('zod schema for a required Json field parses null at runtime', () => {
        const _schema = factory.makeModelSchema('Test');
        const result = _schema.safeParse({ id: 'test', metaData: null });
        expect(result.success).toBe(true);
    });
});
