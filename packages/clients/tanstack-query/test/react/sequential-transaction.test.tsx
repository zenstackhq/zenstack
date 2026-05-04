/**
 * @vitest-environment happy-dom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import nock from 'nock';
import { describe, expect, it } from 'vitest';
import { getQueryKey } from '../../src/common/query-key';
import type { TransactionOperation } from '../../src/common/types';
import { useClientQueries } from '../../src/react';
import { schema } from '../schemas/basic/schema-lite';
import { BASE_URL, createWrapper, makeUrl, registerCleanup } from './helpers';

registerCleanup();

describe('Sequential transaction', () => {
    it('works with sequential transaction and invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const users: any[] = [];
        const posts: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data: users }))
            .persist();

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data: posts }))
            .persist();

        const { result: userResult } = renderHook(() => useClientQueries(schema).user.useFindMany(), { wrapper });
        const { result: postResult } = renderHook(() => useClientQueries(schema).post.useFindMany(), { wrapper });

        await waitFor(() => {
            expect(userResult.current.data).toHaveLength(0);
            expect(postResult.current.data).toHaveLength(0);
        });

        nock(`${BASE_URL}/api/model/$transaction/sequential`)
            .post(/.*/)
            .reply(200, () => {
                users.push({ id: '1', email: 'foo@bar.com' });
                posts.push({ id: 'p1', title: 'Hello' });
                return { data: [users[0], posts[0]] };
            });

        const { result: txResult } = renderHook(() => useClientQueries(schema).$transaction.useSequential(), {
            wrapper,
        });

        act(() =>
            txResult.current.mutate([
                { model: 'User', op: 'create', args: { data: { email: 'foo@bar.com' } } },
                { model: 'Post', op: 'create', args: { data: { title: 'Hello' } } },
            ]),
        );

        await waitFor(() => {
            const cachedUsers = queryClient.getQueryData(getQueryKey('User', 'findMany', undefined));
            const cachedPosts = queryClient.getQueryData(getQueryKey('Post', 'findMany', undefined));
            expect(cachedUsers).toHaveLength(1);
            expect(cachedPosts).toHaveLength(1);
        });
    });

    describe('args field optionality', () => {
        type TxOp = TransactionOperation<typeof schema>;

        it('allows omitting args for ops with all-optional args', () => {
            const findMany: TxOp = { model: 'User', op: 'findMany' };
            const findFirst: TxOp = { model: 'User', op: 'findFirst' };
            const count: TxOp = { model: 'User', op: 'count' };
            const exists: TxOp = { model: 'User', op: 'exists' };
            const deleteMany: TxOp = { model: 'User', op: 'deleteMany' };

            // also accepts an explicit args payload
            const findManyWithArgs: TxOp = { model: 'User', op: 'findMany', args: { where: { id: '1' } } };

            expect([findMany, findFirst, count, exists, deleteMany, findManyWithArgs]).toHaveLength(6);
        });

        it('requires args for ops whose args type has required fields', () => {
            const create: TxOp = { model: 'User', op: 'create', args: { data: { email: 'a@b.com' } } };
            const update: TxOp = {
                model: 'User',
                op: 'update',
                args: { where: { id: '1' }, data: { email: 'b@c.com' } },
            };
            const del: TxOp = { model: 'User', op: 'delete', args: { where: { id: '1' } } };
            const findUnique: TxOp = { model: 'User', op: 'findUnique', args: { where: { id: '1' } } };
            const upsert: TxOp = {
                model: 'User',
                op: 'upsert',
                args: { where: { id: '1' }, create: { email: 'c@d.com' }, update: {} },
            };
            const groupBy: TxOp = { model: 'User', op: 'groupBy', args: { by: ['email'] } };

            // @ts-expect-error 'create' requires args
            const badCreate: TxOp = { model: 'User', op: 'create' };
            // @ts-expect-error 'update' requires args
            const badUpdate: TxOp = { model: 'User', op: 'update' };
            // @ts-expect-error 'delete' requires args
            const badDelete: TxOp = { model: 'User', op: 'delete' };
            // @ts-expect-error 'findUnique' requires args
            const badFindUnique: TxOp = { model: 'User', op: 'findUnique' };
            // @ts-expect-error 'upsert' requires args
            const badUpsert: TxOp = { model: 'User', op: 'upsert' };
            // @ts-expect-error 'groupBy' requires args
            const badGroupBy: TxOp = { model: 'User', op: 'groupBy' };

            expect([create, update, del, findUnique, upsert, groupBy]).toHaveLength(6);
            expect([badCreate, badUpdate, badDelete, badFindUnique, badUpsert, badGroupBy]).toHaveLength(6);
        });

        it('rejects create-style ops on delegate models that disallow create', () => {
            // 'Foo' is a delegate model — create-style ops are filtered out of the union

            // @ts-expect-error delegate model cannot 'create'
            const badCreate: TxOp = { model: 'Foo', op: 'create' };
            // @ts-expect-error delegate model cannot 'createMany'
            const badCreateMany: TxOp = { model: 'Foo', op: 'createMany' };
            // @ts-expect-error delegate model cannot 'createManyAndReturn'
            const badCreateManyAndReturn: TxOp = { model: 'Foo', op: 'createManyAndReturn' };
            // @ts-expect-error delegate model cannot 'upsert'
            const badUpsert: TxOp = { model: 'Foo', op: 'upsert' };

            // non-create ops on delegate models are still allowed
            const findMany: TxOp = { model: 'Foo', op: 'findMany' };
            const update: TxOp = { model: 'Foo', op: 'update', args: { where: { id: '1' }, data: {} } };

            expect([badCreate, badCreateMany, badCreateManyAndReturn, badUpsert, findMany, update]).toHaveLength(6);
        });
    });

    it('works with sequential transaction and no invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const users: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data: users }))
            .persist();

        const { result: userResult } = renderHook(() => useClientQueries(schema).user.useFindMany(), { wrapper });

        await waitFor(() => {
            expect(userResult.current.data).toHaveLength(0);
        });

        nock(`${BASE_URL}/api/model/$transaction/sequential`)
            .post(/.*/)
            .reply(200, () => {
                users.push({ id: '1', email: 'foo@bar.com' });
                return { data: [users[0]] };
            });

        const { result: txResult } = renderHook(
            () => useClientQueries(schema).$transaction.useSequential({ invalidateQueries: false }),
            { wrapper },
        );

        act(() => txResult.current.mutate([{ model: 'User', op: 'create', args: { data: { email: 'foo@bar.com' } } }]));

        await waitFor(() => {
            expect(txResult.current.isSuccess).toBe(true);
            // cache not refreshed because invalidation was disabled
            const cachedUsers = queryClient.getQueryData(getQueryKey('User', 'findMany', undefined));
            expect(cachedUsers).toHaveLength(0);
        });
    });
});
