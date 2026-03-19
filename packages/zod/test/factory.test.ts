import Decimal from 'decimal.js';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createSchemaFactory } from '../src/index';
import { schema } from './schema/schema';
import z from 'zod';

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
            expectTypeOf<User['metadata']>().toEqualTypeOf<
                string | number | boolean | null | Record<string, unknown> | unknown[] | undefined
            >();

            // required enum
            expectTypeOf<User['status']>().toEqualTypeOf<'ACTIVE' | 'INACTIVE' | 'PENDING'>();

            // optional typedef (Address): { street, city, zip? } | null | undefined
            type Address = Exclude<User['address'], null | undefined>;
            expectTypeOf<Address['street']>().toEqualTypeOf<string>();
            expectTypeOf<Address['city']>().toEqualTypeOf<string>();
            expectTypeOf<Address['zip']>().toEqualTypeOf<string | null | undefined>();
            expectTypeOf<User['address']>().toEqualTypeOf<Address | null | undefined>();

            // relation field present
            expectTypeOf<User>().toHaveProperty('posts');
            const _postSchema = factory.makeModelSchema('Post');
            type Post = z.infer<typeof _postSchema>;
            expectTypeOf<User['posts']>().toEqualTypeOf<Post[] | undefined>();
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

            const createPostSchema = factory.makeModelCreateSchema('Post');
            type PostCreate = z.infer<typeof createPostSchema>;

            expectTypeOf<PostCreate['tags']>().toEqualTypeOf<string[]>();

            const updatePostSchema = factory.makeModelUpdateSchema('Post');
            type PostUpdate = z.infer<typeof updatePostSchema>;

            expectTypeOf<PostUpdate['tags']>().toEqualTypeOf<string[] | undefined>();

            // optional relation field present in type
            expectTypeOf<Post>().toHaveProperty('author');
            const _userSchema = factory.makeModelSchema('User');
            type User = z.infer<typeof _userSchema>;
            expectTypeOf<Post['author']>().toEqualTypeOf<User | undefined | null>();
        });

        it('accepts a fully valid User', () => {
            const userSchema = factory.makeModelSchema('User');
            expect(userSchema.safeParse(validUser).success).toBe(true);
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
                address: { street: '123 Main St', city: 'Springfield', zip: null },
            });
            expect(result.success).toBe(true);
        });

        it('accepts Address with optional zip present', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                address: { street: '123 Main St', city: 'Springfield', zip: '12345' },
            });
            expect(result.success).toBe(true);
        });

        it('rejects Address with extra fields (strict object)', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                address: { street: '123 Main St', city: 'Springfield', zip: null, extra: 'field' },
            });
            expect(result.success).toBe(false);
        });

        it('rejects Address missing required fields', () => {
            const userSchema = factory.makeModelSchema('User');
            const result = userSchema.safeParse({
                ...validUser,
                address: { street: '123 Main St' },
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
        expect(addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: null }).success).toBe(true);
    });

    it('rejects Address with missing required field', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        const result = addressSchema.safeParse({ street: '123 Main' });
        expect(result.success).toBe(false);
    });

    it('rejects Address with extra fields (strict object)', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        const result = addressSchema.safeParse({
            street: '123 Main',
            city: 'Springfield',
            zip: null,
            extra: 'field',
        });
        expect(result.success).toBe(false);
    });

    it('accepts Address with optional zip as null', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        expect(addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: null }).success).toBe(true);
    });

    it('accepts Address with optional zip as a string', () => {
        const addressSchema = factory.makeTypeSchema('Address');
        expect(addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: '12345' }).success).toBe(true);
    });

    describe('extra validations', () => {
        it('passes when zip is null', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            expect(addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: null }).success).toBe(true);
        });

        it('passes when zip is omitted', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            expect(addressSchema.safeParse({ street: '123 Main', city: 'Springfield' }).success).toBe(true);
        });

        it('passes when zip is exactly 5 characters', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            expect(addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: '90210' }).success).toBe(
                true,
            );
        });

        it('fails when zip is fewer than 5 characters', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: '123' });
            expect(result.success).toBe(false);
        });

        it('fails when zip is more than 5 characters', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: '123456' });
            expect(result.success).toBe(false);
        });

        it('error message matches the configured message', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: '123' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.map((i) => i.message)).toContain('Zip code must be exactly 5 characters');
            }
        });

        it('error path points to the zip field', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({ street: '123 Main', city: 'Springfield', zip: '123' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.map((i) => i.path)).toContainEqual(['zip']);
            }
        });

        it('fails when city is too short', () => {
            const addressSchema = factory.makeTypeSchema('Address');
            const result = addressSchema.safeParse({ street: '123 Main', city: '', zip: '12345' });
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
                address: { street: '123 Main', city: 'Springfield', zip: '90210' },
            };
            expect(userSchema.safeParse(validUser).success).toBe(true);
            expect(
                userSchema.safeParse({ ...validUser, address: { street: '123 Main', city: 'Springfield', zip: '123' } })
                    .success,
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
