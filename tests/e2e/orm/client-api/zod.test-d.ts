import { definePlugin, type ClientContract, type ClientOptions } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { schema } from '../schemas/basic';

declare const client: ClientContract<typeof schema>;

describe('Zod schema typing tests', () => {
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

    it('makeExistsSchema returns a typed schema', () => {
        const s = client.$zod.makeExistsSchema('User');
        type Args = NonNullable<z.infer<typeof s>>;
        expectTypeOf<Args>().toHaveProperty('where');
        expectTypeOf<Args>().not.toHaveProperty('select');
        expectTypeOf<Args>().not.toHaveProperty('include');
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
});

describe('Zod schema with slicing - typing', () => {
    it('model exclusion removes relation field from include type', async () => {
        type ExcludePostOptions = ClientOptions<typeof schema> & {
            slicing: { excludedModels: readonly ['Post'] };
        };
        const slicingClient = await createTestClient<typeof schema, ExcludePostOptions>(schema, {
            slicing: { excludedModels: ['Post'] as const },
        });
        const s = slicingClient.$zod.makeFindManySchema('User');
        type Include = NonNullable<NonNullable<z.infer<typeof s>>['include']>;
        // 'posts' relation is excluded → not in include type
        expectTypeOf<Include>().not.toHaveProperty('posts');
        // 'profile' is not excluded → still in include type
        expectTypeOf<Include>().toHaveProperty('profile');
    });

    it('includedModels restricts relation fields in include type', async () => {
        type IncludeUserProfileOptions = ClientOptions<typeof schema> & {
            slicing: { includedModels: readonly ['User', 'Profile'] };
        };
        const slicingClient = await createTestClient<typeof schema, IncludeUserProfileOptions>(schema, {
            slicing: { includedModels: ['User', 'Profile'] as const },
        });
        const s = slicingClient.$zod.makeFindManySchema('User');
        type Include = NonNullable<NonNullable<z.infer<typeof s>>['include']>;
        // 'profile' points to Profile which is included
        expectTypeOf<Include>().toHaveProperty('profile');
        // 'posts' points to Post which is NOT in includedModels → not in include type
        expectTypeOf<Include>().not.toHaveProperty('posts');
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
        const s = slicingClient.$zod.makeFindManySchema('User');
        type Where = NonNullable<NonNullable<z.infer<typeof s>>['where']>;
        // Range operators are excluded → type error
        // @ts-expect-error 'gt' is not a valid operator when only Equality is included
        const _rangeInvalid: Where = { age: { gt: 25 } };
        void _rangeInvalid;
        // Equality operators are still valid
        const _equalityValid: Where = { age: { equals: 25 } };
        void _equalityValid;
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
        const s = slicingClient.$zod.makeFindManySchema('User');
        type Where = NonNullable<NonNullable<z.infer<typeof s>>['where']>;
        // Like operators are excluded → type error
        // @ts-expect-error 'contains' is not a valid operator when only Equality is included
        const _likeInvalid: Where = { email: { contains: 'test' } };
        void _likeInvalid;
        // Equality operators are still valid
        const _equalityValid: Where = { email: { equals: 'test@example.com' } };
        void _equalityValid;
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
    });
});

describe('Zod schema with plugins - query args extension typing', () => {
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
