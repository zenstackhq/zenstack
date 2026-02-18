import { ZenStackClient, type GetQueryOptions } from '@zenstackhq/orm';
import { describe, expectTypeOf, it } from 'vitest';
import { useClientQueries } from '../src/react';
import { schema } from './schemas/basic/schema-lite';
import { schema as procSchema } from './schemas/procedures/schema-lite';

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
        const client = useClientQueries<typeof schema, GetQueryOptions<typeof _db>>(schema);

        expectTypeOf(client).toHaveProperty('user');
        expectTypeOf(client).toHaveProperty('post');
        expectTypeOf(client).not.toHaveProperty('category');
    });

    it('works with sliced operations', () => {
        const client = useClientQueries<
            typeof schema,
            {
                slicing: {
                    models: {
                        user: {
                            includedOperations: ['findUnique', 'findMany', 'update'];
                        };
                    };
                };
            }
        >(schema);

        expectTypeOf(client.user).toHaveProperty('useFindUnique');
        expectTypeOf(client.user).toHaveProperty('useFindMany');
        expectTypeOf(client.user).toHaveProperty('useUpdate');
        expectTypeOf(client.user).not.toHaveProperty('useFindFirst');
    });

    it('works with sliced filters', () => {
        const client = useClientQueries<
            typeof schema,
            {
                slicing: {
                    models: {
                        user: {
                            fields: {
                                $all: {
                                    includedFilterKinds: ['Equality'];
                                };
                            };
                        };
                    };
                };
            }
        >(schema);

        // Equality filter should be allowed
        client.user.useFindMany({
            where: { name: { equals: 'test' } },
        });

        // 'Like' filter kind should not be available
        // @ts-expect-error - 'contains' is not allowed when only 'Equality' filter kind is included
        client.user.useFindMany({ where: { name: { contains: 'test' } } });
    });

    it('works with sliced procedures', () => {
        const client = useClientQueries<
            typeof procSchema,
            {
                slicing: {
                    includedProcedures: ['greet', 'sum'];
                    excludedProcedures: ['sum'];
                };
            }
        >(procSchema);

        expectTypeOf(client.$procs).toHaveProperty('greet');
        expectTypeOf(client.$procs).not.toHaveProperty('sum');
        expectTypeOf(client.$procs).not.toHaveProperty('greetMany');
    });
});
