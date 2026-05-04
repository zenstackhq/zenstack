/**
 * @vitest-environment happy-dom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import nock from 'nock';
import { describe, expect, it } from 'vitest';
import { getQueryKey } from '../../src/common/query-key';
import { useClientQueries } from '../../src/react';
import { schema } from '../schemas/basic/schema-lite';
import { createWrapper, makeUrl, registerCleanup } from './helpers';

registerCleanup();

describe('CRUD and invalidation', () => {
    it('works with simple query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, {
                data,
            });

        const { result } = renderHook(() => useClientQueries(schema).user.useFindUnique(queryArgs), {
            wrapper,
        });

        await waitFor(() => {
            expect(result.current.isSuccess).toBe(true);
            expect(result.current.data).toMatchObject(data);
            const cacheData = queryClient.getQueryData(getQueryKey('User', 'findUnique', queryArgs));
            expect(cacheData).toMatchObject(data);
        });

        nock(makeUrl('User', 'findFirst', queryArgs))
            .get(/.*/)
            .reply(404, () => {
                return { error: 'Not Found' };
            });
        const { result: errorResult } = renderHook(() => useClientQueries(schema).user.useFindFirst(queryArgs), {
            wrapper,
        });
        await waitFor(() => {
            expect(errorResult.current.isError).toBe(true);
        });
    });

    it('works with suspense query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, {
                data,
            });

        const { result } = renderHook(() => useClientQueries(schema).user.useSuspenseFindUnique(queryArgs), {
            wrapper,
        });

        await waitFor(() => {
            expect(result.current.isSuccess).toBe(true);
            expect(result.current.data).toMatchObject(data);
            const cacheData = queryClient.getQueryData(getQueryKey('User', 'findUnique', queryArgs));
            expect(cacheData).toMatchObject(data);
        });
    });

    it('works with infinite query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = [{ id: '1', name: 'foo' }];

        nock(makeUrl('User', 'findMany', queryArgs))
            .get(/.*/)
            .reply(200, () => ({
                data,
            }));

        const { result } = renderHook(
            () =>
                useClientQueries(schema).user.useInfiniteFindMany(queryArgs, {
                    getNextPageParam: () => null,
                }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.isSuccess).toBe(true);
            const resultData = result.current.data!;
            expect(resultData.pages).toHaveLength(1);
            expect(resultData.pages[0]).toMatchObject(data);
            expect(resultData?.pageParams).toHaveLength(1);
            expect(resultData?.pageParams[0]).toMatchObject(queryArgs);
            expect(result.current.hasNextPage).toBe(false);
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findMany', queryArgs, { infinite: true, optimisticUpdate: false }),
            );
            expect(cacheData.pages[0]).toMatchObject(data);
        });
    });

    it('works with suspense infinite query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = [{ id: '1', name: 'foo' }];

        nock(makeUrl('User', 'findMany', queryArgs))
            .get(/.*/)
            .reply(200, () => ({
                data,
            }));

        const { result } = renderHook(
            () =>
                useClientQueries(schema).user.useSuspenseInfiniteFindMany(queryArgs, {
                    getNextPageParam: () => null,
                }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.isSuccess).toBe(true);
            const resultData = result.current.data!;
            expect(resultData.pages).toHaveLength(1);
            expect(resultData.pages[0]).toMatchObject(data);
            expect(resultData?.pageParams).toHaveLength(1);
            expect(resultData?.pageParams[0]).toMatchObject(queryArgs);
            expect(result.current.hasNextPage).toBe(false);
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findMany', queryArgs, { infinite: true, optimisticUpdate: false }),
            );
            expect(cacheData.pages[0]).toMatchObject(data);
        });
    });

    it('works with independent mutation and query', async () => {
        const { wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        let queryCount = 0;
        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => {
                queryCount++;
                return { data };
            })
            .persist();

        const { result } = renderHook(() => useClientQueries(schema).user.useFindUnique(queryArgs), {
            wrapper,
        });
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ name: 'foo' });
        });

        nock(makeUrl('Post', 'create'))
            .post(/.*/)
            .reply(200, () => ({
                data: { id: '1', title: 'post1' },
            }));

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).post.useCreate(), {
            wrapper,
        });

        act(() => mutationResult.current.mutate({ data: { title: 'post1' } }));

        await waitFor(() => {
            // no refetch caused by invalidation
            expect(queryCount).toBe(1);
        });
    });

    it('works with create and invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(() => useClientQueries(schema).user.useFindMany(), {
            wrapper,
        });
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'create'))
            .post(/.*/)
            .reply(200, () => {
                data.push({ id: '1', email: 'foo' });
                return { data: data[0] };
            });

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).user.useCreate(), {
            wrapper,
        });

        act(() => mutationResult.current.mutate({ data: { email: 'foo' } }));

        await waitFor(() => {
            const cacheData = queryClient.getQueryData(getQueryKey('User', 'findMany', undefined));
            expect(cacheData).toHaveLength(1);
        });
    });

    it('works with create and no invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(() => useClientQueries(schema).user.useFindMany(), {
            wrapper,
        });
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'create'))
            .post(/.*/)
            .reply(200, () => {
                data.push({ id: '1', email: 'foo' });
                return { data: data[0] };
            });

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).user.useCreate(), {
            wrapper,
        });

        act(() => mutationResult.current.mutate({ data: { email: 'foo' } }));

        await waitFor(() => {
            const cacheData = queryClient.getQueryData(getQueryKey('User', 'findMany', undefined));
            expect(cacheData).toHaveLength(0);
        });
    });

    it('works with update and invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => ({
                data,
            }))
            .persist();

        const { result } = renderHook(() => useClientQueries(schema).user.useFindUnique(queryArgs), {
            wrapper,
        });
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ name: 'foo' });
        });

        nock(makeUrl('User', 'update'))
            .put(/.*/)
            .reply(200, () => {
                data.name = 'bar';
                return data;
            });

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).user.useUpdate(), {
            wrapper,
        });

        act(() => mutationResult.current.mutate({ ...queryArgs, data: { name: 'bar' } }));

        await waitFor(() => {
            const cacheData = queryClient.getQueryData(getQueryKey('User', 'findUnique', queryArgs));
            expect(cacheData).toMatchObject({ name: 'bar' });
        });
    });

    it('works with update and no invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(() => useClientQueries(schema).user.useFindUnique(queryArgs), {
            wrapper,
        });
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ name: 'foo' });
        });

        nock(makeUrl('User', 'update'))
            .put(/.*/)
            .reply(200, () => {
                data.name = 'bar';
                return data;
            });

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).user.useUpdate(), {
            wrapper,
        });

        act(() => mutationResult.current.mutate({ ...queryArgs, data: { name: 'bar' } }));

        await waitFor(() => {
            const cacheData = queryClient.getQueryData(getQueryKey('User', 'findUnique', queryArgs));
            expect(cacheData).toMatchObject({ name: 'foo' });
        });
    });

    it('works with delete and invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [{ id: '1', name: 'foo' }];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(() => useClientQueries(schema).user.useFindMany(), {
            wrapper,
        });
        await waitFor(() => {
            expect(result.current.data).toHaveLength(1);
        });

        nock(makeUrl('User', 'delete'))
            .delete(/.*/)
            .reply(200, () => {
                data.splice(0, 1);
                return { data: [] };
            });

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).user.useDelete(), {
            wrapper,
        });

        act(() => mutationResult.current.mutate({ where: { id: '1' } }));

        await waitFor(() => {
            const cacheData = queryClient.getQueryData(getQueryKey('User', 'findMany', undefined));
            expect(cacheData).toHaveLength(0);
        });
    });

    it('top-level mutation and nested-read invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' }, include: { posts: true } };
        const data = { posts: [{ id: '1', title: 'post1' }] };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(() => useClientQueries(schema).user.useFindUnique(queryArgs), {
            wrapper,
        });
        await waitFor(() => {
            expect(result.current.data).toMatchObject(data);
        });

        nock(makeUrl('Post', 'update'))
            .put(/.*/)
            .reply(200, () => {
                data.posts[0]!.title = 'post2';
                return data;
            });

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).post.useUpdate(), {
            wrapper,
        });

        act(() => mutationResult.current.mutate({ where: { id: '1' }, data: { title: 'post2' } }));

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(getQueryKey('User', 'findUnique', queryArgs));
            expect(cacheData.posts[0].title).toBe('post2');
        });
    });

    it('nested mutation and top-level-read invalidation', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data = [{ id: '1', title: 'post1', ownerId: '1' }];

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({
                data,
            }))
            .persist();

        const { result } = renderHook(() => useClientQueries(schema).post.useFindMany(), {
            wrapper,
        });
        await waitFor(() => {
            expect(result.current.data).toMatchObject(data);
        });

        nock(makeUrl('User', 'update'))
            .put(/.*/)
            .reply(200, () => {
                data.push({ id: '2', title: 'post2', ownerId: '1' });
                return data;
            });

        const { result: mutationResult } = renderHook(() => useClientQueries(schema).user.useUpdate(), {
            wrapper,
        });

        act(() =>
            mutationResult.current.mutate({ where: { id: '1' }, data: { posts: { create: { title: 'post2' } } } }),
        );

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(getQueryKey('Post', 'findMany', undefined));
            expect(cacheData).toHaveLength(2);
        });
    });
});
