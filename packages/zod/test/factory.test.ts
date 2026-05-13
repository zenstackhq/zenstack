import Decimal from 'decimal.js';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createSchemaFactory } from '../src/index';
import { schema } from './schema/schema';
import z from 'zod';
import type { JsonValue } from '../src/index';

const factory = createSchemaFactory(schema);

// A fully valid User object (without relations)
const validUser = {
    id: 'user123',
    email: 'test@example.com',
    username: 'johndoe',
    website: null,
    code: 'USR001',
    age: 25,
    score: 50.0,
    bigNum: BigInt(100),
    balance: 10.0,
    active: true,
    birthdate: null,
    avatar: null,
    metadata: null,
    status: 'ACTIVE',
    address: null,
};

// A fully valid Post object (without relations)
const validPost = {
    id: 'post123',
    title: 'My First Post',
    published: true,
    authorId: null,
    tags: ['announcement', 'update'],
};

describe('SchemaFactory - makeModelSchema', () => {
    describe('scalar field types', () => {
        it('infers correct field types for User', () => {
            const _userSchema = factory.makeModelSchema('User');
            type User = z.infer<typeof _userSchema>;

            // required string fields
            expectTypeOf<User['id']>().toEqualTypeOf<string>();
            expectTypeOf<User['email']>().toEqualTypeOf<string>();
            expectTypeOf<User['username']>().toEqualTypeOf<string>();
            expectTypeOf<User['code']>().toEqualTypeOf<string>();
            // optional string field (nullable + optional)
            expectTypeOf<User['website']>().toEqualTypeOf<string | null | undefined>();

            // number fields (Int and Float both map to ZodNumber)
            expectTypeOf<User['age']>().toEqualTypeOf<number>();
            expectTypeOf<User['score']>().toEqualTypeOf<number>();

            // bigint
            expectTypeOf<User['bigNum']>().toEqualTypeOf<bigint>();

            // Decimal maps to ZodCustom<Decimal>
            expectTypeOf<User['balance']>().toEqualTypeOf<Decimal>();

            // boolean
            expectTypeOf<User['active']>().toEqualTypeOf<boolean>();

            // DateTime
            expectTypeOf<User['birthdate']>().toEqualTypeOf<Date | null | undefined>();

            // optional Bytes
            expectTypeOf<User['avatar']>().toEqualTypeOf<Uint8Array | null | undefined>();

            // optional Json
            expectTypeOf<User>().toHaveProperty('metadata');
            expectTypeOf<User['metadata']>().toEqualTypeOf<JsonValue | null | undefined>();

            // required enum
            expectTypeOf<User['status']>().toEqualTypeOf<'ACTIVE' | 'INACTIVE' | 'PENDING'>();

            // optional typedef (Address): { street, city, zip? } | null | undefined
            type Address = Exclude<User['address'], null | undefined>;
            expectTypeOf<Address['street']>().toEqualTypeOf<string>();
            expectTypeOf<Address['city']>().toEqualTypeOf<string>();
            expectTypeOf<Address['zip']>().toEqualTypeOf<string | null | undefined>();
            expectTypeOf<User['address']>().toEqualTypeOf<Address | null | undefined>();

            // relation fields are NOT present by default — use include/select to opt in
            expectTypeOf<User>().not.toHaveProperty('posts');
        });

        it('infers correct field types for Post', () => {
            const _postSchema = factory.makeModelSchema('Post');
            type Post = z.infer<typeof _postSchema>;

            // required string fields
            expectTypeOf<Post['id']>().toEqualTypeOf<string>();
            expectTypeOf<Post['title']>().toEqualTypeOf<string>();

            // required boolean
            expectTypeOf<Post['published']>().toEqualTypeOf<boolean>();

            // optional scalar (foreign key)
            expectTypeOf<Post['authorId']>().toEqualTypeOf<string | null | undefined>();

            // scalar array
            expectTypeOf<Post['tags']>().toEqualTypeOf<string[]>();

            const _createPostSchema = factory.makeModelCreateSchema('Post');
            type PostCreate = z.infer<typeof _createPostSchema>;

            expectTypeOf<PostCreate['tags']>().toEqualTypeOf<string[]>();

            const _updatePostSchema = factory.makeModelUpdateSchema('Post');
            type PostUpdate = z.infer<typeof _updatePostSchema>;

            expectTypeOf<PostUpdate['tags']>().toEqualTypeOf<string[] | undefined>();

            // relation fields are NOT present by default — use include/select to opt in
            expectTypeOf<Post>().not.toHaveProperty('author');
        });

        it('accepts a fully valid User (no relation fields)', () => {
            const userSchema = factory.makeModelSchema('User');
            expect(userSchema.safeParse(validUser).success).toBe(true);
        });

        it('rejects relation fields in default schema (strict object)', () => {
            const userSchema = factory.makeModelSchema('User');
            // relation fields are not part of the default schema, so they are rejected
            const result = userSchema.safeParse({ ...validUser, posts: [] });
            expect(result.success).toBe(false);
        });

        it('accepts a fully valid Post', () => {
            const postSchema = factory.makeModelSchema('Post');
            expect(postSchema.safeParse(validPost).success).toBe(true);
        });

        it('rejects extra fields (strict object)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, unknownField: 'value' });
            expect(result.success).toBe(false);
        });

        it('accepts DateTime as a Date object', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, birthdate: new Date() });
            expect(result.success).toBe(true);
        });

        it('accepts DateTime as an ISO datetime string', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                birthdate: '2024-01-15T10:30:00.000Z',
            });
            expect(result.success).toBe(true);
        });

        it('accepts Bytes as Uint8Array', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                avatar: new Uint8Array([1, 2, 3]),
            });
            expect(result.success).toBe(true);
        });

        it('accepts BigInt values', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, bigNum: BigInt(999) });
            expect(result.success).toBe(true);
        });

        it('accepts Decimal as a number', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, balance: 42.5 });
            expect(result.success).toBe(true);
        });

        it('accepts Decimal as a numeric string', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, balance: '42.5' });
            expect(result.success).toBe(true);
        });

        it('accepts Decimal as a Decimal instance', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, balance: new Decimal('42.5') });
            expect(result.success).toBe(true);
        });

        it('accepts Json values', () => {
            const userSchema = factory.makeModelSchema('User');
            expect(userSchema.safeParse({ ...validUser, metadata: { key: 'value' } }).success).toBe(true);
            expect(userSchema.safeParse({ ...validUser, metadata: [1, 2, 3] }).success).toBe(true);
            expect(userSchema.safeParse({ ...validUser, metadata: 42 }).success).toBe(true);
            expect(userSchema.safeParse({ ...validUser, metadata: null }).success).toBe(true);
        });

        it('rejects invalid Json values', () => {
            const userSchema = factory.makeModelSchema('User');
            // BigInt is not a JSON primitive
            expect(userSchema.safeParse({ ...validUser, metadata: BigInt(1) }).success).toBe(false);
            // Symbol is not a JSON value
            expect(userSchema.safeParse({ ...validUser, metadata: Symbol('s') }).success).toBe(false);
            // Functions are not JSON values
            expect(userSchema.safeParse({ ...validUser, metadata: () => {} }).success).toBe(false);
            // Nested non-JSON values are also rejected
            expect(userSchema.safeParse({ ...validUser, metadata: { key: BigInt(1) } }).success).toBe(false);
            expect(userSchema.safeParse({ ...validUser, metadata: [BigInt(1)] }).success).toBe(false);
        });
    });

    describe('string validation attributes', () => {
        it('rejects invalid email for @email field', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, email: 'not-an-email' });
            expect(result.success).toBe(false);
        });

        it('accepts valid email for @email field', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, email: 'valid@domain.com' });
            expect(result.success).toBe(true);
        });

        it('rejects username too short for @length(3, 50)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, username: 'ab' });
            expect(result.success).toBe(false);
        });

        it('rejects username too long for @length(3, 50)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, username: 'a'.repeat(51) });
            expect(result.success).toBe(false);
        });

        it('accepts username within @length bounds', () => {
            const userSchema = factory.makeModelSchema('User');
            expect(userSchema.safeParse({ ...validUser, username: 'abc' }).success).toBe(true);
            expect(userSchema.safeParse({ ...validUser, username: 'a'.repeat(50) }).success).toBe(true);
        });

        it('rejects invalid URL for @url field', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, website: 'not-a-url' });
            expect(result.success).toBe(false);
        });

        it('accepts valid URL for @url field', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, website: 'https://example.com' });
            expect(result.success).toBe(true);
        });

        it('accepts null for optional @url field', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, website: null });
            expect(result.success).toBe(true);
        });

        it('rejects code that does not start with "USR" for @startsWith', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, code: 'ABC001' });
            expect(result.success).toBe(false);
        });

        it('accepts code starting with "USR" for @startsWith', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, code: 'USR_ANYTHING' });
            expect(result.success).toBe(true);
        });
    });

    describe('number validation attributes', () => {
        it('rejects age = 0 for @gt(0)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, age: 0 });
            expect(result.success).toBe(false);
        });

        it('rejects age = 151 for @lte(150)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, age: 151 });
            expect(result.success).toBe(false);
        });

        it('accepts age within @gt(0) and @lte(150) bounds', () => {
            const userSchema = factory.makeModelSchema('User');
            // Note: @@validate(age >= 18) also applies, so the minimum valid age is 18
            expect(userSchema.safeParse({ ...validUser, age: 18 }).success).toBe(true);
            expect(userSchema.safeParse({ ...validUser, age: 150 }).success).toBe(true);
        });

        it('rejects score < 0 for @gte(0)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, score: -0.1 });
            expect(result.success).toBe(false);
        });

        it('rejects score = 100 for @lt(100)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, score: 100.0 });
            expect(result.success).toBe(false);
        });

        it('accepts score within @gte(0) and @lt(100) bounds', () => {
            const userSchema = factory.makeModelSchema('User');
            expect(userSchema.safeParse({ ...validUser, score: 0 }).success).toBe(true);
            expect(userSchema.safeParse({ ...validUser, score: 99.9 }).success).toBe(true);
        });
    });

    describe('bigint validation attributes', () => {
        it('rejects bigNum < 0 for @gte(0)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, bigNum: BigInt(-1) });
            expect(result.success).toBe(false);
        });

        it('accepts bigNum = 0 for @gte(0)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, bigNum: BigInt(0) });
            expect(result.success).toBe(true);
        });
    });

    describe('decimal validation attributes', () => {
        it('rejects balance = 0 (number) for @gt(0)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, balance: 0 });
            expect(result.success).toBe(false);
        });

        it('rejects balance = "0.0" (string) for @gt(0)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, balance: '0.0' });
            expect(result.success).toBe(false);
        });

        it('rejects balance = Decimal("0") for @gt(0)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, balance: new Decimal('0') });
            expect(result.success).toBe(false);
        });

        it('accepts balance = 0.01 (number) for @gt(0)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, balance: 0.01 });
            expect(result.success).toBe(true);
        });
    });

    describe('enum fields', () => {
        it('accepts valid enum values', () => {
            const userSchema = factory.makeModelSchema('User');
            expect(userSchema.safeParse({ ...validUser, status: 'ACTIVE' }).success).toBe(true);
            expect(userSchema.safeParse({ ...validUser, status: 'INACTIVE' }).success).toBe(true);
            expect(userSchema.safeParse({ ...validUser, status: 'PENDING' }).success).toBe(true);
        });

        it('rejects invalid enum value', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, status: 'ADMIN' });
            expect(result.success).toBe(false);
        });
    });

    describe('typedef (embedded type) fields', () => {
        it('accepts null for optional typedef field', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, address: null });
            expect(result.success).toBe(true);
        });

        it('accepts valid Address object', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                address: { residents: [], street: '123 Main St', city: 'Springfield', zip: null },
            });
            expect(result.success).toBe(true);
        });

        it('accepts Address with optional zip present', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                address: { residents: [], street: '123 Main St', city: 'Springfield', zip: '12345' },
            });
            expect(result.success).toBe(true);
        });

        it('rejects Address with extra fields (strict object)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                address: { residents: [], street: '123 Main St', city: 'Springfield', zip: null, extra: 'field' },
            });
            expect(result.success).toBe(false);
        });

        it('rejects Address missing required fields', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                address: { residents: [], street: '123 Main St' },
            });
            expect(result.success).toBe(false);
        });
    });

    describe('@@validate custom validation', () => {
        it('fails when @@validate condition is false (age < 18 passes field but fails model validation)', () => {
            const userSchema = factory.makeModelSchema('User');
            // age: 16 passes @gt(0) and @lte(150) but fails @@validate(age >= 18)
            const result = userSchema.safeParse({ ...validUser, age: 16 });
            expect(result.success).toBe(false);
        });

        it('@@validate error contains the configured message', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, age: 16 });
            expect(result.success).toBe(false);
            if (!result.success) {
                const messages = result.error.issues.map((i) => i.message);
                expect(messages).toContain('Must be adult');
            }
        });

        it('@@validate error uses the configured path', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, age: 16 });
            expect(result.success).toBe(false);
            if (!result.success) {
                const paths = result.error.issues.map((i) => i.path);
                expect(paths).toContainEqual(['age']);
            }
        });

        it('passes when @@validate condition is satisfied', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({ ...validUser, age: 18 });
            expect(result.success).toBe(true);
        });
    });

    describe('error handling', () => {
        it('throws when model is not found', () => {
            expect(() => factory.makeModelSchema('Unknown' as any)).toThrow('Model "Unknown" not found in schema');
        });
    });
});

