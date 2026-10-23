/**
 * @vitest-environment happy-dom
 */

import type { TypeDefResult } from '@zenstackhq/orm';
import { act, renderHook, waitFor } from '@testing-library/react';
import nock from 'nock';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { getQueryKey } from '../../src/common/query-key';
import { useClientQueries } from '../../src/react';
import { schema } from '../schemas/branded/schema-lite';
import { BASE_URL, createWrapper, makeUrl, registerCleanup } from './helpers';

registerCleanup();

type Schema = typeof schema;
type UserId = TypeDefResult<Schema, 'UserId'>;
type PostId = TypeDefResult<Schema, 'PostId'>;
type Email = TypeDefResult<Schema, 'Email'>;
type Age = TypeDefResult<Schema, 'Age'>;

describe('Branded primitive types', () => {
    it('brands model fields in query results', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: 'user_1' as UserId }, include: { posts: true } };
        const data = {
            id: 'user_1',
            email: 'u1@test.com',
            age: 20,
            posts: [{ id: 'post_1', title: 'Post 1', authorId: 'user_1' }],
        };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, { data });

        const { result } = renderHook(() => useClientQueries(schema).user.useFindUnique(queryArgs), { wrapper });

        type User = NonNullable<typeof result.current.data>;
        expectTypeOf<User['id']>().toEqualTypeOf<UserId>();
        expectTypeOf<User['email']>().toEqualTypeOf<Email>();
        expectTypeOf<User['age']>().toEqualTypeOf<Age | null>();
        expectTypeOf<User['posts'][number]['id']>().toEqualTypeOf<PostId>();
        expectTypeOf<User['posts'][number]['authorId']>().toEqualTypeOf<UserId>();

        // branding is type-only, the deserialized values are plain primitives
        await waitFor(() => {
            expect(result.current.data).toEqual(data);
            expect(queryClient.getQueryData(getQueryKey('User', 'findUnique', queryArgs))).toEqual(data);
        });
    });

    it('requires branded values in value filters, but not in substring filters', async () => {
        const { wrapper } = createWrapper();

        const queryArgs = { where: { id: { startsWith: 'user_' }, age: { gte: 18 as Age } } };
        const data = [{ id: 'user_1', email: 'u1@test.com', age: 20 }];

        nock(makeUrl('User', 'findMany', queryArgs))
            .get(/.*/)
            .reply(200, { data });

        const { result } = renderHook(() => useClientQueries(schema).user.useFindMany(queryArgs), { wrapper });

        expectTypeOf<NonNullable<typeof result.current.data>[number]['id']>().toEqualTypeOf<UserId>();

        await waitFor(() => {
            expect(result.current.data).toEqual(data);
        });
    });

    it('sends branded values as plain primitives in mutations', async () => {
        const { wrapper } = createWrapper();

        let requestBody: unknown;
        nock(makeUrl('Post', 'create'))
            .post(/.*/)
            .reply(200, (_uri, body) => {
                requestBody = body;
                return { data: { id: 'post_1', title: 'Post 1', authorId: 'user_1' } };
            });

        const { result } = renderHook(() => useClientQueries(schema).post.useCreate(), { wrapper });

        let created: unknown;
        await act(async () => {
            const post = await result.current.mutateAsync({
                data: { id: 'post_1' as PostId, title: 'Post 1', author: { connect: { id: 'user_1' as UserId } } },
            });
            expectTypeOf(post.id).toEqualTypeOf<PostId>();
            expectTypeOf(post.authorId).toEqualTypeOf<UserId>();
            created = post;
        });

        expect(created).toEqual({ id: 'post_1', title: 'Post 1', authorId: 'user_1' });
        expect(requestBody).toEqual({
            data: { id: 'post_1', title: 'Post 1', author: { connect: { id: 'user_1' } } },
        });
    });

    it('brands procedure params and results', async () => {
        const { wrapper } = createWrapper();

        nock(BASE_URL)
            .get(/\/api\/model\/\$procs\/getUserEmail/)
            .reply(200, { data: 'u1@test.com' });

        const { result } = renderHook(
            () => useClientQueries(schema).$procs.getUserEmail.useQuery({ args: { id: 'user_1' as UserId } }),
            { wrapper },
        );

        expectTypeOf(result.current.data).toEqualTypeOf<Email | undefined>();

        await waitFor(() => {
            expect(result.current.data).toBe('u1@test.com');
        });

        nock(BASE_URL)
            .post(/\/api\/model\/\$procs\/setUserAge/)
            .reply(200, { data: 30 });

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).$procs.setUserAge.useMutation(), {
            wrapper,
        });

        let age: Age | undefined;
        await act(async () => {
            age = await mutationResult.current.mutateAsync({ args: { id: 'user_1' as UserId, age: 30 as Age } });
        });
        expect(age).toBe(30);
    });

    it('requires branded values for writes and unique lookups', () => {
        // type-level checks only, never invoked
        const _typeChecks = () => {
            const client = useClientQueries(schema);

            // @ts-expect-error plain strings are not branded
            client.user.useFindUnique({ where: { id: 'user_1' } });

            // @ts-expect-error plain strings are not branded
            client.user.useFindMany({ where: { id: 'user_1' } });

            // @ts-expect-error plain numbers are not branded
            client.user.useCount({ where: { age: { gte: 18 } } });

            // @ts-expect-error plain strings are not branded
            client.user.useCreate().mutate({ data: { id: 'user_1', email: 'u1@test.com' } });

            // @ts-expect-error a UserId is not a PostId
            client.post.useDelete().mutate({ where: { id: 'post_1' as UserId } });

            // @ts-expect-error plain numbers are not branded
            client.$procs.setUserAge.useMutation().mutate({ args: { id: 'user_1' as UserId, age: 30 } });
        };
        void _typeChecks;
    });
});
