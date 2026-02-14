import { ZenStackClient, type GetQueryOptions } from '@zenstackhq/orm';
import { describe, expectTypeOf, it } from 'vitest';
import { useClientQueries } from '../src/vue';
import { schema } from './schemas/basic/schema-lite';

describe('Vue client sliced client test', () => {
    const _db = new ZenStackClient(schema, {
        dialect: {} as any,
        slicing: {
            includedModels: ['User', 'Post'],
            models: {
                User: {
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
                        User: {
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
});
