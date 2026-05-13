import { ZenStackClient } from '@zenstackhq/orm';
import { describe, expectTypeOf, it } from 'vitest';
import { useClientQueries } from '../../src/react';
import { schema } from '../schemas/basic/schema-lite';
import { schema as procSchema } from '../schemas/procedures/schema-lite';

describe('React client sliced client test', () => {
    const _db = new ZenStackClient(schema, {
        dialect: {} as any,
        slicing: {
            includedModels: ['User', 'Post'],
            models: {
                user: {
                    includedOperations: ['findUnique', 'findMany', 'update'],
                    excludedOperations: ['update'],
                },
            },
        },
        omit: {},
    });

    it('works with sliced models', () => {
        const client = useClientQueries<typeof _db>(schema);

        expectTypeOf(client).toHaveProperty('user');
        expectTypeOf(client).toHaveProperty('post');
        expectTypeOf(client).not.toHaveProperty('category');
    });

    it('works with sliced operations', () => {
        const _slicedOps = new ZenStackClient(schema, {
            dialect: {} as any,
            slicing: {
                models: {
                    user: {
                        includedOperations: ['findUnique', 'findMany', 'update'],
                    },
                },
            },
        });
        const client = useClientQueries<typeof _slicedOps>(schema);

        expectTypeOf(client.user).toHaveProperty('useFindUnique');
        expectTypeOf(client.user).toHaveProperty('useFindMany');
        expectTypeOf(client.user).toHaveProperty('useUpdate');
        expectTypeOf(client.user).not.toHaveProperty('useFindFirst');
    });

    it('works with sliced filters', () => {
        const _slicedFilters = new ZenStackClient(schema, {
            dialect: {} as any,
            slicing: {
                models: {
                    user: {
                        fields: {
                            $all: {
                                includedFilterKinds: ['Equality'],
                            },
                        },
                    },
                },
            },
        });
        const client = useClientQueries<typeof _slicedFilters>(schema);

        // Equality filter should be allowed
        client.user.useFindMany({
            where: { name: { equals: 'test' } },
        });

        // 'Like' filter kind should not be available
        // @ts-expect-error - 'contains' is not allowed when only 'Equality' filter kind is included
        client.user.useFindMany({ where: { name: { contains: 'test' } } });
    });

    it('respects slicing in sequential transaction op union', () => {
        const _slicedTx = new ZenStackClient(schema, {
            dialect: {} as any,
            slicing: {
                models: {
                    user: {
                        // user can only do reads — no writes in transactions
                        includedOperations: ['findUnique', 'findMany', 'count'],
                    },
                },
            },
        });
        const client = useClientQueries<typeof _slicedTx>(schema);
        const tx = client.$transaction.useSequential();

        void async function () {
            // included read ops are allowed
            await tx.mutateAsync([
                { model: 'User', op: 'findMany' },
                { model: 'User', op: 'findUnique', args: { where: { id: '1' } } },
                { model: 'User', op: 'count' },
            ] as const);

            await tx.mutateAsync([
                // @ts-expect-error 'create' was sliced away by `includedOperations`
                { model: 'User', op: 'create', args: { data: { email: 'a@b.com' } } },
            ] as const);

            await tx.mutateAsync([
                // @ts-expect-error 'delete' was sliced away by `includedOperations`
                { model: 'User', op: 'delete', args: { where: { id: '1' } } },
            ] as const);
        };
    });

    it('works with sliced procedures', () => {
        const _slicedProcs = new ZenStackClient(procSchema, {
            dialect: {} as any,
            procedures: {} as any,
            slicing: {
                includedProcedures: ['greet', 'sum'],
                excludedProcedures: ['sum'],
            },
        });
        const client = useClientQueries<typeof _slicedProcs>(procSchema);

        expectTypeOf(client.$procs).toHaveProperty('greet');
        expectTypeOf(client.$procs).not.toHaveProperty('sum');
        expectTypeOf(client.$procs).not.toHaveProperty('greetMany');
    });
});