describe('SchemaFactory - makeTypeSchema', () => {
    it('generates schema for Address typedef', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        expect(
            addressSchema.safeParse({ residents: [], street: '123 Main', city: 'Springfield', zip: null }).success,
        ).toBe(true);
    });

    it('rejects Address with missing required field', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        const result = addressSchema.safeParse({ residents: [], street: '123 Main' });
        expect(result.success).toBe(false);
    });

    it('rejects Address with extra fields (strict object)', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        const result = addressSchema.safeParse({
            residents: [],
            street: '123 Main',
            city: 'Springfield',
            zip: null,
            extra: 'field',
        });
        expect(result.success).toBe(false);
    });

    it('accepts Address with optional zip as null', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        expect(
            addressSchema.safeParse({ residents: [], street: '123 Main', city: 'Springfield', zip: null }).success,
        ).toBe(true);
    });

    it('accepts Address with optional zip as a string', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        expect(
            addressSchema.safeParse({ residents: [], street: '123 Main', city: 'Springfield', zip: '12345' }).success,
        ).toBe(true);
    });

    describe('extra validations', () => {
        it('passes when zip is null', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            expect(
                addressSchema.safeParse({ residents: [], street: '123 Main', city: 'Springfield', zip: null }).success,
            ).toBe(true);
        });

        it('passes when zip is omitted', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            expect(addressSchema.safeParse({ residents: [], street: '123 Main', city: 'Springfield' }).success).toBe(
                true,
            );
        });

        it('passes when zip is exactly 5 characters', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            expect(
                addressSchema.safeParse({ residents: [], street: '123 Main', city: 'Springfield', zip: '90210' })
                    .success,
            ).toBe(true);
        });

        it('fails when zip is fewer than 5 characters', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({
                residents: [],
                street: '123 Main',
                city: 'Springfield',
                zip: '123',
            });
            expect(result.success).toBe(false);
        });

        it('fails when zip is more than 5 characters', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({
                residents: [],
                street: '123 Main',
                city: 'Springfield',
                zip: '123456',
            });
            expect(result.success).toBe(false);
        });

        it('error message matches the configured message', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({
                residents: [],
                street: '123 Main',
                city: 'Springfield',
                zip: '123',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.map((i) => i.message)).toContain('Zip code must be exactly 5 characters');
            }
        });

        it('error path points to the zip field', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({
                residents: [],
                street: '123 Main',
                city: 'Springfield',
                zip: '123',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.map((i) => i.path)).toContainEqual(['zip']);
            }
        });

        it('fails when city is too short', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({ residents: [], street: '123 Main', city: '', zip: '12345' });
            expect(result.success).toBe(false);
        });

        it('also validates when Address is embedded in User', () => {
            const userSchema = factory.makeModelSchema('User');
            const validUser = {
                id: 'u1',
                email: 'a@b.com',
                username: 'alice',
                website: null,
                code: 'USR01',
                age: 20,
                score: 50,
                bigNum: BigInt(0),
                balance: 1,
                active: true,
                birthdate: null,
                avatar: null,
                metadata: null,
                status: 'ACTIVE',
                address: { residents: [], street: '123 Main', city: 'Springfield', zip: '90210' },
            };
            expect(userSchema.safeParse(validUser).success).toBe(true);
            expect(
                userSchema.safeParse({
                    ...validUser,
                    address: { residents: ['Alice'], street: '123 Main', city: 'Springfield', zip: '123' },
                }).success,
            ).toBe(false);
        });
    });
});

