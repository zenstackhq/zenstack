import Decimal from 'decimal.js';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createModelSchemaFactory } from '../src/index';
import { schema } from './schema/schema';
import z from 'zod';

const factory = createModelSchemaFactory(schema);

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
