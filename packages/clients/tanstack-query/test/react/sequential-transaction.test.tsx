/**
 * @vitest-environment happy-dom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ClientContract, ClientOptions } from '@zenstackhq/orm';
import nock from 'nock';
import { describe, expect, it } from 'vitest';
import { getQueryKey } from '../../src/common/query-key';
import type { TransactionOperation } from '../../src/common/types';
import { useClientQueries } from '../../src/react';
import { schema } from '../schemas/basic/schema-lite';
import { BASE_URL, createWrapper, makeUrl, registerCleanup } from './helpers';

registerCleanup();

describe('Sequential transaction', () => {
    describe('Runtime behavior', () => {
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

            act(() =>
                txResult.current.mutate([{ model: 'User', op: 'create', args: { data: { email: 'foo@bar.com' } } }]),
            );

            await waitFor(() => {
                expect(txResult.current.isSuccess).toBe(true);
                // cache not refreshed because invalidation was disabled
                const cachedUsers = queryClient.getQueryData(getQueryKey('User', 'findMany', undefined));
                expect(cachedUsers).toHaveLength(0);
            });
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

        it('infers per-op result types on mutateAsync', () => {
            const { wrapper } = createWrapper();
            const { result: txResult } = renderHook(() => useClientQueries(schema).$transaction.useSequential(), {
                wrapper,
            });

            // Inline tuple — TS should infer each result element's shape.
            void async function () {
                const results = await txResult.current.mutateAsync([
                    { model: 'User', op: 'create', args: { data: { email: 'a@b.com' } } },
                    { model: 'Post', op: 'findFirst', args: { where: { id: '1' } } },
                    { model: 'User', op: 'findMany' },
                    { model: 'User', op: 'count' },
                    { model: 'User', op: 'deleteMany' },
                    { model: 'User', op: 'exists' },
                ] as const);

                // create → User
                check<string>(results[0].id);
                check<string>(results[0].email);

                // findFirst → Post | null
                check<string | undefined>(results[1]?.id);
                check<string | undefined>(results[1]?.title);
                // null is allowed
                const _maybeNull: (typeof results)[1] = null;
                void _maybeNull;

                // findMany → User[]
                check<string | undefined>(results[2][0]?.email);

                // count → number (no select arg)
                check<number>(results[3]);

                // deleteMany → BatchResult
                check<number>(results[4].count);

                // exists → boolean
                check<boolean>(results[5]);

                // @ts-expect-error wrong field on User
                check<string>(results[0].nonExistent);
            };
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

    describe('generic parameter influence (Options / ExtQueryArgs / ExtResult)', () => {
        // A typed `ClientContract` standing in for what `useClientQueries<typeof db>(schema)`
        // would receive when a real client (with plugins applied) is passed. Forwarded
        // generics flow into the transaction operation args and per-op result shapes.
        type DbType = ClientContract<
            typeof schema,
            ClientOptions<typeof schema>,
            // ExtQueryArgs: per-bucket extension keys
            {
                $read: { cache?: { ttl?: number } };
                $create: { audit?: { user?: string } };
                $update: { audit?: { user?: string } };
                $delete: { audit?: { user?: string } };
            },
            // ExtClientMembers (unused here)
            {},
            // ExtResult: User gains a computed `displayName` field
            {
                user: {
                    displayName: {
                        needs: { email: true };
                        compute: (data: { email: string }) => string;
                    };
                };
            }
        >;

        // The negative @ts-expect-error checks below assign each operation to a
        // concrete `TxOp` annotation, which forces TS to apply excess-property
        // checking on the literal. (Inline `mutateAsync([...])` calls capture the
        // tuple via a `const T extends ...[]` generic, where structural subtype
        // assignability allows extra properties — so negative cases need the
        // explicit annotation to fire.)
        type TxOp = TransactionOperation<
            typeof schema,
            ClientOptions<typeof schema>,
            // mirror DbType's ExtQueryArgs
            {
                $read: { cache?: { ttl?: number } };
                $create: { audit?: { user?: string } };
                $update: { audit?: { user?: string } };
                $delete: { audit?: { user?: string } };
            },
            // ExtResult is irrelevant for arg-shape tests
            {}
        >;

        it('threads ExtQueryArgs `$read` into read ops only', () => {
            const { wrapper } = createWrapper();
            const { result: txResult } = renderHook(
                () => useClientQueries<DbType>(schema).$transaction.useSequential(),
                { wrapper },
            );

            void async function () {
                // positive: `$read`'s `cache` flows into every read op
                await txResult.current.mutateAsync([
                    { model: 'User', op: 'findMany', args: { cache: { ttl: 1000 } } },
                    { model: 'User', op: 'findUnique', args: { where: { id: '1' }, cache: { ttl: 1000 } } },
                    { model: 'User', op: 'findFirst', args: { cache: { ttl: 500 } } },
                    { model: 'User', op: 'count', args: { cache: { ttl: 1000 } } },
                    { model: 'User', op: 'exists', args: { cache: { ttl: 1000 } } },
                ] as const);
            };

            // negative: `$read.cache` doesn't apply to `create`
            const badCreate: TxOp = {
                model: 'User',
                op: 'create',
                // @ts-expect-error excess `cache` on a write op
                args: { data: { email: 'a@b.com' }, cache: { ttl: 1000 } },
            };
            // negative: `$create`'s `audit` doesn't apply to read ops
            // @ts-expect-error excess `audit` on a read op
            const badFindMany: TxOp = { model: 'User', op: 'findMany', args: { audit: { user: 'admin' } } };

            expect([badCreate, badFindMany]).toHaveLength(2);
        });

        it('threads ExtQueryArgs `$create` / `$update` / `$delete` into the matching write ops', () => {
            const { wrapper } = createWrapper();
            const { result: txResult } = renderHook(
                () => useClientQueries<DbType>(schema).$transaction.useSequential(),
                { wrapper },
            );

            void async function () {
                // positive: each write bucket's extension flows into its own ops
                await txResult.current.mutateAsync([
                    {
                        model: 'User',
                        op: 'create',
                        args: { data: { email: 'a@b.com' }, audit: { user: 'admin' } },
                    },
                    {
                        model: 'User',
                        op: 'update',
                        args: { where: { id: '1' }, data: { email: 'b@c.com' }, audit: { user: 'admin' } },
                    },
                    {
                        model: 'User',
                        op: 'delete',
                        args: { where: { id: '1' }, audit: { user: 'admin' } },
                    },
                ] as const);
            };

            // negative: `$update`'s `audit` doesn't apply to read ops
            // @ts-expect-error excess `audit` on a read op
            const badRead: TxOp = { model: 'User', op: 'count', args: { audit: { user: 'admin' } } };

            expect(badRead).toBeDefined();
        });

        it('threads ExtResult into transaction per-op return types', () => {
            const { wrapper } = createWrapper();
            const { result: txResult } = renderHook(
                () => useClientQueries<DbType>(schema).$transaction.useSequential(),
                { wrapper },
            );

            void async function () {
                const r = await txResult.current.mutateAsync([
                    { model: 'User', op: 'create', args: { data: { email: 'a@b.com' } } },
                    { model: 'User', op: 'findFirst' },
                    { model: 'User', op: 'findMany' },
                    { model: 'User', op: 'update', args: { where: { id: '1' }, data: {} } },
                    { model: 'User', op: 'upsert', args: { where: { id: '1' }, create: { email: 'a' }, update: {} } },
                    { model: 'User', op: 'delete', args: { where: { id: '1' } } },
                ] as const);

                // `displayName` (from ExtResult) is present on every entity-returning op
                check<string>(r[0].displayName);
                check<string | undefined>(r[1]?.displayName);
                check<string | undefined>(r[2][0]?.displayName);
                check<string>(r[3].displayName);
                check<string>(r[4].displayName);
                check<string>(r[5].displayName);
            };
        });

        it('respects ExtQueryArgs across non-`User` models too', () => {
            const { wrapper } = createWrapper();
            const { result: txResult } = renderHook(
                () => useClientQueries<DbType>(schema).$transaction.useSequential(),
                { wrapper },
            );

            void async function () {
                // `$read` extension also applies to Post's reads
                await txResult.current.mutateAsync([
                    { model: 'Post', op: 'findMany', args: { cache: { ttl: 1000 } } },
                    { model: 'Post', op: 'count', args: { cache: { ttl: 1000 } } },
                ] as const);

                // `$create` extension also applies to Post's writes
                await txResult.current.mutateAsync([
                    {
                        model: 'Post',
                        op: 'create',
                        args: {
                            data: { title: 'hello', author: { connect: { id: '1' } } },
                            audit: { user: 'admin' },
                        },
                    },
                ] as const);
            };
        });
    });
});

// Type-only assertion: forces `value` to be assignable to `T` at compile time.
function check<T>(value: T): T {
    return value;
}
