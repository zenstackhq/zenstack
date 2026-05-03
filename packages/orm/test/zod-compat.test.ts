import { describe, expectTypeOf, it } from 'vitest';
import { createSchemaFactory } from '@zenstackhq/zod';
import type { User as ModelUser } from './schema/models';
import { schema } from './schema/schema';
import z from 'zod';

const factory = createSchemaFactory(schema);

describe('Zod ↔ ORM type compatibility', () => {
    it('infers zod type compatible with ORM model type (except optionality)', () => {
        // ORM model results use `T | null` for optional fields; the Zod schema
        // uses `T | null | undefined` to also accept missing fields in input
        // objects. The useful property is that any ORM model value is valid
        // input for the Zod schema.
        const userSchema = factory.makeModelSchema('User');
        type ZodUser = z.infer<typeof userSchema>;
        expectTypeOf<ModelUser>().toExtend<ZodUser>();

        // or with required
        const _userSchemaRequired = userSchema.required();
        type ZodUserRequired = z.infer<typeof _userSchemaRequired>;
        expectTypeOf<ZodUserRequired>().toMatchTypeOf<ModelUser>();
    });
});