describe('SchemaFactory - @meta description', () => {
    it('applies @@meta description to model schema', () => {
        const userSchema = factory.makeModelSchema('User');
        expect(userSchema.meta()?.description).toBe('A user of the system');
    });

    it('applies @meta description to model field schema', () => {
        const userSchema = factory.makeModelSchema('User');
        expect(userSchema.shape.email.meta()?.description).toBe("The user's email address");
    });

    it('does not set description when @meta("description") is absent', () => {
        const userSchema = factory.makeModelSchema('User');
        expect(userSchema.shape.active.meta()?.description).toBeUndefined();
    });

    it('applies @@meta description to model create schema', () => {
        const createSchema = factory.makeModelCreateSchema('User');
        expect(createSchema.meta()?.description).toBe('A user of the system');
    });

    it('applies @meta description to model create field schema', () => {
        const createSchema = factory.makeModelCreateSchema('User');
        expect(createSchema.shape.email.meta()?.description).toBe("The user's email address");
    });

    it('applies @@meta description to model update schema', () => {
        const updateSchema = factory.makeModelUpdateSchema('User');
        expect(updateSchema.meta()?.description).toBe('A user of the system');
    });

    it('applies @meta description to model update field schema', () => {
        const updateSchema = factory.makeModelUpdateSchema('User');
        expect(updateSchema.shape.email.meta()?.description).toBe("The user's email address");
    });

    it('applies @@meta description to typedef schema', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        expect(addressSchema.meta()?.description).toBe('A mailing address');
    });

    it('applies @meta description to typedef field schema', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        expect(addressSchema.shape.street.meta()?.description).toBe('Street address line');
    });

    it('applies @@meta description to enum schema', () => {
        const statusSchema = factory.makeEnumSchema('Status');
        expect(statusSchema.meta()?.description).toBe('User account status');
    });

    it('does not set description for model without @@meta("description")', () => {
        const postSchema = factory.makeModelSchema('Post');
        expect(postSchema.meta()?.description).toBeUndefined();
    });
});

describe('SchemaFactory - makeEnumSchema', () => {
    it('accepts all valid enum values', () => {
        const statusSchema = factory.makeEnumSchema('Status');
        expect(statusSchema.safeParse('ACTIVE').success).toBe(true);
        expect(statusSchema.safeParse('INACTIVE').success).toBe(true);
        expect(statusSchema.safeParse('PENDING').success).toBe(true);
    });

    it('rejects values not in the enum', () => {
        const statusSchema = factory.makeEnumSchema('Status');
        expect(statusSchema.safeParse('ADMIN').success).toBe(false);
        expect(statusSchema.safeParse('active').success).toBe(false);
        expect(statusSchema.safeParse('').success).toBe(false);
        expect(statusSchema.safeParse(null).success).toBe(false);
        expect(statusSchema.safeParse(42).success).toBe(false);
    });

    it('infers enum value union type', () => {
        const _statusSchema = factory.makeEnumSchema('Status');
        type Status = z.infer<typeof _statusSchema>;
        expectTypeOf<Status>().toEqualTypeOf<'ACTIVE' | 'INACTIVE' | 'PENDING'>();
    });

    it('throws when enum is not found', () => {
        expect(() => factory.makeEnumSchema('Unknown' as any)).toThrow();
    });
});

