import { createQuerySchemaFactory, definePlugin, type ClientContract, type ClientOptions } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { schema } from '../schemas/basic';

describe('Zod schema factory test', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    // #region Find

    describe('makeFindManySchema', () => {
        it('accepts undefined (all args optional)', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse(undefined).success).toBe(true);
        });

        it('accepts valid where clause', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ where: { email: { equals: 'u@test.com' } } }).success).toBe(true);
        });

        it('accepts string filter operators', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ where: { email: { contains: 'test', startsWith: 'u' } } }).success).toBe(true);
        });

        it('accepts number filter operators', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ where: { age: { gt: 18, lte: 65 } } }).success).toBe(true);
        });

        it('accepts enum filter', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ where: { role: { in: ['USER', 'ADMIN'] } } }).success).toBe(true);
        });

        it('accepts logical combinators (AND/OR/NOT)', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(
                s.safeParse({
                    where: {
                        AND: [{ email: { contains: 'test' } }, { role: 'USER' }],
                    },
                }).success,
            ).toBe(true);
            expect(s.safeParse({ where: { NOT: { email: { equals: 'admin@test.com' } } } }).success).toBe(true);
        });

        it('accepts relation filter', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(true);
        });

        it('accepts pagination args (take, skip)', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ take: 10, skip: 20 }).success).toBe(true);
        });

        it('accepts orderBy', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ orderBy: { email: 'asc' } }).success).toBe(true);
            expect(s.safeParse({ orderBy: [{ email: 'asc' }, { name: 'desc' }] }).success).toBe(true);
        });

        it('accepts select', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ select: { id: true, email: true } }).success).toBe(true);
        });

        it('accepts include', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ include: { posts: true, profile: true } }).success).toBe(true);
        });

        it('rejects select and include together', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ select: { id: true }, include: { posts: true } }).success).toBe(false);
        });

        it('rejects select and omit together', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ select: { id: true }, omit: { name: true } }).success).toBe(false);
        });

        it('rejects unknown where field', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });

        it('rejects invalid enum value in where', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ where: { role: 'SUPERUSER' } }).success).toBe(false);
        });

        it('rejects non-integer take', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ take: 1.5 }).success).toBe(false);
        });

        it('accepts negative take (cursor-based pagination)', () => {
            const s = client.$zod.makeFindManySchema('User');
            // negative take is valid: means "take the last N results"
            expect(s.safeParse({ take: -1 }).success).toBe(true);
        });
    });

    describe('makeFindUniqueSchema', () => {
        it('accepts where with unique id field', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            expect(s.safeParse({ where: { id: 'u1' } }).success).toBe(true);
        });

        it('accepts where with unique email field', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
        });

        it('accepts optional select/include', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            expect(s.safeParse({ where: { id: 'u1' }, include: { posts: true } }).success).toBe(true);
        });

        it('rejects empty where', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            expect(s.safeParse({ where: {} }).success).toBe(false);
        });

        it('rejects non-unique where field', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            // name is not a unique field
            expect(s.safeParse({ where: { name: 'Alice' } }).success).toBe(false);
        });

        it('rejects missing where', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            expect(s.safeParse({}).success).toBe(false);
        });

        it('rejects select and include together', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            expect(s.safeParse({ where: { id: 'u1' }, select: { id: true }, include: { posts: true } }).success).toBe(
                false,
            );
        });

        it('infers type with where as required property', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            type Args = z.infer<typeof s>;
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('include');
        });
    });

    describe('makeFindFirstSchema', () => {
        it('accepts undefined (all args optional)', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse(undefined).success).toBe(true);
        });

        it('accepts valid where clause', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ where: { email: { contains: 'test' } } }).success).toBe(true);
        });

        it('accepts non-unique where field (unlike findUnique)', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ where: { name: 'Alice' } }).success).toBe(true);
        });

        it('accepts pagination args (take, skip)', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ take: 1, skip: 5 }).success).toBe(true);
        });

        it('accepts orderBy', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ orderBy: { email: 'asc' } }).success).toBe(true);
        });

        it('accepts select', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ select: { id: true, email: true } }).success).toBe(true);
        });

        it('accepts include', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ include: { posts: true } }).success).toBe(true);
        });

        it('rejects select and include together', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ select: { id: true }, include: { posts: true } }).success).toBe(false);
        });

        it('rejects unknown where field', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });

        it('rejects invalid enum value in where', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ where: { role: 'SUPERUSER' } }).success).toBe(false);
        });

        it('rejects non-integer take', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            expect(s.safeParse({ take: 1.5 }).success).toBe(false);
        });
    });

    describe('makeExistsSchema', () => {
        it('accepts undefined (all optional)', () => {
            const s = client.$zod.makeExistsSchema('User');
            expect(s.safeParse(undefined).success).toBe(true);
        });

        it('accepts empty object (where is optional)', () => {
            const s = client.$zod.makeExistsSchema('User');
            expect(s.safeParse({}).success).toBe(true);
        });

        it('accepts where clause', () => {
            const s = client.$zod.makeExistsSchema('User');
            expect(s.safeParse({ where: { role: 'USER' } }).success).toBe(true);
        });

        it('rejects unknown where field', () => {
            const s = client.$zod.makeExistsSchema('User');
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });
    });

    // #endregion

    // #region Create

    describe('makeCreateSchema', () => {
        it('accepts minimal valid create input (required fields only)', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com' } }).success).toBe(true);
        });

        it('accepts full create input with optional fields', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(
                s.safeParse({
                    data: { email: 'u@test.com', name: 'Alice', age: 30, role: 'ADMIN' },
                }).success,
            ).toBe(true);
        });

        it('accepts nested relation in create (nested create)', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(
                s.safeParse({
                    data: {
                        email: 'u@test.com',
                        posts: { create: { title: 'Hello' } },
                    },
                }).success,
            ).toBe(true);
        });

        it('accepts select/include in create args', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(
                s.safeParse({
                    data: { email: 'u@test.com' },
                    select: { id: true, email: true },
                }).success,
            ).toBe(true);
        });

        it('rejects missing required field (email)', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(s.safeParse({ data: {} }).success).toBe(false);
        });

        it('rejects invalid enum value', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com', role: 'SUPERUSER' } }).success).toBe(false);
        });

        it('rejects unknown field in data', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com', notAField: 'val' } }).success).toBe(false);
        });

        it('rejects missing data wrapper', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(s.safeParse({ email: 'u@test.com' }).success).toBe(false);
        });

        it('rejects select and include together', () => {
            const s = client.$zod.makeCreateSchema('User');
            expect(
                s.safeParse({ data: { email: 'u@test.com' }, select: { id: true }, include: { posts: true } }).success,
            ).toBe(false);
        });
    });

    describe('makeCreateManySchema', () => {
        it('accepts single record as data', () => {
            const s = client.$zod.makeCreateManySchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com' } }).success).toBe(true);
        });

        it('accepts array of records as data', () => {
            const s = client.$zod.makeCreateManySchema('User');
            expect(s.safeParse({ data: [{ email: 'a@test.com' }, { email: 'b@test.com' }] }).success).toBe(true);
        });

        it('accepts skipDuplicates flag', () => {
            const s = client.$zod.makeCreateManySchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com' }, skipDuplicates: true }).success).toBe(true);
        });

        it('rejects missing data', () => {
            const s = client.$zod.makeCreateManySchema('User');
            expect(s.safeParse({}).success).toBe(false);
        });

        it('rejects unknown field in data', () => {
            const s = client.$zod.makeCreateManySchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com', notAField: 'val' } }).success).toBe(false);
        });

        it('rejects invalid enum value in data', () => {
            const s = client.$zod.makeCreateManySchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com', role: 'SUPERUSER' } }).success).toBe(false);
        });
    });

    describe('makeCreateManyAndReturnSchema', () => {
        it('accepts undefined (whole schema is optional)', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            expect(s.safeParse(undefined).success).toBe(true);
        });

        it('accepts single record as data', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com' } }).success).toBe(true);
        });

        it('accepts array of records as data', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            expect(s.safeParse({ data: [{ email: 'a@test.com' }, { email: 'b@test.com' }] }).success).toBe(true);
        });

        it('accepts skipDuplicates flag', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com' }, skipDuplicates: true }).success).toBe(true);
        });

        it('accepts select', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com' }, select: { id: true } }).success).toBe(true);
        });

        it('accepts omit', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com' }, omit: { name: true } }).success).toBe(true);
        });

        it('rejects select and omit together', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            expect(
                s.safeParse({ data: { email: 'u@test.com' }, select: { id: true }, omit: { name: true } }).success,
            ).toBe(false);
        });

        it('rejects unknown field in data', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com', notAField: 'val' } }).success).toBe(false);
        });
    });

    // #endregion

    // #region Update

    describe('makeUpdateSchema', () => {
        it('accepts valid update args', () => {
            const s = client.$zod.makeUpdateSchema('User');
            expect(s.safeParse({ where: { id: 'u1' }, data: { name: 'Alice' } }).success).toBe(true);
        });

        it('accepts update with enum field', () => {
            const s = client.$zod.makeUpdateSchema('User');
            expect(s.safeParse({ where: { id: 'u1' }, data: { role: 'ADMIN' } }).success).toBe(true);
        });

        it('accepts update with nested relation', () => {
            const s = client.$zod.makeUpdateSchema('User');
            expect(
                s.safeParse({
                    where: { id: 'u1' },
                    data: { posts: { create: { title: 'New Post' } } },
                }).success,
            ).toBe(true);
        });

        it('rejects missing where', () => {
            const s = client.$zod.makeUpdateSchema('User');
            expect(s.safeParse({ data: { name: 'Alice' } }).success).toBe(false);
        });

        it('rejects missing data', () => {
            const s = client.$zod.makeUpdateSchema('User');
            expect(s.safeParse({ where: { id: 'u1' } }).success).toBe(false);
        });

        it('rejects non-unique where', () => {
            const s = client.$zod.makeUpdateSchema('User');
            // name is not a unique field
            expect(s.safeParse({ where: { name: 'Alice' }, data: { name: 'Bob' } }).success).toBe(false);
        });

        it('rejects invalid enum value in data', () => {
            const s = client.$zod.makeUpdateSchema('User');
            expect(s.safeParse({ where: { id: 'u1' }, data: { role: 'INVALID' } }).success).toBe(false);
        });
    });

    describe('makeUpdateManySchema', () => {
        it('accepts valid updateMany (where is optional)', () => {
            const s = client.$zod.makeUpdateManySchema('User');
            expect(s.safeParse({ data: { name: 'Updated' } }).success).toBe(true);
        });

        it('accepts updateMany with non-unique where', () => {
            const s = client.$zod.makeUpdateManySchema('User');
            expect(s.safeParse({ where: { role: 'USER' }, data: { name: 'Updated' } }).success).toBe(true);
        });

        it('rejects missing data', () => {
            const s = client.$zod.makeUpdateManySchema('User');
            expect(s.safeParse({ where: { role: 'USER' } }).success).toBe(false);
        });
    });

    describe('makeUpdateManyAndReturnSchema', () => {
        it('accepts minimal valid args (data required)', () => {
            const s = client.$zod.makeUpdateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { name: 'Updated' } }).success).toBe(true);
        });

        it('accepts where clause', () => {
            const s = client.$zod.makeUpdateManyAndReturnSchema('User');
            expect(s.safeParse({ where: { role: 'USER' }, data: { name: 'Updated' } }).success).toBe(true);
        });

        it('accepts select', () => {
            const s = client.$zod.makeUpdateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { name: 'Updated' }, select: { id: true } }).success).toBe(true);
        });

        it('accepts omit', () => {
            const s = client.$zod.makeUpdateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { name: 'Updated' }, omit: { name: true } }).success).toBe(true);
        });

        it('rejects select and omit together', () => {
            const s = client.$zod.makeUpdateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { name: 'Updated' }, select: { id: true }, omit: { name: true } }).success).toBe(
                false,
            );
        });

        it('rejects missing data', () => {
            const s = client.$zod.makeUpdateManyAndReturnSchema('User');
            expect(s.safeParse({ where: { role: 'USER' } }).success).toBe(false);
        });

        it('rejects invalid enum in data', () => {
            const s = client.$zod.makeUpdateManyAndReturnSchema('User');
            expect(s.safeParse({ data: { role: 'INVALID' } }).success).toBe(false);
        });
    });

    describe('makeUpsertSchema', () => {
        it('accepts valid upsert args', () => {
            const s = client.$zod.makeUpsertSchema('User');
            expect(
                s.safeParse({
                    where: { id: 'u1' },
                    create: { email: 'u@test.com' },
                    update: { name: 'Alice' },
                }).success,
            ).toBe(true);
        });

        it('rejects missing create', () => {
            const s = client.$zod.makeUpsertSchema('User');
            expect(s.safeParse({ where: { id: 'u1' }, update: { name: 'Alice' } }).success).toBe(false);
        });

        it('rejects missing update', () => {
            const s = client.$zod.makeUpsertSchema('User');
            expect(s.safeParse({ where: { id: 'u1' }, create: { email: 'u@test.com' } }).success).toBe(false);
        });

        it('rejects missing where', () => {
            const s = client.$zod.makeUpsertSchema('User');
            expect(s.safeParse({ create: { email: 'u@test.com' }, update: { name: 'Alice' } }).success).toBe(false);
        });

        it('rejects invalid enum in create', () => {
            const s = client.$zod.makeUpsertSchema('User');
            expect(
                s.safeParse({
                    where: { id: 'u1' },
                    create: { email: 'u@test.com', role: 'BAD' },
                    update: {},
                }).success,
            ).toBe(false);
        });
    });

    // #endregion

    // #region Delete

    describe('makeDeleteSchema', () => {
        it('accepts valid delete args with unique where', () => {
            const s = client.$zod.makeDeleteSchema('User');
            expect(s.safeParse({ where: { id: 'u1' } }).success).toBe(true);
        });

        it('accepts unique email in where', () => {
            const s = client.$zod.makeDeleteSchema('User');
            expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
        });

        it('rejects missing where', () => {
            const s = client.$zod.makeDeleteSchema('User');
            expect(s.safeParse({}).success).toBe(false);
        });

        it('rejects empty where', () => {
            const s = client.$zod.makeDeleteSchema('User');
            expect(s.safeParse({ where: {} }).success).toBe(false);
        });

        it('rejects non-unique where field', () => {
            const s = client.$zod.makeDeleteSchema('User');
            expect(s.safeParse({ where: { name: 'Alice' } }).success).toBe(false);
        });
    });

    describe('makeDeleteManySchema', () => {
        it('accepts undefined (where optional, deletes all)', () => {
            const s = client.$zod.makeDeleteManySchema('User');
            expect(s.safeParse(undefined).success).toBe(true);
        });

        it('accepts non-unique where', () => {
            const s = client.$zod.makeDeleteManySchema('User');
            expect(s.safeParse({ where: { role: 'USER' } }).success).toBe(true);
        });

        it('rejects unknown where field', () => {
            const s = client.$zod.makeDeleteManySchema('User');
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });
    });

    // #endregion

    // #region Aggregation

    describe('makeCountSchema', () => {
        it('accepts undefined (all optional)', () => {
            const s = client.$zod.makeCountSchema('User');
            expect(s.safeParse(undefined).success).toBe(true);
        });

        it('accepts where clause', () => {
            const s = client.$zod.makeCountSchema('User');
            expect(s.safeParse({ where: { role: 'USER' } }).success).toBe(true);
        });

        it('accepts select: true (count all)', () => {
            const s = client.$zod.makeCountSchema('User');
            expect(s.safeParse({ select: true }).success).toBe(true);
        });

        it('accepts select with field names', () => {
            const s = client.$zod.makeCountSchema('User');
            expect(s.safeParse({ select: { id: true, email: true } }).success).toBe(true);
        });

        it('accepts take and skip', () => {
            const s = client.$zod.makeCountSchema('User');
            expect(s.safeParse({ take: 10, skip: 5 }).success).toBe(true);
        });

        it('accepts orderBy', () => {
            const s = client.$zod.makeCountSchema('User');
            expect(s.safeParse({ orderBy: { email: 'asc' } }).success).toBe(true);
        });

        it('rejects unknown where field', () => {
            const s = client.$zod.makeCountSchema('User');
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });
    });

    describe('makeAggregateSchema', () => {
        it('accepts undefined (all optional)', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse(undefined).success).toBe(true);
        });

        it('accepts where clause', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ where: { role: 'USER' } }).success).toBe(true);
        });

        it('accepts _count: true', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ _count: true }).success).toBe(true);
        });

        it('accepts _count with field selection', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ _count: { id: true, email: true } }).success).toBe(true);
        });

        it('accepts _avg on numeric fields', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ _avg: { age: true } }).success).toBe(true);
        });

        it('accepts _sum on numeric fields', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ _sum: { age: true } }).success).toBe(true);
        });

        it('accepts _min and _max on non-array non-relation fields', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ _min: { age: true, email: true }, _max: { age: true } }).success).toBe(true);
        });

        it('accepts take and skip', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ take: 10, skip: 5 }).success).toBe(true);
        });

        it('accepts orderBy', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ orderBy: { age: 'asc' } }).success).toBe(true);
        });

        it('rejects unknown where field', () => {
            const s = client.$zod.makeAggregateSchema('User');
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });
    });

    describe('makeGroupBySchema', () => {
        it('accepts single field in by', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'role' }).success).toBe(true);
        });

        it('accepts multiple fields in by as array', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: ['role', 'name'] }).success).toBe(true);
        });

        it('rejects missing by', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({}).success).toBe(false);
        });

        it('rejects relation field in by', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'posts' }).success).toBe(false);
        });

        it('accepts where clause', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'role', where: { role: 'USER' } }).success).toBe(true);
        });

        it('accepts _count aggregation', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'role', _count: true }).success).toBe(true);
        });

        it('accepts _avg on numeric fields', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'role', _avg: { age: true } }).success).toBe(true);
        });

        it('accepts orderBy matching the by field', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'role', orderBy: { role: 'asc' } }).success).toBe(true);
        });

        it('rejects orderBy with a field not in by (without aggregation)', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'role', orderBy: { name: 'asc' } }).success).toBe(false);
        });

        it('accepts take and skip', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'role', take: 10, skip: 0 }).success).toBe(true);
        });

        it('rejects unknown field in by', () => {
            const s = client.$zod.makeGroupBySchema('User');
            expect(s.safeParse({ by: 'notAField' }).success).toBe(false);
        });
    });

    // #endregion

    // #region Slicing

    describe('slicing - model exclusion', () => {
        it('excluded model relation is rejected in select', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: { excludedModels: ['Post'] },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                // 'posts' relation is excluded → rejected by strict schema
                expect(s.safeParse({ select: { posts: true } }).success).toBe(false);
                // scalar fields are unaffected
                expect(s.safeParse({ select: { id: true, email: true } }).success).toBe(true);
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('excluded model relation is rejected in include', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: { excludedModels: ['Post'] },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                expect(s.safeParse({ include: { posts: true } }).success).toBe(false);
                // 'profile' is not excluded, still allowed
                expect(s.safeParse({ include: { profile: true } }).success).toBe(true);
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('excluded model relation is rejected in create data', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: { excludedModels: ['Post'] },
            });
            try {
                const s = slicingClient.$zod.makeCreateSchema('User');
                expect(
                    s.safeParse({
                        data: { email: 'u@test.com', posts: { create: { title: 'Hello' } } },
                    }).success,
                ).toBe(false);
                // without the excluded relation, create still works
                expect(s.safeParse({ data: { email: 'u@test.com' } }).success).toBe(true);
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('excluded model relation is rejected in update data', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: { excludedModels: ['Post'] },
            });
            try {
                const s = slicingClient.$zod.makeUpdateSchema('User');
                expect(
                    s.safeParse({
                        where: { id: 'u1' },
                        data: { posts: { create: { title: 'New Post' } } },
                    }).success,
                ).toBe(false);
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('includedModels restricts relations to allowed models only', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: { includedModels: ['User', 'Profile'] },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                // Post is not included → posts relation rejected
                expect(s.safeParse({ include: { posts: true } }).success).toBe(false);
                // Profile is included → profile relation accepted
                expect(s.safeParse({ include: { profile: true } }).success).toBe(true);
            } finally {
                await slicingClient.$disconnect();
            }
        });
    });

    describe('slicing - filter kinds', () => {
        it('includedFilterKinds restricts to equality operators only', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: {
                    models: {
                        user: { fields: { $all: { includedFilterKinds: ['Equality'] as const } } },
                    },
                },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                // equality operators accepted
                expect(s.safeParse({ where: { age: { equals: 25 } } }).success).toBe(true);
                expect(s.safeParse({ where: { email: { in: ['a@b.com'] } } }).success).toBe(true);
                // direct value still accepted (equality)
                expect(s.safeParse({ where: { age: 25 } }).success).toBe(true);
                // range operators rejected
                expect(s.safeParse({ where: { age: { gt: 18 } } }).success).toBe(false);
                expect(s.safeParse({ where: { age: { lte: 65 } } }).success).toBe(false);
                expect(s.safeParse({ where: { age: { between: [10, 50] } } }).success).toBe(false);
                // like operators rejected
                expect(s.safeParse({ where: { email: { contains: 'test' } } }).success).toBe(false);
                expect(s.safeParse({ where: { email: { startsWith: 'u' } } }).success).toBe(false);
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('excludedFilterKinds removes specified operators while keeping others', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: {
                    models: {
                        user: { fields: { $all: { excludedFilterKinds: ['Range'] as const } } },
                    },
                },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                // equality operators still work
                expect(s.safeParse({ where: { age: { equals: 25 } } }).success).toBe(true);
                // like operators still work for string fields
                expect(s.safeParse({ where: { email: { contains: 'test' } } }).success).toBe(true);
                // direct value still works
                expect(s.safeParse({ where: { age: 25 } }).success).toBe(true);
                // range operators rejected
                expect(s.safeParse({ where: { age: { gt: 18 } } }).success).toBe(false);
                expect(s.safeParse({ where: { age: { lte: 65 } } }).success).toBe(false);
                expect(s.safeParse({ where: { age: { between: [10, 50] } } }).success).toBe(false);
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('field-level filter overrides model-level $all', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: {
                    models: {
                        user: {
                            fields: {
                                $all: { includedFilterKinds: ['Equality'] as const },
                                // 'name' additionally allows Like operators
                                name: { includedFilterKinds: ['Equality', 'Like'] as const },
                            },
                        },
                    },
                },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                // 'name' has field-level override: allows Like
                expect(s.safeParse({ where: { name: { contains: 'Alice' } } }).success).toBe(true);
                expect(s.safeParse({ where: { name: { startsWith: 'A' } } }).success).toBe(true);
                // 'email' falls back to $all: Equality only
                expect(s.safeParse({ where: { email: { contains: 'test' } } }).success).toBe(false);
                expect(s.safeParse({ where: { email: { equals: 'a@b.com' } } }).success).toBe(true);
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('$all models fallback applies filter restrictions across all models', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: {
                    models: {
                        $all: { fields: { $all: { includedFilterKinds: ['Equality'] as const } } },
                    },
                },
            });
            try {
                const userSchema = slicingClient.$zod.makeFindManySchema('User');
                const postSchema = slicingClient.$zod.makeFindManySchema('Post');
                // equality works for both models
                expect(userSchema.safeParse({ where: { email: { equals: 'u@test.com' } } }).success).toBe(true);
                expect(postSchema.safeParse({ where: { published: { equals: true } } }).success).toBe(true);
                // range/like rejected for both models
                expect(userSchema.safeParse({ where: { age: { gt: 18 } } }).success).toBe(false);
                expect(postSchema.safeParse({ where: { title: { contains: 'hello' } } }).success).toBe(false);
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('Relation filter kind exclusion rejects relation-style filters on a field', async () => {
            const slicingClient = await createTestClient(schema, {
                slicing: {
                    models: {
                        user: {
                            fields: {
                                posts: { excludedFilterKinds: ['Relation'] as const },
                            },
                        },
                    },
                },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                // relation-style filters on 'posts' are excluded
                expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(false);
                expect(s.safeParse({ where: { posts: { every: { published: true } } } }).success).toBe(false);
                // scalar fields on the same model are unaffected
                expect(s.safeParse({ where: { email: { equals: 'u@test.com' } } }).success).toBe(true);
            } finally {
                await slicingClient.$disconnect();
            }
        });
    });

    describe('slicing - typing', () => {
        it('model exclusion removes relation field from include type', async () => {
            type ExcludePostOptions = ClientOptions<typeof schema> & {
                slicing: { excludedModels: readonly ['Post'] };
            };
            const slicingClient = await createTestClient<typeof schema, ExcludePostOptions>(schema, {
                slicing: { excludedModels: ['Post'] as const },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                type Include = NonNullable<NonNullable<z.infer<typeof s>>['include']>;
                // 'posts' relation is excluded → not in include type
                expectTypeOf<Include>().not.toHaveProperty('posts');
                // 'profile' is not excluded → still in include type
                expectTypeOf<Include>().toHaveProperty('profile');
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('includedModels restricts relation fields in include type', async () => {
            type IncludeUserProfileOptions = ClientOptions<typeof schema> & {
                slicing: { includedModels: readonly ['User', 'Profile'] };
            };
            const slicingClient = await createTestClient<typeof schema, IncludeUserProfileOptions>(schema, {
                slicing: { includedModels: ['User', 'Profile'] as const },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                type Include = NonNullable<NonNullable<z.infer<typeof s>>['include']>;
                // 'profile' points to Profile which is included
                expectTypeOf<Include>().toHaveProperty('profile');
                // 'posts' points to Post which is NOT in includedModels → not in include type
                expectTypeOf<Include>().not.toHaveProperty('posts');
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('includedFilterKinds: Equality removes Range operators from number filter type', async () => {
            type EqualityOnlyOptions = ClientOptions<typeof schema> & {
                slicing: {
                    models: {
                        user: { fields: { $all: { includedFilterKinds: readonly ['Equality'] } } };
                    };
                };
            };
            const slicingClient = await createTestClient<typeof schema, EqualityOnlyOptions>(schema, {
                slicing: {
                    models: { user: { fields: { $all: { includedFilterKinds: ['Equality'] as const } } } },
                },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                type Where = NonNullable<NonNullable<z.infer<typeof s>>['where']>;
                // Range operators are excluded → type error
                // @ts-expect-error 'gt' is not a valid operator when only Equality is included
                const _rangeInvalid: Where = { age: { gt: 25 } };
                void _rangeInvalid;
                // Equality operators are still valid
                const _equalityValid: Where = { age: { equals: 25 } };
                void _equalityValid;
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('includedFilterKinds: Equality removes Like operators from string filter type', async () => {
            type EqualityOnlyOptions = ClientOptions<typeof schema> & {
                slicing: {
                    models: {
                        user: { fields: { $all: { includedFilterKinds: readonly ['Equality'] } } };
                    };
                };
            };
            const slicingClient = await createTestClient<typeof schema, EqualityOnlyOptions>(schema, {
                slicing: {
                    models: { user: { fields: { $all: { includedFilterKinds: ['Equality'] as const } } } },
                },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                type Where = NonNullable<NonNullable<z.infer<typeof s>>['where']>;
                // Like operators are excluded → type error
                // @ts-expect-error 'contains' is not a valid operator when only Equality is included
                const _likeInvalid: Where = { email: { contains: 'test' } };
                void _likeInvalid;
                // Equality operators are still valid
                const _equalityValid: Where = { email: { equals: 'test@example.com' } };
                void _equalityValid;
            } finally {
                await slicingClient.$disconnect();
            }
        });

        it('excludedFilterKinds: Range removes range operators while keeping equality and like', async () => {
            type ExcludeRangeOptions = ClientOptions<typeof schema> & {
                slicing: {
                    models: {
                        user: { fields: { $all: { excludedFilterKinds: readonly ['Range'] } } };
                    };
                };
            };
            const slicingClient = await createTestClient<typeof schema, ExcludeRangeOptions>(schema, {
                slicing: {
                    models: { user: { fields: { $all: { excludedFilterKinds: ['Range'] as const } } } },
                },
            });
            try {
                const s = slicingClient.$zod.makeFindManySchema('User');
                type Where = NonNullable<NonNullable<z.infer<typeof s>>['where']>;
                // Range operators are excluded → type error
                // @ts-expect-error 'gt' is not a valid operator when Range is excluded
                const _rangeInvalid: Where = { age: { gt: 25 } };
                void _rangeInvalid;
                // Equality operators are still valid
                const _equalityValid: Where = { age: { equals: 25 } };
                void _equalityValid;
                // Like operators on string fields are still valid
                const _likeValid: Where = { email: { contains: 'test' } };
                void _likeValid;
            } finally {
                await slicingClient.$disconnect();
            }
        });
    });

    // #endregion

    // #region Plugin query args

    describe('plugin - query args extension', () => {
        const cachePlugin = definePlugin({
            id: 'cache',
            queryArgs: {
                $read: z.object({ cache: z.strictObject({ ttl: z.number().min(0).optional() }).optional() }),
                $create: z.object({ cache: z.strictObject({ bust: z.boolean().optional() }).optional() }),
            },
        });

        it('extended read args are accepted by find schema', () => {
            const extClient = client.$use(cachePlugin);
            const s = extClient.$zod.makeFindManySchema('User');
            expect(s.safeParse({ cache: { ttl: 1000 } }).success).toBe(true);
        });

        it('extended read args are validated (min constraint)', () => {
            const extClient = client.$use(cachePlugin);
            const s = extClient.$zod.makeFindManySchema('User');
            expect(s.safeParse({ cache: { ttl: -1 } }).success).toBe(false);
        });

        it('strict validation rejects unknown plugin arg keys', () => {
            const extClient = client.$use(cachePlugin);
            const s = extClient.$zod.makeFindManySchema('User');
            expect(s.safeParse({ cache: { ttl: 100, unknown: true } }).success).toBe(false);
        });

        it('create-specific extended args are accepted by create schema', () => {
            const extClient = client.$use(cachePlugin);
            const s = extClient.$zod.makeCreateSchema('User');
            expect(s.safeParse({ data: { email: 'u@test.com' }, cache: { bust: true } }).success).toBe(true);
        });

        it('base client schema rejects extended args', () => {
            const s = client.$zod.makeFindManySchema('User');
            expect(s.safeParse({ cache: { ttl: 1000 } }).success).toBe(false);
        });

        it('$all extended args appear in all operation schemas', () => {
            const sourcePlugin = definePlugin({
                id: 'source',
                queryArgs: {
                    $all: z.object({ source: z.string().optional() }),
                },
            });
            const extClient = client.$use(sourcePlugin);
            expect(extClient.$zod.makeFindManySchema('User').safeParse({ source: 'web' }).success).toBe(true);
            expect(
                extClient.$zod.makeCreateSchema('User').safeParse({ data: { email: 'u@test.com' }, source: 'web' })
                    .success,
            ).toBe(true);
        });
    });

    describe('plugin - query args extension typing', () => {
        const cachePlugin = definePlugin({
            id: 'cache',
            queryArgs: {
                $read: z.object({ cache: z.object({ ttl: z.number().optional() }).optional() }),
                $create: z.object({ cache: z.object({ bust: z.boolean().optional() }).optional() }),
            },
        });

        it('find schema includes extended read args in type', () => {
            const extClient = client.$use(cachePlugin);
            const s = extClient.$zod.makeFindManySchema('User');
            type Args = NonNullable<z.infer<typeof s>>;
            expectTypeOf<Args>().toHaveProperty('cache');
            expectTypeOf<NonNullable<Args['cache']>>().toHaveProperty('ttl');
        });

        it('create schema includes create-specific extended args in type', () => {
            const extClient = client.$use(cachePlugin);
            const s = extClient.$zod.makeCreateSchema('User');
            type Args = z.infer<typeof s>;
            expectTypeOf<Args>().toHaveProperty('cache');
            // @ts-expect-error 'ttl' belongs to $read args, not $create args
            const _invalid: Args = { data: { email: 'u@test.com' }, cache: { ttl: 1000 } };
            void _invalid;
        });

        it('$all extended args appear in all schema types', () => {
            const sourcePlugin = definePlugin({
                id: 'source',
                queryArgs: {
                    $all: z.object({ source: z.string().optional() }),
                },
            });
            const extClient = client.$use(sourcePlugin);
            const findSchema = extClient.$zod.makeFindManySchema('User');
            type FindArgs = NonNullable<z.infer<typeof findSchema>>;
            expectTypeOf<FindArgs>().toHaveProperty('source');
            const createSchema = extClient.$zod.makeCreateSchema('User');
            type CreateArgs = z.infer<typeof createSchema>;
            expectTypeOf<CreateArgs>().toHaveProperty('source');
        });
    });

    // #endregion

    // #region $zod typing

    describe('$zod typing', () => {
        it('makeFindManySchema returns a typed schema', () => {
            const s = client.$zod.makeFindManySchema('User');
            type Args = z.infer<typeof s>;
            // all find args are optional
            expectTypeOf<NonNullable<Args>>().toHaveProperty('where');
            expectTypeOf<NonNullable<Args>>().toHaveProperty('take');
            expectTypeOf<NonNullable<Args>>().toHaveProperty('skip');
            expectTypeOf<NonNullable<Args>>().toHaveProperty('orderBy');
            expectTypeOf<NonNullable<Args>>().toHaveProperty('select');
            expectTypeOf<NonNullable<Args>>().toHaveProperty('include');
            expectTypeOf<NonNullable<Args>>().toHaveProperty('cursor');
        });

        it('makeFindUniqueSchema returns a typed schema', () => {
            const s = client.$zod.makeFindUniqueSchema('User');
            type Args = z.infer<typeof s>;
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('include');
            // where has id and email (unique fields)
            expectTypeOf<Args['where']>().toHaveProperty('id');
            expectTypeOf<Args['where']>().toHaveProperty('email');
        });

        it('makeFindFirstSchema returns a typed schema', () => {
            const s = client.$zod.makeFindFirstSchema('User');
            type Args = z.infer<typeof s>;
            expectTypeOf<NonNullable<Args>>().toHaveProperty('where');
            expectTypeOf<NonNullable<Args>>().toHaveProperty('take');
        });

        it('makeCreateSchema returns a typed schema', () => {
            const s = client.$zod.makeCreateSchema('User');
            type Args = z.infer<typeof s>;
            // data is required
            expectTypeOf<Args>().toHaveProperty('data');
            // select / include / omit are optional
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('include');
            expectTypeOf<Args>().toHaveProperty('omit');
            // data has required field email and optional field name
            expectTypeOf<Args['data']>().toHaveProperty('email');
            expectTypeOf<Args['data']>().toHaveProperty('name');
        });

        it('makeCreateManySchema returns a typed schema', () => {
            const s = client.$zod.makeCreateManySchema('User');
            type Args = z.infer<typeof s>;
            // data is required
            expectTypeOf<Args>().toHaveProperty('data');
            // skipDuplicates is optional
            expectTypeOf<Args>().toHaveProperty('skipDuplicates');
            // no select / include on createMany
            expectTypeOf<Args>().not.toHaveProperty('select');
            expectTypeOf<Args>().not.toHaveProperty('include');
        });

        it('makeCreateManyAndReturnSchema returns a typed schema', () => {
            const s = client.$zod.makeCreateManyAndReturnSchema('User');
            type Args = NonNullable<z.infer<typeof s>>;
            // data and skipDuplicates from createMany payload
            expectTypeOf<Args>().toHaveProperty('data');
            expectTypeOf<Args>().toHaveProperty('skipDuplicates');
            // select and omit are supported; include is not
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('omit');
            expectTypeOf<Args>().not.toHaveProperty('include');
        });

        it('makeUpdateSchema returns a typed schema', () => {
            const s = client.$zod.makeUpdateSchema('User');
            type Args = z.infer<typeof s>;
            // where (unique) and data are required
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('data');
            // select / include / omit are present
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('include');
            expectTypeOf<Args>().toHaveProperty('omit');
            // where is limited to unique fields (id and email)
            expectTypeOf<Args['where']>().toHaveProperty('id');
            expectTypeOf<Args['where']>().toHaveProperty('email');
            // data has updatable fields
            expectTypeOf<Args['data']>().toHaveProperty('name');
            expectTypeOf<Args['data']>().toHaveProperty('role');
        });

        it('makeUpdateManySchema returns a typed schema', () => {
            const s = client.$zod.makeUpdateManySchema('User');
            type Args = z.infer<typeof s>;
            // data is required; where and limit are optional
            expectTypeOf<Args>().toHaveProperty('data');
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('limit');
            // no select / include on updateMany
            expectTypeOf<Args>().not.toHaveProperty('select');
            expectTypeOf<Args>().not.toHaveProperty('include');
        });

        it('makeUpdateManyAndReturnSchema returns a typed schema', () => {
            const s = client.$zod.makeUpdateManyAndReturnSchema('User');
            type Args = z.infer<typeof s>;
            // data is required; where and limit are optional
            expectTypeOf<Args>().toHaveProperty('data');
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('limit');
            // select and omit are present; include is not
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('omit');
            expectTypeOf<Args>().not.toHaveProperty('include');
        });

        it('makeUpsertSchema returns a typed schema', () => {
            const s = client.$zod.makeUpsertSchema('User');
            type Args = z.infer<typeof s>;
            // where (unique), create, and update are all required
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('create');
            expectTypeOf<Args>().toHaveProperty('update');
            // select / include / omit are present
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('include');
            expectTypeOf<Args>().toHaveProperty('omit');
            // create has the required email field; update has optional fields
            expectTypeOf<Args['create']>().toHaveProperty('email');
            expectTypeOf<Args['update']>().toHaveProperty('name');
        });

        it('makeDeleteSchema returns a typed schema', () => {
            const s = client.$zod.makeDeleteSchema('User');
            type Args = z.infer<typeof s>;
            // where (unique) is required; no data field
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().not.toHaveProperty('data');
            // select / include / omit are present
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('include');
            expectTypeOf<Args>().toHaveProperty('omit');
            // where is limited to unique fields (id and email)
            expectTypeOf<Args['where']>().toHaveProperty('id');
            expectTypeOf<Args['where']>().toHaveProperty('email');
        });

        it('makeDeleteManySchema returns a typed schema', () => {
            const s = client.$zod.makeDeleteManySchema('User');
            type Args = NonNullable<z.infer<typeof s>>;
            // where and limit are optional; no data field
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('limit');
            expectTypeOf<Args>().not.toHaveProperty('data');
            // no select / include on deleteMany
            expectTypeOf<Args>().not.toHaveProperty('select');
            expectTypeOf<Args>().not.toHaveProperty('include');
        });

        it('makeCountSchema returns a typed schema', () => {
            const s = client.$zod.makeCountSchema('User');
            type Args = NonNullable<z.infer<typeof s>>;
            // where, select, skip, take, orderBy are present
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('select');
            expectTypeOf<Args>().toHaveProperty('skip');
            expectTypeOf<Args>().toHaveProperty('take');
            expectTypeOf<Args>().toHaveProperty('orderBy');
            // no data, include, omit
            expectTypeOf<Args>().not.toHaveProperty('data');
            expectTypeOf<Args>().not.toHaveProperty('include');
        });

        it('makeAggregateSchema returns a typed schema', () => {
            const s = client.$zod.makeAggregateSchema('User');
            type Args = NonNullable<z.infer<typeof s>>;
            // standard query args
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('skip');
            expectTypeOf<Args>().toHaveProperty('take');
            expectTypeOf<Args>().toHaveProperty('orderBy');
            // aggregation operators
            expectTypeOf<Args>().toHaveProperty('_count');
            expectTypeOf<Args>().toHaveProperty('_avg');
            expectTypeOf<Args>().toHaveProperty('_sum');
            expectTypeOf<Args>().toHaveProperty('_min');
            expectTypeOf<Args>().toHaveProperty('_max');
        });

        it('makeGroupBySchema returns a typed schema', () => {
            const s = client.$zod.makeGroupBySchema('User');
            type Args = z.infer<typeof s>;
            // by is required; where, orderBy, having, skip, take, aggregations are optional
            expectTypeOf<Args>().toHaveProperty('by');
            expectTypeOf<Args>().toHaveProperty('where');
            expectTypeOf<Args>().toHaveProperty('orderBy');
            expectTypeOf<Args>().toHaveProperty('having');
            expectTypeOf<Args>().toHaveProperty('skip');
            expectTypeOf<Args>().toHaveProperty('take');
            expectTypeOf<Args>().toHaveProperty('_count');
        });

        it('$zod is typed as ZodSchemaFactory', () => {
            // verify the factory methods exist on the type
            expectTypeOf(client.$zod.makeFindManySchema).toBeFunction();
            expectTypeOf(client.$zod.makeFindUniqueSchema).toBeFunction();
            expectTypeOf(client.$zod.makeFindFirstSchema).toBeFunction();
            expectTypeOf(client.$zod.makeCreateSchema).toBeFunction();
            expectTypeOf(client.$zod.makeCreateManySchema).toBeFunction();
            expectTypeOf(client.$zod.makeCreateManyAndReturnSchema).toBeFunction();
            expectTypeOf(client.$zod.makeUpdateSchema).toBeFunction();
            expectTypeOf(client.$zod.makeUpdateManySchema).toBeFunction();
            expectTypeOf(client.$zod.makeUpdateManyAndReturnSchema).toBeFunction();
            expectTypeOf(client.$zod.makeDeleteSchema).toBeFunction();
            expectTypeOf(client.$zod.makeUpsertSchema).toBeFunction();
            expectTypeOf(client.$zod.makeCountSchema).toBeFunction();
            expectTypeOf(client.$zod.makeAggregateSchema).toBeFunction();
            expectTypeOf(client.$zod.makeGroupBySchema).toBeFunction();
            expectTypeOf(client.$zod.makeExistsSchema).toBeFunction();
        });
    });

    // #endregion

    // #region ZodSchemaFactory standalone constructor

    describe('create factory functions tests', () => {
        it('can be constructed directly from client', async () => {
            const client = await createTestClient(schema);
            const factory = createQuerySchemaFactory(client);
            const s = factory.makeFindManySchema('User');
            expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });

        it('can be constructed directly from schema and options and produces equivalent schemas', () => {
            const factory = createQuerySchemaFactory(schema);
            const s = factory.makeFindManySchema('User');
            expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });
    });

    // #endregion
});
