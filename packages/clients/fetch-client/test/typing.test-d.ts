import type { ClientContract, ClientOptions } from '@zenstackhq/orm';
import { ZenStackClient } from '@zenstackhq/orm';
import { describe, expectTypeOf, it } from 'vitest';
import { createClient } from '../src/index';
import { schema } from './schemas/basic/schema-lite';

const ENDPOINT = 'http://localhost/api/model';

describe('Result narrowing through AllModelOperations', () => {
    it('full row shape with no select', () => {
        const client = createClient(schema, { endpoint: ENDPOINT });
        expectTypeOf(client.user.findMany()).resolves.toEqualTypeOf<
            Array<{ id: string; email: string; name: string | null }>
        >();
    });

    it('select narrows the result row', () => {
        const client = createClient(schema, { endpoint: ENDPOINT });
        const promise = client.user.findMany({ select: { id: true } });
        expectTypeOf(promise).resolves.toEqualTypeOf<Array<{ id: string }>>();
    });

    it('findUniqueOrThrow returns non-null', () => {
        const client = createClient(schema, { endpoint: ENDPOINT });
        expectTypeOf(client.user.findUniqueOrThrow({ where: { id: '1' } })).resolves.toEqualTypeOf<{
            id: string;
            email: string;
            name: string | null;
        }>();
    });
});

describe('Slicing', () => {
    it('trims models', () => {
        const _db = new ZenStackClient(schema, {
            dialect: {} as any,
            procedures: {} as any,
            slicing: { includedModels: ['User'] },
        });
        const client = createClient<typeof _db>(schema, { endpoint: ENDPOINT });

        client.user.findMany();
        // @ts-expect-error – 'post' was sliced away
        client.post;
    });

    it('trims operations', () => {
        const _db = new ZenStackClient(schema, {
            dialect: {} as any,
            procedures: {} as any,
            slicing: {
                models: {
                    user: { includedOperations: ['findUnique', 'findMany'] },
                },
            },
        });
        const client = createClient<typeof _db>(schema, { endpoint: ENDPOINT });

        client.user.findUnique({ where: { id: '1' } });
        client.user.findMany();
        // @ts-expect-error – 'create' was sliced away
        client.user.create({ data: { email: 'a@b.com' } });
        // @ts-expect-error – 'delete' was sliced away
        client.user.delete({ where: { id: '1' } });
    });

    it('trims filters', () => {
        const _db = new ZenStackClient(schema, {
            dialect: {} as any,
            procedures: {} as any,
            slicing: {
                models: {
                    user: {
                        fields: {
                            $all: { includedFilterKinds: ['Equality'] },
                        },
                    },
                },
            },
        });
        const client = createClient<typeof _db>(schema, { endpoint: ENDPOINT });

        // Equality filter is allowed
        client.user.findMany({ where: { name: { equals: 'test' } } });

        // @ts-expect-error – `contains` is not allowed when only Equality is included
        client.user.findMany({ where: { name: { contains: 'test' } } });
    });

    it('respects slicing in transaction op union', () => {
        const _db = new ZenStackClient(schema, {
            dialect: {} as any,
            procedures: {} as any,
            slicing: {
                models: {
                    user: { includedOperations: ['findUnique', 'findMany', 'count'] },
                },
            },
        });
        const client = createClient<typeof _db>(schema, { endpoint: ENDPOINT });

        void async function () {
            // included read ops are allowed
            await client.$transaction([
                { model: 'User', op: 'findMany' },
                { model: 'User', op: 'findUnique', args: { where: { id: '1' } } },
                { model: 'User', op: 'count' },
            ] as const);

            await client.$transaction([
                // @ts-expect-error 'create' was sliced away
                { model: 'User', op: 'create', args: { data: { email: 'a@b.com' } } },
            ] as const);

            await client.$transaction([
                // @ts-expect-error 'delete' was sliced away
                { model: 'User', op: 'delete', args: { where: { id: '1' } } },
            ] as const);
        };
    });
});

describe('Extended query args (ExtQueryArgs)', () => {
    type DbType = ClientContract<
        typeof schema,
        ClientOptions<typeof schema>,
        // $read adds a `cache` filter to all read ops; $create adds a `bust` flag to creates
        {
            $read: { cache?: { ttl?: number } };
            $create: { cache?: { bust?: boolean } };
        }
    >;

    it('flows through read ops', () => {
        const client = createClient<DbType>(schema, { endpoint: ENDPOINT });

        client.user.findMany({ cache: { ttl: 1000 } });
        client.user.findUnique({ where: { id: '1' }, cache: { ttl: 1000 } });
        client.user.count({ cache: { ttl: 1000 } });

        // @ts-expect-error – $read's cache shape doesn't accept `bust`
        client.user.findMany({ cache: { bust: true } });
    });

    it('flows through create', () => {
        const client = createClient<DbType>(schema, { endpoint: ENDPOINT });

        client.user.create({ data: { email: 'a@b.com' }, cache: { bust: true } });

        // @ts-expect-error – $create's cache shape doesn't accept `ttl`
        client.user.create({ data: { email: 'a@b.com' }, cache: { ttl: 1000 } });
    });

    it('flows through transaction args', () => {
        const client = createClient<DbType>(schema, { endpoint: ENDPOINT });

        void async function () {
            await client.$transaction([
                { model: 'User', op: 'findMany', args: { cache: { ttl: 500 } } },
                { model: 'User', op: 'create', args: { data: { email: 'a@b.com' }, cache: { bust: true } } },
            ] as const);

            await client.$transaction([
                // @ts-expect-error – $create has no `ttl`
                { model: 'User', op: 'create', args: { data: { email: 'a' }, cache: { ttl: 1 } } },
            ] as const);
        };
    });
});

describe('Extended result fields (ExtResult)', () => {
    type DbType = ClientContract<
        typeof schema,
        ClientOptions<typeof schema>,
        {},
        {},
        // User gains a computed `displayName` field
        {
            user: {
                displayName: {
                    needs: { email: true };
                    compute: (data: { email: string }) => string;
                };
            };
        }
    >;

    it('adds the computed field to read results', () => {
        const client = createClient<DbType>(schema, { endpoint: ENDPOINT });

        expectTypeOf(client.user.findUnique({ where: { id: '1' } })).resolves.toMatchTypeOf<
            { displayName: string } | null
        >();

        expectTypeOf(client.user.findMany()).resolves.toMatchTypeOf<Array<{ displayName: string }>>();
    });

    it('adds the computed field to mutation results', () => {
        const client = createClient<DbType>(schema, { endpoint: ENDPOINT });

        expectTypeOf(client.user.create({ data: { email: 'a@b.com' } })).resolves.toMatchTypeOf<{
            displayName: string;
        }>();
    });

    it('flows through transaction return positions', () => {
        const client = createClient<DbType>(schema, { endpoint: ENDPOINT });

        void async function () {
            const r = await client.$transaction([
                { model: 'User', op: 'findMany' },
                { model: 'User', op: 'create', args: { data: { email: 'a@b.com' } } },
            ] as const);

            expectTypeOf(r[0]).toMatchTypeOf<Array<{ displayName: string }>>();
            expectTypeOf(r[1]).toMatchTypeOf<{ displayName: string }>();
        };
    });
});