// --- Computed fields tests ---

const validProduct = {
    id: 'prod1',
    name: 'Widget',
    price: 10.0,
    discount: 2.0,
    finalPrice: 8.0,
};

describe('SchemaFactory - computed fields', () => {
    describe('makeModelSchema includes computed fields', () => {
        it('accepts a Product with computed field present', () => {
            const productSchema = factory.makeModelSchema('Product');
            expect(productSchema.safeParse(validProduct).success).toBe(true);
        });

        it('rejects a Product missing the computed field', () => {
            const productSchema = factory.makeModelSchema('Product');
            const { finalPrice: _, ...withoutComputed } = validProduct;
            expect(productSchema.safeParse(withoutComputed).success).toBe(false);
        });

        it('infers computed field in model schema type', () => {
            const _schema = factory.makeModelSchema('Product');
            type Product = z.infer<typeof _schema>;
            expectTypeOf<Product['finalPrice']>().toEqualTypeOf<number>();
        });
    });

    describe('makeModelCreateSchema excludes computed fields', () => {
        it('accepts a Product without the computed field', () => {
            const createSchema = factory.makeModelCreateSchema('Product');
            expect(createSchema.safeParse({ name: 'Widget', price: 10.0 }).success).toBe(true);
        });

        it('rejects a Product with the computed field (strict)', () => {
            const createSchema = factory.makeModelCreateSchema('Product');
            expect(createSchema.safeParse({ name: 'Widget', price: 10.0, finalPrice: 8.0 }).success).toBe(false);
        });

        it('does not include computed field in create schema type', () => {
            const _schema = factory.makeModelCreateSchema('Product');
            type ProductCreate = z.infer<typeof _schema>;
            expectTypeOf<ProductCreate>().not.toHaveProperty('finalPrice');
            // own fields are present
            expectTypeOf<ProductCreate>().toHaveProperty('name');
            expectTypeOf<ProductCreate['name']>().toEqualTypeOf<string>();
            expectTypeOf<ProductCreate['price']>().toEqualTypeOf<number>();
            // field with default is optional
            expectTypeOf<ProductCreate>().toHaveProperty('discount');
        });
    });

    describe('makeModelUpdateSchema excludes computed fields', () => {
        it('accepts a Product update without the computed field', () => {
            const updateSchema = factory.makeModelUpdateSchema('Product');
            expect(updateSchema.safeParse({ price: 12.0 }).success).toBe(true);
        });

        it('rejects a Product update with the computed field (strict)', () => {
            const updateSchema = factory.makeModelUpdateSchema('Product');
            expect(updateSchema.safeParse({ price: 12.0, finalPrice: 10.0 }).success).toBe(false);
        });

        it('does not include computed field in update schema type', () => {
            const _schema = factory.makeModelUpdateSchema('Product');
            type ProductUpdate = z.infer<typeof _schema>;
            expectTypeOf<ProductUpdate>().not.toHaveProperty('finalPrice');
            // own fields are present (all optional in update)
            expectTypeOf<ProductUpdate>().toHaveProperty('name');
        });
    });
});

// --- Delegate model tests ---

const validVideo = {
    id: 1,
    createdAt: new Date(),
    assetType: 'Video',
    duration: 120,
    url: 'https://example.com/video.mp4',
};

const validImage = {
    id: 2,
    createdAt: new Date(),
    assetType: 'Image',
    format: 'png',
    width: 800,
};

describe('SchemaFactory - delegate models', () => {
    describe('makeModelSchema for delegate base model', () => {
        it('accepts a valid Asset', () => {
            const assetSchema = factory.makeModelSchema('Asset');
            expect(assetSchema.safeParse({ id: 1, createdAt: new Date(), assetType: 'Video' }).success).toBe(true);
        });

        it('includes discriminator field in model schema type', () => {
            const _schema = factory.makeModelSchema('Asset');
            type Asset = z.infer<typeof _schema>;
            expectTypeOf<Asset['assetType']>().toEqualTypeOf<string>();
            expectTypeOf<Asset['id']>().toEqualTypeOf<number>();
        });
    });

    describe('makeModelSchema for derived models', () => {
        it('accepts a valid Video (includes inherited + own fields)', () => {
            const videoSchema = factory.makeModelSchema('Video');
            expect(videoSchema.safeParse(validVideo).success).toBe(true);
        });

        it('accepts a valid Image (includes inherited + own fields)', () => {
            const imageSchema = factory.makeModelSchema('Image');
            expect(imageSchema.safeParse(validImage).success).toBe(true);
        });

        it('rejects Video missing own fields', () => {
            const videoSchema = factory.makeModelSchema('Video');
            const { duration: _, url: _u, ...withoutOwn } = validVideo;
            expect(videoSchema.safeParse(withoutOwn).success).toBe(false);
        });

        it('infers correct types for derived model including inherited fields', () => {
            const _schema = factory.makeModelSchema('Video');
            type Video = z.infer<typeof _schema>;
            // inherited fields
            expectTypeOf<Video['id']>().toEqualTypeOf<number>();
            expectTypeOf<Video['assetType']>().toEqualTypeOf<string>();
            // own fields
            expectTypeOf<Video['duration']>().toEqualTypeOf<number>();
            expectTypeOf<Video['url']>().toEqualTypeOf<string>();
        });
    });

    describe('makeModelCreateSchema excludes discriminator', () => {
        it('accepts Video create without discriminator and inherited fields', () => {
            const createSchema = factory.makeModelCreateSchema('Video');
            // Only own non-inherited, non-discriminator fields should be required
            expect(createSchema.safeParse({ duration: 120, url: 'https://example.com/video.mp4' }).success).toBe(true);
        });

        it('rejects Video create with discriminator field (strict)', () => {
            const createSchema = factory.makeModelCreateSchema('Video');
            expect(
                createSchema.safeParse({
                    duration: 120,
                    url: 'https://example.com/video.mp4',
                    assetType: 'Video',
                }).success,
            ).toBe(false);
        });

        it('does not include discriminator fields in create schema type', () => {
            const _schema = factory.makeModelCreateSchema('Video');
            type VideoCreate = z.infer<typeof _schema>;
            // discriminator and originModel fields should be excluded
            expectTypeOf<VideoCreate>().not.toHaveProperty('assetType');
            // own fields should be present
            expectTypeOf<VideoCreate>().toHaveProperty('duration');
            expectTypeOf<VideoCreate>().toHaveProperty('url');
            expectTypeOf<VideoCreate['duration']>().toEqualTypeOf<number>();
            expectTypeOf<VideoCreate['url']>().toEqualTypeOf<string>();
        });

        it('excludes discriminator from base delegate create schema', () => {
            const createSchema = factory.makeModelCreateSchema('Asset');
            // discriminator should not be included
            expect(createSchema.safeParse({ assetType: 'Video' }).success).toBe(false);
            // empty create (id has default, createdAt has default, assetType is discriminator)
            expect(createSchema.safeParse({}).success).toBe(true);
        });

        it('does not include discriminator in base delegate create schema type', () => {
            const _schema = factory.makeModelCreateSchema('Asset');
            type AssetCreate = z.infer<typeof _schema>;
            expectTypeOf<AssetCreate>().not.toHaveProperty('assetType');
        });
    });

    describe('makeModelUpdateSchema excludes discriminator and originModel fields', () => {
        it('accepts Video update with only own fields', () => {
            const updateSchema = factory.makeModelUpdateSchema('Video');
            expect(updateSchema.safeParse({ duration: 180 }).success).toBe(true);
        });

        it('rejects Video update with discriminator field (strict)', () => {
            const updateSchema = factory.makeModelUpdateSchema('Video');
            expect(updateSchema.safeParse({ duration: 180, assetType: 'Video' }).success).toBe(false);
        });

        it('does not include discriminator fields in update schema type', () => {
            const _schema = factory.makeModelUpdateSchema('Video');
            type VideoUpdate = z.infer<typeof _schema>;
            expectTypeOf<VideoUpdate>().not.toHaveProperty('assetType');
            // own fields should be present (all optional in update)
            expectTypeOf<VideoUpdate>().toHaveProperty('duration');
            expectTypeOf<VideoUpdate>().toHaveProperty('url');
        });

        it('does not include discriminator in base delegate update schema type', () => {
            const _schema = factory.makeModelUpdateSchema('Asset');
            type AssetUpdate = z.infer<typeof _schema>;
            expectTypeOf<AssetUpdate>().not.toHaveProperty('assetType');
        });
    });
});

