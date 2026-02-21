import { createQuerySchemaFactory, definePlugin, type ClientContract } from '@zenstackhq/orm';
import { createTestClient, getTestDbProvider } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe as _describe, expect, it } from 'vitest';
import z from 'zod';
import { schema } from '../schemas/basic';

// only run for sqlite because schemas are provider independent
const describe = getTestDbProvider() === 'sqlite' ? _describe : _describe.skip;

describe('Zod schema factory test', () => {
    if (getTestDbProvider() !== 'sqlite') {
        return;
    }

    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    describe('CRUD schemas tests', () => {
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
                expect(
                    s.safeParse({ where: { id: 'u1' }, select: { id: true }, include: { posts: true } }).success,
                ).toBe(false);
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
                    s.safeParse({ data: { email: 'u@test.com' }, select: { id: true }, include: { posts: true } })
                        .success,
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
                expect(
                    s.safeParse({ data: { name: 'Updated' }, select: { id: true }, omit: { name: true } }).success,
                ).toBe(false);
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
    });

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

    // #endregion

    // #region ZodSchemaFactory standalone constructor

    describe('create factory functions tests', () => {
        it('can be constructed directly from client', async () => {
            try {
                const client = await createTestClient(schema);
                const factory = createQuerySchemaFactory(client);
                const s = factory.makeFindManySchema('User');
                expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
                expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
            } finally {
                await client.$disconnect();
            }
        });

        it('can be constructed directly from schema and options and produces equivalent schemas', () => {
            const factory = createQuerySchemaFactory(schema);
            const s = factory.makeFindManySchema('User');
            expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
            expect(s.safeParse({ where: { notAField: 'val' } }).success).toBe(false);
        });
    });

    // #endregion

    // #region makeProcedureParamSchema

    describe('makeProcedureParamSchema', () => {
        it('works with scalar types', () => {
            const s = client.$zod.makeProcedureParamSchema({ type: 'String' });
            expect(s.safeParse('hello').success).toBe(true);
            expect(s.safeParse(42).success).toBe(false);
        });

        it('works with array types', () => {
            const s = client.$zod.makeProcedureParamSchema({ type: 'String', array: true });
            expect(s.safeParse(['a', 'b', 'c']).success).toBe(true);
            expect(s.safeParse('a').success).toBe(false);
            expect(s.safeParse([1, 2, 3]).success).toBe(false);
        });

        it('works with optional types', () => {
            const s = client.$zod.makeProcedureParamSchema({ type: 'String', optional: true });
            expect(s.safeParse('hello').success).toBe(true);
            expect(s.safeParse(undefined).success).toBe(true);
            expect(s.safeParse(42).success).toBe(false);
        });

        it('works with array and optional types combined', () => {
            const s = client.$zod.makeProcedureParamSchema({ type: 'Int', array: true, optional: true });
            expect(s.safeParse([1, 2, 3]).success).toBe(true);
            expect(s.safeParse(undefined).success).toBe(true);
            expect(s.safeParse(1).success).toBe(false);
        });

        it('throws for unsupported type', () => {
            expect(() => client.$zod.makeProcedureParamSchema({ type: 'NotAType' })).toThrow();
        });
    });

    // #endregion

    // #region CreateSchemaOptions depth

    describe('CreateSchemaOptions depth', () => {
        // --- Find schemas ---

        describe('makeFindManySchema with depth', () => {
            it('relationDepth: 0 rejects relation where filters', () => {
                const s = client.$zod.makeFindManySchema('User', { relationDepth: 0 });
                // scalar where still works
                expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
                // relation filter rejected
                expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(false);
            });

            it('relationDepth: 0 rejects relation in select', () => {
                const s = client.$zod.makeFindManySchema('User', { relationDepth: 0 });
                // scalar select works
                expect(s.safeParse({ select: { id: true, email: true } }).success).toBe(true);
                // relation select rejected
                expect(s.safeParse({ select: { posts: true } }).success).toBe(false);
            });

            it('relationDepth: 0 rejects relation in include', () => {
                const s = client.$zod.makeFindManySchema('User', { relationDepth: 0 });
                // relation include rejected
                expect(s.safeParse({ include: { posts: true } }).success).toBe(false);
            });

            it('relationDepth: 0 rejects relation in orderBy', () => {
                const s = client.$zod.makeFindManySchema('User', { relationDepth: 0 });
                // scalar orderBy works
                expect(s.safeParse({ orderBy: { email: 'asc' } }).success).toBe(true);
                // relation orderBy rejected
                expect(s.safeParse({ orderBy: { posts: { _count: 'desc' } } }).success).toBe(false);
            });

            it('relationDepth: 1 allows one level of relation nesting', () => {
                const s = client.$zod.makeFindManySchema('User', { relationDepth: 1 });
                // relation where allowed
                expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(true);
                // relation select allowed
                expect(s.safeParse({ select: { id: true, posts: true } }).success).toBe(true);
                // relation include allowed
                expect(s.safeParse({ include: { posts: true } }).success).toBe(true);
            });

            it('relationDepth: 1 rejects two levels of relation nesting in where', () => {
                const s = client.$zod.makeFindManySchema('User', { relationDepth: 1 });
                // User -> posts -> comments (2 levels) rejected
                expect(
                    s.safeParse({
                        where: { posts: { some: { comments: { some: { content: 'hi' } } } } },
                    }).success,
                ).toBe(false);
            });

            it('relationDepth: 1 rejects two levels of relation nesting in select', () => {
                const s = client.$zod.makeFindManySchema('User', { relationDepth: 1 });
                // nested relation in select rejected - can select posts but posts cannot select comments
                expect(
                    s.safeParse({
                        select: { posts: { select: { comments: true } } },
                    }).success,
                ).toBe(false);
            });

            it('relationDepth: 2 allows two levels of relation nesting', () => {
                const s = client.$zod.makeFindManySchema('User', { relationDepth: 2 });
                // User -> posts -> comments (2 levels) allowed
                expect(
                    s.safeParse({
                        where: { posts: { some: { comments: { some: { content: 'hi' } } } } },
                    }).success,
                ).toBe(true);
                // nested relation in select allowed
                expect(
                    s.safeParse({
                        select: { posts: { select: { comments: true } } },
                    }).success,
                ).toBe(true);
            });

            it('no options behaves as unlimited depth', () => {
                const s = client.$zod.makeFindManySchema('User');
                // deep nesting works
                expect(
                    s.safeParse({
                        where: { posts: { some: { comments: { some: { content: 'hi' } } } } },
                    }).success,
                ).toBe(true);
                expect(
                    s.safeParse({
                        select: { posts: { select: { comments: true } } },
                    }).success,
                ).toBe(true);
            });
        });

        describe('makeFindUniqueSchema with depth', () => {
            it('relationDepth: 0 limits to scalar where', () => {
                const s = client.$zod.makeFindUniqueSchema('User', { relationDepth: 0 });
                expect(s.safeParse({ where: { id: 'abc' } }).success).toBe(true);
                expect(s.safeParse({ where: { id: 'abc' }, select: { posts: true } }).success).toBe(false);
            });
        });

        describe('makeFindFirstSchema with depth', () => {
            it('relationDepth: 0 limits to scalar fields', () => {
                const s = client.$zod.makeFindFirstSchema('User', { relationDepth: 0 });
                expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
                expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(false);
            });
        });

        // --- Exists schema ---

        describe('makeExistsSchema with depth', () => {
            it('relationDepth: 0 rejects relation filters', () => {
                const s = client.$zod.makeExistsSchema('User', { relationDepth: 0 });
                expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
                expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(false);
            });
        });

        // --- Create schemas ---

        describe('makeCreateSchema with depth', () => {
            it('relationDepth: 0 rejects nested relation create', () => {
                const s = client.$zod.makeCreateSchema('User', { relationDepth: 0 });
                // scalar-only create works
                expect(s.safeParse({ data: { email: 'u@test.com' } }).success).toBe(true);
                // nested relation create rejected
                expect(
                    s.safeParse({
                        data: {
                            email: 'u@test.com',
                            posts: { create: { title: 'Post' } },
                        },
                    }).success,
                ).toBe(false);
            });

            it('relationDepth: 1 allows one level of nested create', () => {
                const s = client.$zod.makeCreateSchema('User', { relationDepth: 1 });
                // one level nested create allowed
                expect(
                    s.safeParse({
                        data: {
                            email: 'u@test.com',
                            posts: { create: { title: 'Post' } },
                        },
                    }).success,
                ).toBe(true);
            });

            it('relationDepth: 1 rejects two levels of nested create', () => {
                const s = client.$zod.makeCreateSchema('User', { relationDepth: 1 });
                // two levels nested create rejected (posts -> comments)
                expect(
                    s.safeParse({
                        data: {
                            email: 'u@test.com',
                            posts: {
                                create: {
                                    title: 'Post',
                                    comments: { create: { content: 'Comment' } },
                                },
                            },
                        },
                    }).success,
                ).toBe(false);
            });

            it('relationDepth: 0 rejects relation in select', () => {
                const s = client.$zod.makeCreateSchema('User', { relationDepth: 0 });
                expect(
                    s.safeParse({
                        data: { email: 'u@test.com' },
                        select: { posts: true },
                    }).success,
                ).toBe(false);
            });
        });

        describe('makeCreateManySchema with depth', () => {
            it('relationDepth: 0 accepts scalar-only data', () => {
                const s = client.$zod.makeCreateManySchema('User', { relationDepth: 0 });
                expect(s.safeParse({ data: [{ email: 'u@test.com' }] }).success).toBe(true);
            });
        });

        // --- Update schemas ---

        describe('makeUpdateSchema with depth', () => {
            it('relationDepth: 0 rejects nested relation update', () => {
                const s = client.$zod.makeUpdateSchema('User', { relationDepth: 0 });
                // scalar-only update works
                expect(s.safeParse({ where: { id: 'abc' }, data: { name: 'New Name' } }).success).toBe(true);
                // nested relation update rejected
                expect(
                    s.safeParse({
                        where: { id: 'abc' },
                        data: { posts: { create: { title: 'Post' } } },
                    }).success,
                ).toBe(false);
            });

            it('relationDepth: 1 allows one level of nested update', () => {
                const s = client.$zod.makeUpdateSchema('User', { relationDepth: 1 });
                expect(
                    s.safeParse({
                        where: { id: 'abc' },
                        data: { posts: { create: { title: 'Post' } } },
                    }).success,
                ).toBe(true);
            });
        });

        describe('makeUpsertSchema with depth', () => {
            it('relationDepth: 0 rejects nested relations in create/update data', () => {
                const s = client.$zod.makeUpsertSchema('User', { relationDepth: 0 });
                // scalar upsert works
                expect(
                    s.safeParse({
                        where: { id: 'abc' },
                        create: { email: 'u@test.com' },
                        update: { name: 'New' },
                    }).success,
                ).toBe(true);
                // nested relation in create rejected
                expect(
                    s.safeParse({
                        where: { id: 'abc' },
                        create: { email: 'u@test.com', posts: { create: { title: 'Post' } } },
                        update: { name: 'New' },
                    }).success,
                ).toBe(false);
            });
        });

        // --- Delete schemas ---

        describe('makeDeleteSchema with depth', () => {
            it('relationDepth: 0 rejects relation in select/include', () => {
                const s = client.$zod.makeDeleteSchema('User', { relationDepth: 0 });
                expect(s.safeParse({ where: { id: 'abc' } }).success).toBe(true);
                expect(s.safeParse({ where: { id: 'abc' }, select: { posts: true } }).success).toBe(false);
                expect(s.safeParse({ where: { id: 'abc' }, include: { posts: true } }).success).toBe(false);
            });
        });

        describe('makeDeleteManySchema with depth', () => {
            it('relationDepth: 0 rejects relation where filters', () => {
                const s = client.$zod.makeDeleteManySchema('User', { relationDepth: 0 });
                expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
                expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(false);
            });
        });

        // --- Count / Aggregate / GroupBy ---

        describe('makeCountSchema with depth', () => {
            it('relationDepth: 0 rejects relation where and orderBy', () => {
                const s = client.$zod.makeCountSchema('User', { relationDepth: 0 });
                expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
                expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(false);
            });
        });

        describe('makeAggregateSchema with depth', () => {
            it('relationDepth: 0 rejects relation where', () => {
                const s = client.$zod.makeAggregateSchema('User', { relationDepth: 0 });
                expect(s.safeParse({ where: { email: 'u@test.com' } }).success).toBe(true);
                expect(s.safeParse({ where: { posts: { some: { published: true } } } }).success).toBe(false);
            });
        });

        describe('makeGroupBySchema with depth', () => {
            it('relationDepth: 0 rejects relation where', () => {
                const s = client.$zod.makeGroupBySchema('User', { relationDepth: 0 });
                expect(s.safeParse({ by: ['email'], where: { email: 'u@test.com' } }).success).toBe(true);
                expect(s.safeParse({ by: ['email'], where: { posts: { some: { published: true } } } }).success).toBe(
                    false,
                );
            });
        });

        // --- Where schema directly ---

        describe('makeWhereSchema with depth', () => {
            it('relationDepth: 0 produces scalar-only where', () => {
                const s = client.$zod.makeWhereSchema('User', false, false, false, { relationDepth: 0 });
                expect(s.safeParse({ email: 'u@test.com' }).success).toBe(true);
                expect(s.safeParse({ posts: { some: { published: true } } }).success).toBe(false);
            });

            it('relationDepth: 0 still allows logical operators', () => {
                const s = client.$zod.makeWhereSchema('User', false, false, false, { relationDepth: 0 });
                expect(s.safeParse({ AND: [{ email: 'a' }, { name: 'b' }] }).success).toBe(true);
                expect(s.safeParse({ OR: [{ email: 'a' }] }).success).toBe(true);
                expect(s.safeParse({ NOT: { email: 'a' } }).success).toBe(true);
            });

            it('relationDepth: 1 allows relation filters but not nested relation filters', () => {
                const s = client.$zod.makeWhereSchema('Post', false, false, false, { relationDepth: 1 });
                // Post -> author (1 level) allowed
                expect(s.safeParse({ author: { email: 'u@test.com' } }).success).toBe(true);
                // Post -> author -> posts (2 levels) rejected
                expect(s.safeParse({ author: { posts: { some: { published: true } } } }).success).toBe(false);
            });
        });
    });

    // #endregion
});
