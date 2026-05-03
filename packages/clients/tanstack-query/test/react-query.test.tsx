/**
 * @vitest-environment happy-dom
 */

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { deserialize, serialize } from '@zenstackhq/client-helpers/fetch';
import nock from 'nock';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { getQueryKey } from '../src/common/query-key';
import { AnyNull, DbNull, JsonNull, QuerySettingsProvider, useClientQueries } from '../src/react';
import { schema } from './schemas/basic/schema-lite';

const BASE_URL = 'http://localhost';

describe('React Query Test', () => {
    function createWrapper() {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });
        const Provider = QuerySettingsProvider;
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <Provider value={{ endpoint: `${BASE_URL}/api/model` }}>{children}</Provider>
            </QueryClientProvider>
        );
        return { queryClient, wrapper };
    }

    function makeUrl(model: string, operation: string, args?: unknown) {
        let r = `${BASE_URL}/api/model/${model}/${operation}`;
        if (args) {
            r += `?q=${encodeURIComponent(JSON.stringify(args))}`;
        }
        return r;
    }

    afterEach(() => {
        nock.cleanAll();
        cleanup();
    });

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

    it('works with optimistic create single', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'create'))
            .post(/.*/)
            .reply(200, () => ({
                data: null,
            }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useCreate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ data: { email: 'foo' } }));

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(1);
            expect(cacheData[0].$optimistic).toBe(true);
            expect(cacheData[0].id).toBeTruthy();
            expect(cacheData[0].email).toBe('foo');
        });
    });

    it('works with optimistic create updating nested query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [{ id: '1', name: 'user1', posts: [] }];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () =>
                useClientQueries(schema).user.useFindMany(
                    {
                        include: { posts: true },
                    },
                    { optimisticUpdate: true },
                ),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(1);
        });

        nock(makeUrl('Post', 'create'))
            .post(/.*/)
            .reply(200, () => ({
                data: null,
            }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).post.useCreate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ data: { title: 'post1', owner: { connect: { id: '1' } } } }));

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey(
                    'User',
                    'findMany',
                    { include: { posts: true } },
                    { infinite: false, optimisticUpdate: true },
                ),
            );
            const posts = cacheData[0].posts;
            expect(posts).toHaveLength(1);
            expect(posts[0]).toMatchObject({ $optimistic: true, id: expect.any(String), title: 'post1', ownerId: '1' });
        });
    });

    it('works with optimistic create updating deeply nested query', async () => {
        const { queryClient, wrapper } = createWrapper();

        // populate the cache with a user

        const userData: any[] = [{ id: '1', email: 'user1', posts: [] }];

        nock(BASE_URL)
            .get('/api/model/user/findMany')
            .query(true)
            .reply(200, () => ({ data: userData }))
            .persist();

        const { result: userResult } = renderHook(
            () =>
                useClientQueries(schema).user.useFindMany(
                    {
                        include: {
                            posts: {
                                include: {
                                    category: true,
                                },
                            },
                        },
                    },
                    { optimisticUpdate: true },
                ),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(userResult.current.data).toHaveLength(1);
        });

        // populate the cache with a category
        const categoryData: any[] = [{ id: '1', name: 'category1', posts: [] }];

        nock(BASE_URL)
            .get('/api/model/category/findMany')
            .query(true)
            .reply(200, () => ({ data: categoryData }))
            .persist();

        const { result: categoryResult } = renderHook(
            () =>
                useClientQueries(schema).category.useFindMany(
                    {
                        include: {
                            posts: true,
                        },
                    },
                    { optimisticUpdate: true },
                ),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(categoryResult.current.data).toHaveLength(1);
        });

        // create a post and connect it to the category
        nock(BASE_URL)
            .post('/api/model/post/create')
            .reply(200, () => ({
                data: null,
            }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).post.useCreate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() =>
            mutationResult.current.mutate({
                data: { title: 'post1', owner: { connect: { id: '1' } }, category: { connect: { id: '1' } } },
            }),
        );

        // assert that the post was created and connected to the category
        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey(
                    'Category',
                    'findMany',
                    {
                        include: {
                            posts: true,
                        },
                    },
                    { infinite: false, optimisticUpdate: true },
                ),
            );
            const posts = cacheData[0].posts;
            expect(posts).toHaveLength(1);
            expect(posts[0]).toMatchObject({
                $optimistic: true,
                id: expect.any(String),
                title: 'post1',
                ownerId: '1',
            });
        });

        // assert that the post was created and connected to the user, and included the category
        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey(
                    'User',
                    'findMany',
                    {
                        include: {
                            posts: {
                                include: {
                                    category: true,
                                },
                            },
                        },
                    },
                    { infinite: false, optimisticUpdate: true },
                ),
            );
            const posts = cacheData[0].posts;
            expect(posts).toHaveLength(1);
            expect(posts[0]).toMatchObject({
                $optimistic: true,
                id: expect.any(String),
                title: 'post1',
                ownerId: '1',
                categoryId: '1',
                // TODO: should this include the category object and not just the foreign key?
                // category: { $optimistic: true, id: '1', name: 'category1' },
            });
        });
    });

    it('works with optimistic update with optional one-to-many relationship', async () => {
        const { queryClient, wrapper } = createWrapper();

        // populate the cache with a post, with an optional category relationship
        const postData: any = {
            id: '1',
            title: 'post1',
            ownerId: '1',
            categoryId: null,
            category: null,
        };

        const data: any[] = [postData];

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .query(true)
            .reply(200, () => ({
                data,
            }))
            .persist();

        const { result: postResult } = renderHook(
            () =>
                useClientQueries(schema).post.useFindMany(
                    {
                        include: {
                            category: true,
                        },
                    },
                    { optimisticUpdate: true },
                ),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(postResult.current.data).toHaveLength(1);
        });

        // mock a put request to update the post title
        nock(makeUrl('Post', 'update'))
            .put(/.*/)
            .reply(200, () => {
                postData.title = 'postA';
                return { data: postData };
            });

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).post.useUpdate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ where: { id: '1' }, data: { title: 'postA' } }));

        // assert that the post was updated despite the optional (null) category relationship
        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey(
                    'Post',
                    'findMany',
                    {
                        include: {
                            category: true,
                        },
                    },
                    { infinite: false, optimisticUpdate: true },
                ),
            );
            const posts = cacheData;
            expect(posts).toHaveLength(1);
            expect(posts[0]).toMatchObject({
                $optimistic: true,
                id: expect.any(String),
                title: 'postA',
                ownerId: '1',
                categoryId: null,
                category: null,
            });
        });
    });

    it('works with optimistic update with nested optional one-to-many relationship', async () => {
        const { queryClient, wrapper } = createWrapper();

        // populate the cache with a user and a post, with an optional category
        const postData: any = {
            id: '1',
            title: 'post1',
            ownerId: '1',
            categoryId: null,
            category: null,
        };

        const userData: any[] = [{ id: '1', name: 'user1', posts: [postData] }];

        nock(BASE_URL)
            .get('/api/model/user/findMany')
            .query(true)
            .reply(200, () => {
                return { data: userData };
            })
            .persist();

        const { result: userResult } = renderHook(
            () =>
                useClientQueries(schema).user.useFindMany(
                    {
                        include: {
                            posts: {
                                include: {
                                    category: true,
                                },
                            },
                        },
                    },
                    { optimisticUpdate: true },
                ),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(userResult.current.data).toHaveLength(1);
        });

        // mock a put request to update the post title
        nock(BASE_URL)
            .put('/api/model/post/update')
            .reply(200, () => {
                postData.title = 'postA';
                return { data: postData };
            });

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).post.useUpdate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ where: { id: '1' }, data: { title: 'postA' } }));

        // assert that the post was updated
        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey(
                    'User',
                    'findMany',
                    {
                        include: {
                            posts: {
                                include: {
                                    category: true,
                                },
                            },
                        },
                    },
                    { infinite: false, optimisticUpdate: true },
                ),
            );
            const posts = cacheData[0].posts;
            expect(posts).toHaveLength(1);
            expect(posts[0]).toMatchObject({
                $optimistic: true,
                id: expect.any(String),
                title: 'postA',
                ownerId: '1',
                categoryId: null,
                category: null,
            });
        });
    });

    it('works with optimistic nested create updating query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [];

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({
                data,
            }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).post.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'create'))
            .post(/.*/)
            .reply(200, () => ({
                data: null,
            }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useCreate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ data: { email: 'user1', posts: { create: { title: 'post1' } } } }));

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('Post', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(1);
            expect(cacheData[0].$optimistic).toBe(true);
            expect(cacheData[0].id).toBeTruthy();
            expect(cacheData[0].title).toBe('post1');
        });
    });

    it('works with optimistic create many', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({
                data,
            }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'createMany'))
            .post(/.*/)
            .reply(200, () => ({
                data: null,
            }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useCreateMany({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ data: [{ email: 'foo' }, { email: 'bar' }] }));

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(2);
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

    it('works with optimistic update simple', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => ({
                data,
            }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindUnique(queryArgs, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ name: 'foo' });
        });

        nock(makeUrl('User', 'update'))
            .put(/.*/)
            .reply(200, () => data);

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useUpdate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ ...queryArgs, data: { name: 'bar' } }));

        await waitFor(() => {
            const cacheData = queryClient.getQueryData(
                getQueryKey('User', 'findUnique', queryArgs, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toMatchObject({ name: 'bar', $optimistic: true });
        });
    });

    it('works with optimistic update updating nested query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' }, include: { posts: true } };
        const data = { id: '1', name: 'foo', posts: [{ id: 'p1', title: 'post1' }] };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindUnique(queryArgs, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ name: 'foo' });
        });

        nock(makeUrl('Post', 'update'))
            .put(/.*/)
            .reply(200, () => data);

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).post.useUpdate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() =>
            mutationResult.current.mutate({
                where: { id: 'p1' },
                data: { title: 'post2', owner: { connect: { id: '2' } } },
            }),
        );

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findUnique', queryArgs, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData.posts[0]).toMatchObject({ title: 'post2', $optimistic: true, ownerId: '2' });
        });
    });

    it('works with optimistic nested update updating query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: 'p1' } };
        const data = { id: 'p1', title: 'post1' };

        nock(makeUrl('Post', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).post.useFindUnique(queryArgs, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ title: 'post1' });
        });

        nock(makeUrl('User', 'update'))
            .put(/.*/)
            .reply(200, () => data);

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useUpdate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() =>
            mutationResult.current.mutate({
                where: { id: '1' },
                data: { posts: { update: { where: { id: 'p1' }, data: { title: 'post2' } } } },
            }),
        );

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('Post', 'findUnique', queryArgs, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toMatchObject({ title: 'post2', $optimistic: true });
        });
    });

    it('works with optimistic upsert - create simple', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'upsert'))
            .post(/.*/)
            .reply(200, () => ({ data: null }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useUpsert({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() =>
            mutationResult.current.mutate({
                where: { id: '1' },
                create: { id: '1', email: 'foo' },
                update: { email: 'bar' },
            }),
        );

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(1);
            expect(cacheData[0]).toMatchObject({ id: '1', email: 'foo', $optimistic: true });
        });
    });

    it('works with optimistic upsert - create updating nested query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any = { id: '1', name: 'user1', posts: [{ id: 'p1', title: 'post1' }] };

        nock(makeUrl('User', 'findUnique'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindUnique({ where: { id: '1' } }, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ id: '1' });
        });

        nock(makeUrl('Post', 'upsert'))
            .post(/.*/)
            .reply(200, () => ({ data: null }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).post.useUpsert({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() =>
            mutationResult.current.mutate({
                where: { id: 'p2' },
                create: { id: 'p2', title: 'post2', owner: { connect: { id: '1' } } },
                update: { title: 'post3' },
            }),
        );

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findUnique', { where: { id: '1' } }, { infinite: false, optimisticUpdate: true }),
            );
            const posts = cacheData.posts;
            expect(posts).toHaveLength(2);
            expect(posts[0]).toMatchObject({ id: 'p2', title: 'post2', ownerId: '1', $optimistic: true });
        });
    });

    it('works with optimistic upsert - nested create updating query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any = [{ id: 'p1', title: 'post1' }];

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).post.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(1);
        });

        nock(makeUrl('User', 'update'))
            .post(/.*/)
            .reply(200, () => ({ data: null }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useUpdate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() =>
            mutationResult.current.mutate({
                where: { id: '1' },
                data: {
                    posts: {
                        upsert: {
                            where: { id: 'p2' },
                            create: { id: 'p2', title: 'post2' },
                            update: { title: 'post3' },
                        },
                    },
                },
            }),
        );

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('Post', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(2);
            expect(cacheData[0]).toMatchObject({ id: 'p2', title: 'post2', $optimistic: true });
        });
    });

    it('works with optimistic upsert - update simple', async () => {
        const { queryClient, wrapper } = createWrapper();

        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindUnique(queryArgs, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ name: 'foo' });
        });

        nock(makeUrl('User', 'upsert'))
            .post(/.*/)
            .reply(200, () => data);

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useUpsert({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ ...queryArgs, update: { email: 'bar' }, create: { email: 'zee' } }));

        await waitFor(() => {
            const cacheData = queryClient.getQueryData(
                getQueryKey('User', 'findUnique', queryArgs, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toMatchObject({ email: 'bar', $optimistic: true });
        });
    });

    it('works with optimistic upsert - update updating nested query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any = { id: '1', name: 'user1', posts: [{ id: 'p1', title: 'post1' }] };

        nock(makeUrl('User', 'findUnique'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindUnique({ where: { id: '1' } }, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ id: '1' });
        });

        nock(makeUrl('Post', 'upsert'))
            .post(/.*/)
            .reply(200, () => ({ data: null }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).post.useUpsert({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() =>
            mutationResult.current.mutate({
                where: { id: 'p1' },
                create: { id: 'p1', title: 'post1' },
                update: { title: 'post2' },
            }),
        );

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findUnique', { where: { id: '1' } }, { infinite: false, optimisticUpdate: true }),
            );
            const posts = cacheData.posts;
            expect(posts).toHaveLength(1);
            expect(posts[0]).toMatchObject({ id: 'p1', title: 'post2', $optimistic: true });
        });
    });

    it('works with optimistic upsert - nested update updating query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any = [{ id: 'p1', title: 'post1' }];

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).post.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(1);
        });

        nock(makeUrl('User', 'update'))
            .post(/.*/)
            .reply(200, () => ({ data: null }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useUpdate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() =>
            mutationResult.current.mutate({
                where: { id: '1' },
                data: {
                    posts: {
                        upsert: {
                            where: { id: 'p1' },
                            create: { id: 'p1', title: 'post1' },
                            update: { title: 'post2' },
                        },
                    },
                },
            }),
        );

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('Post', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(1);
            expect(cacheData[0]).toMatchObject({ id: 'p1', title: 'post2', $optimistic: true });
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

    it('works with optimistic delete simple', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [{ id: '1', name: 'foo' }];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(1);
        });

        nock(makeUrl('User', 'delete'))
            .delete(/.*/)
            .reply(200, () => ({ data }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useDelete({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ where: { id: '1' } }));

        await waitFor(() => {
            const cacheData = queryClient.getQueryData(
                getQueryKey('User', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(0);
        });
    });

    it('works with optimistic delete nested query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any = { id: '1', name: 'foo', posts: [{ id: 'p1', title: 'post1' }] };

        nock(makeUrl('User', 'findFirst'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () =>
                useClientQueries(schema).user.useFindFirst(
                    {
                        include: { posts: true },
                    },
                    { optimisticUpdate: true },
                ),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ id: '1' });
        });

        nock(makeUrl('Post', 'delete'))
            .delete(/.*/)
            .reply(200, () => ({ data }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).post.useDelete({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ where: { id: 'p1' } }));

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey(
                    'User',
                    'findFirst',
                    { include: { posts: true } },
                    { infinite: false, optimisticUpdate: true },
                ),
            );
            expect(cacheData.posts).toHaveLength(0);
        });
    });

    it('works with optimistic nested delete update query', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any = [
            { id: 'p1', title: 'post1' },
            { id: 'p2', title: 'post2' },
        ];

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).post.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(2);
        });

        nock(makeUrl('User', 'update'))
            .put(/.*/)
            .reply(200, () => ({ data }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useUpdate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ where: { id: '1' }, data: { posts: { delete: { id: 'p1' } } } }));

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('Post', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(1);
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

    it('optimistic create with custom provider', async () => {
        const { queryClient, wrapper } = createWrapper();

        const data: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'create'))
            .post(/.*/)
            .reply(200, () => ({ data: null }))
            .persist();

        const { result: mutationResult1 } = renderHook(
            () =>
                useClientQueries(schema).user.useCreate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                    optimisticDataProvider: ({ queryModel, queryOperation }) => {
                        if (queryModel === 'User' && queryOperation === 'findMany') {
                            return { kind: 'Skip' };
                        } else {
                            return { kind: 'ProceedDefault' };
                        }
                    },
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult1.current.mutate({ data: { email: 'foo' } }));

        // cache should not update
        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(0);
        });

        const { result: mutationResult2 } = renderHook(
            () =>
                useClientQueries(schema).user.useCreate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                    optimisticDataProvider: ({ queryModel, queryOperation, currentData, mutationArgs }) => {
                        if (queryModel === 'User' && queryOperation === 'findMany') {
                            return {
                                kind: 'Update',
                                data: [
                                    ...currentData,
                                    { id: 100, email: mutationArgs.data.email + 'hooray', $optimistic: true },
                                ],
                            };
                        } else {
                            return { kind: 'ProceedDefault' };
                        }
                    },
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult2.current.mutate({ data: { email: 'foo' } }));

        // cache should update
        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(1);
            expect(cacheData[0].$optimistic).toBe(true);
            expect(cacheData[0].id).toBeTruthy();
            expect(cacheData[0].email).toBe('foohooray');
        });
    });

    it('optimistic update mixed with non-zenstack queries', async () => {
        const { queryClient, wrapper } = createWrapper();

        // non-zenstack query
        const { result: myQueryResult } = renderHook(
            () => useQuery({ queryKey: ['myQuery'], queryFn: () => ({ data: 'myData' }) }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(myQueryResult.current.data).toEqual({ data: 'myData' });
        });

        const data: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => ({ data }))
            .persist();

        const { result } = renderHook(
            () => useClientQueries(schema).user.useFindMany(undefined, { optimisticUpdate: true }),
            {
                wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'create'))
            .post(/.*/)
            .reply(200, () => ({ data: null }));

        const { result: mutationResult } = renderHook(
            () =>
                useClientQueries(schema).user.useCreate({
                    optimisticUpdate: true,
                    invalidateQueries: false,
                }),
            {
                wrapper,
            },
        );

        act(() => mutationResult.current.mutate({ data: { email: 'foo' } }));

        await waitFor(() => {
            const cacheData: any = queryClient.getQueryData(
                getQueryKey('User', 'findMany', undefined, { infinite: false, optimisticUpdate: true }),
            );
            expect(cacheData).toHaveLength(1);
            expect(cacheData[0].$optimistic).toBe(true);
            expect(cacheData[0].id).toBeTruthy();
            expect(cacheData[0].email).toBe('foo');
        });
    });

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

        act(() => txResult.current.mutate([{ model: 'User', op: 'create', args: { data: { email: 'foo@bar.com' } } }]));

        await waitFor(() => {
            expect(txResult.current.isSuccess).toBe(true);
            // cache not refreshed because invalidation was disabled
            const cachedUsers = queryClient.getQueryData(getQueryKey('User', 'findMany', undefined));
            expect(cachedUsers).toHaveLength(0);
        });
    });

    describe('JSON null value serialization', () => {
        function createWrapper() {
            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <QuerySettingsProvider value={{ endpoint: `${BASE_URL}/api/model` }}>
                        {children}
                    </QuerySettingsProvider>
                </QueryClientProvider>
            );
            return { queryClient, wrapper };
        }

        it('encodes DbNull in query filter and includes serialization metadata in URL', async () => {
            const { wrapper } = createWrapper();
            let capturedUri = '';

            nock(BASE_URL)
                .get(/.*/)
                .reply(200, function (uri) {
                    capturedUri = uri;
                    return { data: [] };
                });

            const { result } = renderHook(
                () => useClientQueries(schema).user.useFindMany({ where: { name: DbNull } } as any),
                { wrapper },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            const url = new URL(capturedUri, BASE_URL);
            expect(url.searchParams.has('meta')).toBe(true);

            const q = JSON.parse(decodeURIComponent(url.searchParams.get('q')!));
            const meta = JSON.parse(decodeURIComponent(url.searchParams.get('meta')!));
            const reconstructed = deserialize(q, meta.serialization) as any;
            expect(reconstructed.where.name.__brand).toBe('DbNull');
        });

        it('encodes JsonNull in query filter and includes serialization metadata in URL', async () => {
            const { wrapper } = createWrapper();
            let capturedUri = '';

            nock(BASE_URL)
                .get(/.*/)
                .reply(200, function (uri) {
                    capturedUri = uri;
                    return { data: [] };
                });

            const { result } = renderHook(
                () => useClientQueries(schema).user.useFindMany({ where: { name: JsonNull } } as any),
                { wrapper },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            const url = new URL(capturedUri, BASE_URL);
            expect(url.searchParams.has('meta')).toBe(true);

            const q = JSON.parse(decodeURIComponent(url.searchParams.get('q')!));
            const meta = JSON.parse(decodeURIComponent(url.searchParams.get('meta')!));
            const reconstructed = deserialize(q, meta.serialization) as any;
            expect(reconstructed.where.name.__brand).toBe('JsonNull');
        });

        it('encodes AnyNull in query filter and includes serialization metadata in URL', async () => {
            const { wrapper } = createWrapper();
            let capturedUri = '';

            nock(BASE_URL)
                .get(/.*/)
                .reply(200, function (uri) {
                    capturedUri = uri;
                    return { data: [] };
                });

            const { result } = renderHook(
                () => useClientQueries(schema).user.useFindMany({ where: { name: AnyNull } } as any),
                { wrapper },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            const url = new URL(capturedUri, BASE_URL);
            expect(url.searchParams.has('meta')).toBe(true);

            const q = JSON.parse(decodeURIComponent(url.searchParams.get('q')!));
            const meta = JSON.parse(decodeURIComponent(url.searchParams.get('meta')!));
            const reconstructed = deserialize(q, meta.serialization) as any;
            expect(reconstructed.where.name.__brand).toBe('AnyNull');
        });

        it('encodes DbNull in mutation body with serialization metadata', async () => {
            const { wrapper } = createWrapper();
            let capturedBody: any;

            nock(BASE_URL)
                .post(/.*/)
                .reply(200, function (_uri, body) {
                    capturedBody = body;
                    return { data: { id: '1', name: null } };
                });

            const { result } = renderHook(() => useClientQueries(schema).user.useCreate(), { wrapper });

            act(() => result.current.mutate({ data: { email: 'test@example.com', name: DbNull } } as any));

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(capturedBody.meta?.serialization).toBeDefined();
            const reconstructed = deserialize({ data: capturedBody.data }, capturedBody.meta.serialization) as any;
            expect(reconstructed.data.name.__brand).toBe('DbNull');
        });

        it('deserializes null sentinels in server response back to branded instances', async () => {
            const { wrapper } = createWrapper();

            const responseData = { id: '1', email: 'test@example.com', name: DbNull };
            const { data: serializedData, meta: serializedMeta } = serialize(responseData);

            nock(BASE_URL)
                .get(/.*/)
                .reply(200, { data: serializedData, meta: { serialization: serializedMeta } });

            const { result } = renderHook(() => useClientQueries(schema).user.useFindUnique({ where: { id: '1' } }), {
                wrapper,
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect((result.current.data as any).name.__brand).toBe('DbNull');
        });
    });
});
