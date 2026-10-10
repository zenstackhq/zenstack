import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/custom-type-primitive/schema';

/**
 * Counter test cases for review findings on primitive custom types (PR #2852).
 * Each test is expected to FAIL on the current PR head and pass once the
 * corresponding finding is fixed.
 */

const BASE_SCHEMA = `
model User {
    id       String    @id @default(nanoid())
    name     UserName
    contacts Contact[]
    age      Age?      @default(18)
}

type UserName with String {
    this String @length(2, 16)
}

type Contact with String {
    this String @phone
}

type Age with Int {
    this Int @gte(18)
}
`;

// SQLite doesn't support list fields, so drop `contacts` for SQLite cases
const SQLITE_SCHEMA = BASE_SCHEMA.replace('    contacts Contact[]\n', '');

describe('Custom type primitive review findings', () => {
    let client: any;

    afterEach(async () => {
        await client?.$disconnect();
    });

    // Finding 1: zod/factory.ts makeWhereSchema routes primitive typedef fields to the
    // typed-JSON filter schema, so plain scalar filters are rejected at validation time.
    describe('finding 1: where-input uses scalar filters for primitive typedef fields', () => {
        it('accepts plain value, string and numeric filters', async () => {
            client = await createTestClient(BASE_SCHEMA, { provider: 'postgresql' });
            await client.user.create({ data: { name: 'test', age: 20 } });

            await expect(client.user.findMany({ where: { name: 'test' } })).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { name: { contains: 'es' } } })).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { name: { startsWith: 'te' } } })).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { age: { gte: 18 } } })).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { age: { lt: 18 } } })).resolves.toHaveLength(0);
        });
    });

    // Finding 2: sqlite.ts transformInput/transformOutput treat every typedef name as JSON,
    // so primitive typedef values are stored JSON-quoted on SQLite.
    describe('finding 2: SQLite stores primitive typedef values as raw scalars', () => {
        it('stores and reads back scalars without JSON encoding', async () => {
            client = await createTestClient(SQLITE_SCHEMA, { provider: 'sqlite' });
            const user = await client.user.create({ data: { name: 'test', age: 20 } });
            expect(user.name).toBe('test');
            expect(user.age).toBe(20);

            // raw row must hold the bare scalar, not a JSON string
            const raw = await client.$qb
                .selectFrom('User')
                .select(['name', 'age'])
                .where('id', '=', user.id)
                .executeTakeFirstOrThrow();
            expect(raw.name).toBe('test');
            expect(raw.age).toBe(20);

            await expect(client.user.findMany({ where: { name: { equals: 'test' } } })).resolves.toHaveLength(1);
            await expect(client.user.aggregate({ _max: { age: true } })).resolves.toMatchObject({
                _max: { age: 20 },
            });
        });
    });

    // Finding 3: ts-schema-generator getMappedValue keys numeric conversion off fieldType.type,
    // which is undefined for typedef references, so @default(18) is emitted as "18".
    describe('finding 3: numeric defaults on primitive typedef fields are emitted as numbers', () => {
        it('emits a numeric default in the generated schema', () => {
            expect(schema.models.User.fields.age.default).toBe(18);
            expect(typeof schema.models.User.fields.age.default).toBe('number');
        });

        it('applies the default as a number on SQLite', async () => {
            client = await createTestClient(SQLITE_SCHEMA, { provider: 'sqlite' });
            const user = await client.user.create({ data: { name: 'test' } });
            expect(user.age).toBe(18);
            expect(typeof user.age).toBe('number');
        });
    });

    // Finding 4: zod/factory.ts isNumericField compares fieldDef.type against the builtin
    // numeric type names, so Int-based typedef fields get no atomic update operators.
    describe('finding 4: numeric primitive typedef fields support atomic update ops', () => {
        it('accepts increment/decrement/multiply', async () => {
            client = await createTestClient(BASE_SCHEMA, { provider: 'postgresql' });
            const user = await client.user.create({ data: { name: 'test', age: 20 } });

            await expect(
                client.user.update({ where: { id: user.id }, data: { age: { increment: 1 } } }),
            ).resolves.toMatchObject({ age: 21 });
            await expect(
                client.user.update({ where: { id: user.id }, data: { age: { decrement: 1 } } }),
            ).resolves.toMatchObject({ age: 20 });
            await expect(client.user.updateMany({ data: { age: { multiply: 2 } } })).resolves.toMatchObject({
                count: 1,
            });
            await expect(client.user.findUnique({ where: { id: user.id } })).resolves.toMatchObject({ age: 40 });
        });

        it('supports numeric aggregation', async () => {
            client = await createTestClient(BASE_SCHEMA, { provider: 'postgresql' });
            await client.user.create({ data: { name: 'test', age: 20 } });
            await client.user.create({ data: { name: 'test', age: 30 } });
            await expect(client.user.aggregate({ _sum: { age: true }, _avg: { age: true } })).resolves.toMatchObject({
                _sum: { age: 50 },
                _avg: { age: 25 },
            });
        });
    });

    // Finding 5: zod/factory.ts makeScalarSchema discards the `attributes` argument when the
    // type is a typedef, so attributes declared on the consuming model field are ignored.
    describe('finding 5: ORM applies attributes declared on the consuming field', () => {
        it('enforces field-level @length on a primitive typedef field', async () => {
            client = await createTestClient(
                `
model User {
    id    String @id @default(nanoid())
    email Email  @length(1, 5)
}

type Email with String {
    this String
}
`,
                { provider: 'postgresql' },
            );

            await expect(client.user.create({ data: { email: 'ab' } })).resolves.toMatchObject({ email: 'ab' });
            await expect(client.user.create({ data: { email: 'abcdefgh' } })).toBeRejectedByValidation();
        });

        it('enforces both typedef-level and field-level attributes', async () => {
            client = await createTestClient(
                `
model User {
    id    String @id @default(nanoid())
    email Email  @length(1, 5)
}

type Email with String {
    this String @email
}
`,
                { provider: 'postgresql' },
            );

            // too long: rejected by field-level @length
            await expect(client.user.create({ data: { email: 'a@b.com' } })).toBeRejectedByValidation();
            // not an email: rejected by typedef-level @email
            await expect(client.user.create({ data: { email: 'abc' } })).toBeRejectedByValidation();
        });
    });

    // Finding 6: crud-types.ts WhereInput maps any field whose type is a typedef to
    // TypedJsonFilter, so scalar filters on primitive typedef fields are TypeScript errors.
    // Verified by `pnpm test:typecheck` (tsc --noEmit) in tests/e2e; vitest's typecheck only
    // covers *.test-d.ts files. On the current head tsc reports TS2353 on the three scalar
    // filters below and an unused @ts-expect-error on the JSON-shaped one.
    describe('finding 6: WhereInput types primitive typedef fields as scalar filters', () => {
        it('type-checks string and numeric filters without casts', async () => {
            const typed: ClientContract<typeof schema> = await createTestClient(schema, {
                provider: 'postgresql',
            });
            client = typed;
            await typed.user.create({ data: { name: 'test', age: 20 } });

            // these must compile without `as any`
            await expect(typed.user.findMany({ where: { name: { contains: 'es' } } })).resolves.toHaveLength(1);
            await expect(typed.user.findMany({ where: { name: { startsWith: 'te' } } })).resolves.toHaveLength(1);
            await expect(typed.user.findMany({ where: { age: { gte: 18 } } })).resolves.toHaveLength(1);
            await expect(typed.user.findMany({ where: { contacts: { has: '+15555555555' } } })).resolves.toHaveLength(
                0,
            );

            // and JSON-filter shapes must be rejected at the type level
            await expect(
                // @ts-expect-error `path` is a JSON filter key, not valid for a String-based typedef
                typed.user.findMany({ where: { name: { path: '$.foo' } } }),
            ).rejects.toThrow();
        });
    });

    // Finding 7: base-dialect.ts buildTypedJsonFilter and zod/factory.ts
    // makeTypedJsonFilterSchema recurse into a primitive typedef used as a field of a JSON
    // typedef as if it had sub-fields, so filtering on nested primitive typedef fields breaks.
    describe('finding 7: primitive typedef nested in a JSON typedef is filterable', () => {
        it('filters on a nested primitive typedef field', async () => {
            client = await createTestClient(
                `
model User {
    id      String  @id @default(nanoid())
    profile Profile @json
}

type Profile {
    email Email
    age   Age
}

type Email with String {
    this String @email
}

type Age with Int {
    this Int @gte(18)
}
`,
                { provider: 'postgresql' },
            );

            await client.user.create({ data: { profile: { email: 'alice@example.com', age: 25 } } });

            await expect(
                client.user.findMany({ where: { profile: { email: 'alice@example.com' } } }),
            ).resolves.toHaveLength(1);
            await expect(
                client.user.findMany({ where: { profile: { email: { contains: 'alice' } } } }),
            ).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { profile: { age: { gte: 18 } } } })).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { profile: { age: { lt: 18 } } } })).resolves.toHaveLength(0);
        });
    });

    // Finding 8: postgresql.ts getSqlType falls through to 'text' for a non-String primitive
    // typedef name, so array filters on an Int-based typedef array cast to text[] against an
    // integer[] column.
    describe('finding 8: PostgreSQL array filters cast to the typedef base type', () => {
        it('filters an Int-based typedef array', async () => {
            client = await createTestClient(
                `
model User {
    id   String @id @default(nanoid())
    ages Age[]
}

type Age with Int {
    this Int @gte(18)
}
`,
                { provider: 'postgresql' },
            );

            await client.user.create({ data: { ages: [18, 25] } });
            await client.user.create({ data: { ages: [30] } });

            await expect(client.user.findMany({ where: { ages: { has: 18 } } })).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { ages: { hasSome: [18, 30] } } })).resolves.toHaveLength(2);
            await expect(client.user.findMany({ where: { ages: { hasEvery: [18, 25] } } })).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { ages: { equals: [30] } } })).resolves.toHaveLength(1);
            await expect(client.user.findMany({ where: { ages: { isEmpty: true } } })).resolves.toHaveLength(0);
        });
    });
});