// ---------------------------------------------------------------------------
// makeModelSchema — ORM-style options (omit / include / select)
// ---------------------------------------------------------------------------

// User without username (the omit use-case baseline)
const validUserNoUsername = (() => {
    const { username: _, ...rest } = validUser;
    return rest;
})();

describe('SchemaFactory - makeModelSchema with options', () => {
    // ── omit ────────────────────────────────────────────────────────────────
    describe('omit', () => {
        it('excludes the omitted scalar field at runtime', () => {
            const schema = factory.makeModelSchema('User', { omit: { username: true } });
            // validUserNoUsername has no username field — should pass
            expect(schema.safeParse(validUserNoUsername).success).toBe(true);
        });

        it('rejects when the omitted field is present (strict object)', () => {
            const schema = factory.makeModelSchema('User', { omit: { username: true } });
            // passing the full validUser (which has username) must fail because
            // the schema is strict and username is no longer a known key
            expect(schema.safeParse(validUser).success).toBe(false);
        });

        it('infers omitted field is absent from the output type', () => {
            const _schema = factory.makeModelSchema('User', { omit: { username: true } });
            type Result = z.infer<typeof _schema>;
            expectTypeOf<Result>().not.toHaveProperty('username');
        });

        it('keeps all other scalar fields when one is omitted', () => {
            const _schema = factory.makeModelSchema('User', { omit: { username: true } });
            type Result = z.infer<typeof _schema>;
            expectTypeOf<Result>().toHaveProperty('id');
            expectTypeOf<Result['id']>().toEqualTypeOf<string>();
            expectTypeOf<Result>().toHaveProperty('email');
            expectTypeOf<Result['email']>().toEqualTypeOf<string>();
        });

        it('omit: {} (empty) keeps all scalar fields', () => {
            const schema = factory.makeModelSchema('User', { omit: {} });
            expect(schema.safeParse(validUser).success).toBe(true);
        });

        it('can omit multiple fields', () => {
            const schema = factory.makeModelSchema('User', { omit: { username: true, avatar: true } });
            const { username: _u, avatar: _a, ...rest } = validUser;
            expect(schema.safeParse(rest).success).toBe(true);
        });

        it('infers multiple omitted fields absent', () => {
            const _schema = factory.makeModelSchema('User', { omit: { username: true, avatar: true } });
            type Result = z.infer<typeof _schema>;
            expectTypeOf<Result>().not.toHaveProperty('username');
            expectTypeOf<Result>().not.toHaveProperty('avatar');
            expectTypeOf<Result>().toHaveProperty('email');
        });
    });

    // ── include ─────────────────────────────────────────────────────────────
    describe('include', () => {
        it('adds the relation field alongside all scalars', () => {
            const schema = factory.makeModelSchema('User', { include: { posts: true } });
            // All scalar fields must still be present
            expect(schema.safeParse(validUser).success).toBe(true);
        });

        it('the included relation field is optional', () => {
            const schema = factory.makeModelSchema('User', { include: { posts: true } });
            // omitting posts should still pass
            expect(schema.safeParse(validUser).success).toBe(true);
        });

        it('infers included relation field in output type', () => {
            const _schema = factory.makeModelSchema('User', { include: { posts: true } });
            type Result = z.infer<typeof _schema>;
            expectTypeOf<Result>().toHaveProperty('posts');
            const _postSchema = factory.makeModelSchema('Post');
            type Post = z.infer<typeof _postSchema>;
            expectTypeOf<Result['posts']>().toEqualTypeOf<Post[] | undefined>();
        });

        it('infers scalar fields still present when using include', () => {
            const _schema = factory.makeModelSchema('User', { include: { posts: true } });
            type Result = z.infer<typeof _schema>;
            expectTypeOf<Result['id']>().toEqualTypeOf<string>();
            expectTypeOf<Result['email']>().toEqualTypeOf<string>();
            expectTypeOf<Result['username']>().toEqualTypeOf<string>();
        });

        it('include with nested select on relation', () => {
            const schema = factory.makeModelSchema('User', {
                include: { posts: { select: { title: true } } },
            });
            // posts with only title should pass
            expect(schema.safeParse({ ...validUser, posts: [{ title: 'Hello' }] }).success).toBe(true);
            // posts with extra field should fail (strict)
            expect(schema.safeParse({ ...validUser, posts: [{ title: 'Hello', published: true }] }).success).toBe(
                false,
            );
        });

        it('infers nested select shape on included relation', () => {
            const _schema = factory.makeModelSchema('User', {
                include: { posts: { select: { title: true } } },
            });
            type Result = z.infer<typeof _schema>;
            type Posts = Exclude<Result['posts'], undefined>;
            type Post = Posts extends Array<infer P> ? P : never;
            expectTypeOf<Post>().toHaveProperty('title');
            expectTypeOf<Post['title']>().toEqualTypeOf<string>();
            expectTypeOf<Post>().not.toHaveProperty('id');
        });
    });

    // ── include + omit ───────────────────────────────────────────────────────
    describe('include + omit', () => {
        it('omits the scalar field and adds the relation', () => {
            const schema = factory.makeModelSchema('User', {
                omit: { username: true },
                include: { posts: true },
            });
            expect(schema.safeParse({ ...validUserNoUsername, posts: [] }).success).toBe(true);
        });

        it('rejects when omitted field is present', () => {
            const schema = factory.makeModelSchema('User', {
                omit: { username: true },
                include: { posts: true },
            });
            expect(schema.safeParse({ ...validUser, posts: [] }).success).toBe(false);
        });

        it('infers combined shape correctly', () => {
            const _schema = factory.makeModelSchema('User', {
                omit: { username: true },
                include: { posts: true },
            });
            type Result = z.infer<typeof _schema>;
            expectTypeOf<Result>().not.toHaveProperty('username');
            expectTypeOf<Result>().toHaveProperty('email');
            expectTypeOf<Result>().toHaveProperty('posts');
        });
    });

    // ── select ───────────────────────────────────────────────────────────────
    describe('select', () => {
        it('returns only the selected scalar fields', () => {
            const schema = factory.makeModelSchema('User', { select: { id: true, email: true } });
            expect(schema.safeParse({ id: 'u1', email: 'a@b.com' }).success).toBe(true);
        });

        it('rejects when a non-selected field is present (strict)', () => {
            const schema = factory.makeModelSchema('User', { select: { id: true, email: true } });
            expect(schema.safeParse({ id: 'u1', email: 'a@b.com', username: 'alice' }).success).toBe(false);
        });

        it('rejects when a selected field is missing', () => {
            const schema = factory.makeModelSchema('User', { select: { id: true, email: true } });
            expect(schema.safeParse({ id: 'u1' }).success).toBe(false);
        });

        it('infers only selected fields in output type', () => {
            const _schema = factory.makeModelSchema('User', { select: { id: true, email: true } });
            type Result = z.infer<typeof _schema>;
            expectTypeOf<Result>().toHaveProperty('id');
            expectTypeOf<Result['id']>().toEqualTypeOf<string>();
            expectTypeOf<Result>().toHaveProperty('email');
            expectTypeOf<Result['email']>().toEqualTypeOf<string>();
            expectTypeOf<Result>().not.toHaveProperty('username');
            expectTypeOf<Result>().not.toHaveProperty('posts');
        });

        it('select with a relation field (true) includes the relation', () => {
            const schema = factory.makeModelSchema('User', { select: { id: true, posts: true } });
            expect(schema.safeParse({ id: 'u1', posts: [] }).success).toBe(true);
            // email should not be present
            expect(schema.safeParse({ id: 'u1', posts: [], email: 'a@b.com' }).success).toBe(false);
        });

        it('infers relation field type when selected with true', () => {
            const _schema = factory.makeModelSchema('User', { select: { id: true, posts: true } });
            type Result = z.infer<typeof _schema>;
            expectTypeOf<Result>().toHaveProperty('id');
            expectTypeOf<Result>().toHaveProperty('posts');
            expectTypeOf<Result>().not.toHaveProperty('email');
        });

        it('select with nested options on a relation', () => {
            const schema = factory.makeModelSchema('User', {
                select: {
                    id: true,
                    posts: { select: { title: true, published: true } },
                },
            });
            expect(schema.safeParse({ id: 'u1', posts: [{ title: 'Hello', published: true }] }).success).toBe(true);
            // extra field in nested post
            expect(schema.safeParse({ id: 'u1', posts: [{ title: 'Hello', published: true, id: 'p1' }] }).success).toBe(
                false,
            );
        });

        it('infers nested select shape on relation when selected with options', () => {
            const _schema = factory.makeModelSchema('User', {
                select: {
                    id: true,
                    posts: { select: { title: true } },
                },
            });
            type Result = z.infer<typeof _schema>;
            type Posts = Exclude<Result['posts'], undefined>;
            type Post = Posts extends Array<infer P> ? P : never;
            expectTypeOf<Post>().toHaveProperty('title');
            expectTypeOf<Post['title']>().toEqualTypeOf<string>();
            expectTypeOf<Post>().not.toHaveProperty('id');
            expectTypeOf<Post>().not.toHaveProperty('published');
        });

        it('select on Post with author relation (nested include)', () => {
            const schema = factory.makeModelSchema('Post', {
                select: {
                    id: true,
                    author: { select: { id: true, email: true } },
                },
            });
            expect(schema.safeParse({ id: 'p1', author: { id: 'u1', email: 'a@b.com' } }).success).toBe(true);
            // author with extra field
            expect(schema.safeParse({ id: 'p1', author: { id: 'u1', email: 'a@b.com', username: 'x' } }).success).toBe(
                false,
            );
        });
    });

    // ── invalid option combinations ───────────────────────────────────────────
    describe('invalid option combinations', () => {
        it('throws when select and include are used together', () => {
            expect(() =>
                factory.makeModelSchema('User', { select: { id: true }, include: { posts: true } } as any),
            ).toThrow('`select` and `include` cannot be used together');
        });

        it('throws when select and omit are used together', () => {
            expect(() =>
                factory.makeModelSchema('User', { select: { id: true }, omit: { username: true } } as any),
            ).toThrow('`select` and `omit` cannot be used together');
        });

        it('throws when select and include are used together in nested relation options', () => {
            expect(() =>
                factory.makeModelSchema('User', {
                    include: { posts: { select: { id: true }, include: {} } as any },
                }),
            ).toThrow('`select` and `include` cannot be used together');
        });

        it('throws when select references a non-existent field', () => {
            expect(() => factory.makeModelSchema('User', { select: { nonExistent: true } as any })).toThrow(
                'Field "nonExistent" does not exist on model "User"',
            );
        });

        it('throws when select provides nested options for a scalar field', () => {
            expect(() =>
                factory.makeModelSchema('User', { select: { email: { select: { id: true } } } as any }),
            ).toThrow('Field "email" on model "User" is a scalar field and cannot have nested options');
        });

        it('throws when include references a non-existent field', () => {
            expect(() => factory.makeModelSchema('User', { include: { nonExistent: true } as any })).toThrow(
                'Field "nonExistent" does not exist on model "User"',
            );
        });

        it('throws when include references a scalar field', () => {
            expect(() => factory.makeModelSchema('User', { include: { email: true } as any })).toThrow(
                'Field "email" on model "User" is not a relation field and cannot be used in "include"',
            );
        });

        it('throws when omit references a non-existent field', () => {
            expect(() => factory.makeModelSchema('User', { omit: { nonExistent: true } as any })).toThrow(
                'Field "nonExistent" does not exist on model "User"',
            );
        });

        it('throws when omit references a relation field', () => {
            expect(() => factory.makeModelSchema('User', { omit: { posts: true } as any })).toThrow(
                'Field "posts" on model "User" is a relation field and cannot be used in "omit"',
            );
        });
    });

    // ── optionality ─────────────────────────────────────────────────────────
    describe('optionality', () => {
        // optionality: 'all' — every field becomes optional
        describe("optionality: 'all'", () => {
            it('accepts an empty object when optionality is all', () => {
                const schema = factory.makeModelSchema('User', { optionality: 'all' });
                expect(schema.safeParse({}).success).toBe(true);
            });

            it('accepts a fully populated object when optionality is all', () => {
                const schema = factory.makeModelSchema('User', { optionality: 'all' });
                expect(schema.safeParse(validUser).success).toBe(true);
            });

            it('rejects extra fields when optionality is all (still strict)', () => {
                const schema = factory.makeModelSchema('User', { optionality: 'all' });
                expect(schema.safeParse({ ...validUser, unknownField: 'x' }).success).toBe(false);
            });

            it('infers all fields as optional when optionality is all', () => {
                const _schema = factory.makeModelSchema('User', { optionality: 'all' });
                type Result = z.infer<typeof _schema>;
                expectTypeOf<Result['id']>().toEqualTypeOf<string | undefined>();
                expectTypeOf<Result['email']>().toEqualTypeOf<string | undefined>();
                expectTypeOf<Result['username']>().toEqualTypeOf<string | undefined>();
                expectTypeOf<Result['active']>().toEqualTypeOf<boolean | undefined>();
                expectTypeOf<Result['age']>().toEqualTypeOf<number | undefined>();
            });

            it('still validates field constraints when the field is provided with optionality all', () => {
                const schema = factory.makeModelSchema('User', { optionality: 'all' });
                // email constraint still applies when email is provided
                expect(schema.safeParse({ email: 'not-an-email' }).success).toBe(false);
                expect(schema.safeParse({ email: 'valid@example.com' }).success).toBe(true);
                // empty object passes (all optional, null comparisons in @@validate pass through)
                expect(schema.safeParse({}).success).toBe(true);
            });

            it('combines optionality all with omit', () => {
                const schema = factory.makeModelSchema('User', {
                    omit: { username: true },
                    optionality: 'all',
                });
                // empty object is fine (all optional, username omitted)
                expect(schema.safeParse({}).success).toBe(true);
                // username must not be present (strict + omitted)
                expect(schema.safeParse({ username: 'alice' }).success).toBe(false);
                // other fields are optional
                expect(schema.safeParse({ email: 'a@b.com' }).success).toBe(true);
            });

            it('combines optionality all with select', () => {
                const schema = factory.makeModelSchema('User', {
                    select: { id: true, email: true },
                    optionality: 'all',
                });
                // both fields optional → empty passes (no @@validate fields in shape)
                expect(schema.safeParse({}).success).toBe(true);
                // non-selected field rejected
                expect(schema.safeParse({ id: 'u1', username: 'x' }).success).toBe(false);
                // subset passes
                expect(schema.safeParse({ id: 'u1' }).success).toBe(true);
            });

            it('preserves @meta description on fields wrapped by optionality all', () => {
                const schema = factory.makeModelSchema('User', { optionality: 'all' });
                expect(schema.shape.email.meta()?.description).toBe("The user's email address");
            });
        });

        // optionality: 'defaults' — only fields with @default or @updatedAt become optional
        describe("optionality: 'defaults'", () => {
            it('makes fields with @default optional', () => {
                // Product.discount has @default(0), Product.id has @default(cuid())
                // finalPrice is computed (no @default) so it must still be provided
                const schema = factory.makeModelSchema('Product', { optionality: 'defaults' });
                // omitting id and discount (both have defaults) should pass
                expect(schema.safeParse({ name: 'Widget', price: 10.0, finalPrice: 8.0 }).success).toBe(true);
            });

            it('keeps fields without @default required with optionality defaults', () => {
                const schema = factory.makeModelSchema('Product', { optionality: 'defaults' });
                // omitting name (no default) should fail
                expect(schema.safeParse({ price: 10.0, finalPrice: 8.0 }).success).toBe(false);
                // omitting price (no default) should fail
                expect(schema.safeParse({ name: 'Widget', finalPrice: 8.0 }).success).toBe(false);
                // omitting finalPrice (computed, no default) should fail
                expect(schema.safeParse({ name: 'Widget', price: 10.0 }).success).toBe(false);
            });

            it('infers fields with @default as optional and others as required', () => {
                const _schema = factory.makeModelSchema('Product', { optionality: 'defaults' });
                type Result = z.infer<typeof _schema>;
                // optionality: 'defaults' is now resolved statically via FieldHasDefault,
                // which inspects the `default` and `updatedAt` fields on FieldDef.
                // id has @default(cuid()) → optional
                expectTypeOf<Result['id']>().toEqualTypeOf<string | undefined>();
                // discount has @default(0) → optional
                expectTypeOf<Result['discount']>().toEqualTypeOf<number | undefined>();
                // name has no default → required (unchanged)
                expectTypeOf<Result['name']>().toEqualTypeOf<string>();
                // price has no default → required (unchanged)
                expectTypeOf<Result['price']>().toEqualTypeOf<number>();
            });

            it('also makes already-optional (nullable) fields optional with optionality defaults', () => {
                // User.website is optional: true (nullable optional in the schema)
                // optionality: 'defaults' should also make it optional in the output
                const schema = factory.makeModelSchema('User', { optionality: 'defaults' });
                // website being absent should still pass since it is an optional field
                const { website: _, ...withoutWebsite } = validUser;
                expect(schema.safeParse(withoutWebsite).success).toBe(true);
            });

            it('combines optionality defaults with omit', () => {
                // omit finalPrice (computed) and apply defaults optionality
                const schema = factory.makeModelSchema('Product', {
                    omit: { finalPrice: true },
                    optionality: 'defaults',
                });
                // id and discount have defaults → optional; name and price required
                expect(schema.safeParse({ name: 'Widget', price: 10.0 }).success).toBe(true);
                // finalPrice must be absent
                expect(schema.safeParse({ name: 'Widget', price: 10.0, finalPrice: 8.0 }).success).toBe(false);
            });

            it('combines optionality defaults with select (only selected fields apply defaults logic)', () => {
                // select only `id` (has default) and `name` (no default)
                const schema = factory.makeModelSchema('Product', {
                    select: { id: true, name: true },
                    optionality: 'defaults',
                });
                // id has default → optional; name has no default → required
                expect(schema.safeParse({ name: 'Widget' }).success).toBe(true);
                expect(schema.safeParse({}).success).toBe(false);
                // non-selected field rejected
                expect(schema.safeParse({ name: 'Widget', price: 10.0 }).success).toBe(false);
            });

            it('preserves @meta description on fields wrapped by optionality defaults', () => {
                // id has @default, so it gets wrapped; email has no @default but has @meta
                const schema = factory.makeModelSchema('User', { optionality: 'defaults' });
                expect(schema.shape.email.meta()?.description).toBe("The user's email address");
            });
        });

        // Additional type-level assertions for optionality: 'all'
        describe("optionality: 'all' — type inference", () => {
            it('infers all scalar fields as optional (including already-optional)', () => {
                const _schema = factory.makeModelSchema('User', { optionality: 'all' });
                type Result = z.infer<typeof _schema>;
                expectTypeOf<Result['email']>().toEqualTypeOf<string | undefined>();
                expectTypeOf<Result['username']>().toEqualTypeOf<string | undefined>();
                expectTypeOf<Result['age']>().toEqualTypeOf<number | undefined>();
                // already-optional nullable field
                expectTypeOf<Result['website']>().toEqualTypeOf<string | null | undefined>();
            });

            it('infers omitted field absent even with optionality all', () => {
                const _schema = factory.makeModelSchema('User', {
                    omit: { username: true },
                    optionality: 'all',
                });
                type Result = z.infer<typeof _schema>;
                expectTypeOf<Result>().not.toHaveProperty('username');
                expectTypeOf<Result['email']>().toEqualTypeOf<string | undefined>();
            });

            it('infers selected fields as optional when optionality is all', () => {
                const _schema = factory.makeModelSchema('User', {
                    select: { id: true, email: true },
                    optionality: 'all',
                });
                type Result = z.infer<typeof _schema>;
                expectTypeOf<Result['id']>().toEqualTypeOf<string | undefined>();
                expectTypeOf<Result['email']>().toEqualTypeOf<string | undefined>();
                expectTypeOf<Result>().not.toHaveProperty('username');
            });
        });

        // Additional cases for optionality: 'defaults' with User model
        describe("optionality: 'defaults' — User model", () => {
            it('makes @default(cuid) id field optional on User', () => {
                const schema = factory.makeModelSchema('User', { optionality: 'defaults' });
                const { id: _, ...withoutId } = validUser;
                expect(schema.safeParse(withoutId).success).toBe(true);
            });

            it('keeps non-default fields required on User', () => {
                const schema = factory.makeModelSchema('User', { optionality: 'defaults' });
                const { email: _, ...withoutEmail } = validUser;
                expect(schema.safeParse(withoutEmail).success).toBe(false);
            });

            it('still accepts the full valid User object', () => {
                const schema = factory.makeModelSchema('User', { optionality: 'defaults' });
                expect(schema.safeParse(validUser).success).toBe(true);
            });

            it('makes @default(autoincrement) and @default(now) fields optional on Asset', () => {
                const schema = factory.makeModelSchema('Asset', { optionality: 'defaults' });
                // assetType has no default — must be provided
                expect(schema.safeParse({ assetType: 'Video' }).success).toBe(true);
                // omitting assetType fails
                expect(schema.safeParse({}).success).toBe(false);
            });
        });

        // makeModelCreateSchema / makeModelUpdateSchema
        describe('makeModelCreateSchema and makeModelUpdateSchema', () => {
            it('makeModelCreateSchema makes @default fields optional', () => {
                const createSchema = factory.makeModelCreateSchema('User');
                const { id: _, ...withoutId } = validUser;
                expect(createSchema.safeParse(withoutId).success).toBe(true);
            });

            it('makeModelUpdateSchema makes all fields optional', () => {
                const updateSchema = factory.makeModelUpdateSchema('User');
                expect(updateSchema.safeParse({}).success).toBe(true);
                expect(updateSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
            });

            it('makeModelUpdateSchema still validates constraints when field is provided', () => {
                const updateSchema = factory.makeModelUpdateSchema('User');
                expect(updateSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
                expect(updateSchema.safeParse({ email: 'valid@example.com' }).success).toBe(true);
            });

            it('makeModelUpdateSchema preserves @meta description on fields', () => {
                const updateSchema = factory.makeModelUpdateSchema('User');
                expect(updateSchema.shape.email.meta()?.description).toBe("The user's email address");
            });

            it('makeModelCreateSchema preserves @meta description on fields', () => {
                const createSchema = factory.makeModelCreateSchema('User');
                expect(createSchema.shape.email.meta()?.description).toBe("The user's email address");
            });
        });
    });

    // ── runtime error handling ────────────────────────────────────────────────
    describe('runtime validation still applies with options', () => {
        it('@@validate still runs with omit when the referenced field is present in the shape', () => {
            // omitting `username` leaves `age` in the shape, so @@validate(age >= 18) still fires
            const schema = factory.makeModelSchema('User', { omit: { username: true } });
            expect(schema.safeParse({ ...validUserNoUsername, age: 16 }).success).toBe(false);
            expect(schema.safeParse({ ...validUserNoUsername, age: 18 }).success).toBe(true);
        });

        it('@@validate is skipped when its referenced field is omitted', () => {
            // omitting `age` removes the field that @@validate(age >= 18) references,
            // so the rule is silently skipped — age: 16 is no longer validated
            const { age: _, username: _u, ...validUserNoAgeOrUsername } = validUser;
            const schema = factory.makeModelSchema('User', { omit: { age: true, username: true } });
            expect(schema.safeParse(validUserNoAgeOrUsername).success).toBe(true);
        });

        it('field validation still runs with select options', () => {
            const schema = factory.makeModelSchema('User', { select: { email: true } });
            expect(schema.safeParse({ email: 'not-an-email' }).success).toBe(false);
            expect(schema.safeParse({ email: 'valid@example.com' }).success).toBe(true);
        });

        it('@@validate is skipped with select when the referenced field is not selected', () => {
            // selecting only `email` omits `age`, so @@validate(age >= 18) is skipped
            const schema = factory.makeModelSchema('User', { select: { email: true } });
            // would fail @@validate if age were present and < 18, but age isn't in the shape
            expect(schema.safeParse({ email: 'valid@example.com' }).success).toBe(true);
        });

        it('@@validate still runs with select when the referenced field is selected', () => {
            // selecting both `email` and `age` keeps the @@validate(age >= 18) rule active
            const schema = factory.makeModelSchema('User', { select: { email: true, age: true } });
            expect(schema.safeParse({ email: 'valid@example.com', age: 16 }).success).toBe(false);
            expect(schema.safeParse({ email: 'valid@example.com', age: 18 }).success).toBe(true);
        });
    });
});
