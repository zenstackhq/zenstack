import { type SchemaDef } from '@zenstackhq/schema';
import { describe, it } from 'vitest';

// Import raw WhereInput from source (pre-$is)
// We'll manually construct the old WhereInput to compare behavior

// Testing with basic schema
import { schema } from './orm/schemas/basic';
import { type WhereInput as CurrentWhereInput } from '@zenstackhq/orm';

// Direct test of current WhereInput:
declare const w1: CurrentWhereInput<typeof schema, 'User'>;
// @ts-expect-error notExistsColumn should not be valid on direct assignment  
const w2: CurrentWhereInput<typeof schema, 'User'> = {
    email: 'test',
    notExistsColumn: 1,  // should error
};

// Test through a simple findMany-like call pattern:
// Does `T extends WhereInput` capture excess props?
declare function whereTest<T extends CurrentWhereInput<typeof schema, 'User'>>(w: T): void;
whereTest({
    email: 'test',
    notExistsColumn: 1,  // Does this error with T extends WhereInput?
});
