/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { renderHook, waitFor } from '@testing-library/react';
import { lowerCaseFirst } from 'lower-case-first';
import nock from 'nock';
import { useSWRConfig } from 'swr';
import { RequestHandlerContext, getQueryKey, mutationRequest, useModelQuery, useInvalidation } from '../src/runtime';
import { modelMeta } from './test-model-meta';
import React from 'react';

const ENDPOINT = 'http://localhost/api/model';

function makeUrl(model: string, operation: string, args?: unknown) {
    let r = `${ENDPOINT}/${lowerCaseFirst(model)}/${operation}`;
    if (args) {
        r += `?q=${encodeURIComponent(JSON.stringify(args))}`;
    }
    return r;
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RequestHandlerContext.Provider value={{ endpoint: ENDPOINT }}>{children}</RequestHandlerContext.Provider>
);

describe('SWR React Hooks Test', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    it('simple query', async () => {
        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => {
                console.log('Query data:', data);
                return {
                    data,
                };
            });

        const { result } = renderHook(() => useModelQuery('User', 'findUnique', queryArgs), { wrapper });

        await waitFor(() => {
            expect(result.current.data).toMatchObject(data);
        });

        const { result: cacheResult } = renderHook(() => useSWRConfig());
        await waitFor(() => {
            const cacheData = cacheResult.current.cache.get(getQueryKey('User', 'findUnique', queryArgs));
            expect(cacheData?.data).toMatchObject(data);
        });
    });

    it('create and invalidation', async () => {
        const data: any[] = [];

        nock(makeUrl('User', 'findMany'))
            .get(/.*/)
            .reply(200, () => {
                console.log('Querying data:', JSON.stringify(data));
                return { data };
            })
            .persist();

        const { result } = renderHook(() => useModelQuery('User', 'findMany'), { wrapper });
        await waitFor(() => {
            expect(result.current.data).toHaveLength(0);
        });

        nock(makeUrl('User', 'create'))
            .post(/.*/)
            .reply(200, () => {
                console.log('Mutating data');
                data.push({ id: '1', name: 'foo' });
                return { data: data[0] };
            });

        const { result: useMutateResult } = renderHook(() => useInvalidation('User', modelMeta));

        await waitFor(async () => {
            const mutate = useMutateResult.current;
            const r = await mutationRequest(
                'POST',
                makeUrl('User', 'create', undefined),
                { data: { name: 'foo' } },
                mutate
            );
            console.log('Mutate result:', r);
        });

        const { result: cacheResult } = renderHook(() => useSWRConfig());
        await waitFor(() => {
            const cacheData = cacheResult.current.cache.get(getQueryKey('User', 'findMany', undefined));
            expect(cacheData?.data).toHaveLength(1);
        });
    });

    it('update and invalidation', async () => {
        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => {
                console.log('Querying data:', JSON.stringify(data));
                return { data };
            })
            .persist();

        const { result } = renderHook(() => useModelQuery('User', 'findUnique', queryArgs), { wrapper });
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ name: 'foo' });
        });

        nock(makeUrl('User', 'update'))
            .put(/.*/)
            .reply(200, () => {
                console.log('Mutating data');
                data.name = 'bar';
                return data;
            });

        const { result: useMutateResult } = renderHook(() => useInvalidation('User', modelMeta));

        await waitFor(async () => {
            const mutate = useMutateResult.current;
            const r = await mutationRequest(
                'PUT',
                makeUrl('User', 'update', undefined),
                { ...queryArgs, data: { name: 'bar' } },
                mutate
            );
            console.log('Mutate result:', r);
        });

        const { result: cacheResult } = renderHook(() => useSWRConfig());
        await waitFor(() => {
            const cacheData = cacheResult.current.cache.get(getQueryKey('User', 'findUnique', queryArgs));
            expect(cacheData?.data).toMatchObject({ name: 'bar' });
        });
    });

    it('top-level mutation and nested-read invalidation', async () => {
        const queryArgs = { where: { id: '1' }, include: { posts: true } };
        const data = { posts: [{ id: '1', title: 'post1' }] };

        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => {
                console.log('Querying data:', JSON.stringify(data));
                return { data };
            })
            .persist();

        const { result } = renderHook(() => useModelQuery('User', 'findUnique', queryArgs), { wrapper });
        await waitFor(() => {
            expect(result.current.data).toMatchObject(data);
        });

        nock(makeUrl('Post', 'update'))
            .put(/.*/)
            .reply(200, () => {
                console.log('Mutating data');
                data.posts[0].title = 'post2';
                return data;
            });

        const { result: useMutateResult } = renderHook(() => useInvalidation('Post', modelMeta));

        await waitFor(async () => {
            const mutate = useMutateResult.current;
            const r = await mutationRequest(
                'PUT',
                makeUrl('Post', 'update', undefined),
                { where: { id: '1' }, data: { name: 'post2' } },
                mutate
            );
            console.log('Mutate result:', r);
        });

        const { result: cacheResult } = renderHook(() => useSWRConfig());
        await waitFor(() => {
            const cacheData = cacheResult.current.cache.get(getQueryKey('User', 'findUnique', queryArgs));
            expect(cacheData?.data.posts[0].title).toBe('post2');
        });
    });

    it('nested mutation and top-level-read invalidation', async () => {
        const data = [{ id: '1', title: 'post1', ownerId: '1' }];

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .reply(200, () => {
                console.log('Querying data:', JSON.stringify(data));
                return { data };
            })
            .persist();

        const { result } = renderHook(() => useModelQuery('Post', 'findMany'), { wrapper });
        await waitFor(() => {
            expect(result.current.data).toMatchObject(data);
        });

        nock(makeUrl('User', 'update'))
            .put(/.*/)
            .reply(200, () => {
                console.log('Mutating data');
                data.push({ id: '2', title: 'post2', ownerId: '1' });
                return data;
            });

        const { result: useMutateResult } = renderHook(() => useInvalidation('User', modelMeta));

        await waitFor(async () => {
            const mutate = useMutateResult.current;
            const r = await mutationRequest(
                'PUT',
                makeUrl('User', 'update', undefined),
                { where: { id: '1' }, data: { posts: { create: { title: 'post2' } } } },
                mutate
            );
            console.log('Mutate result:', r);
        });

        const { result: cacheResult } = renderHook(() => useSWRConfig());
        await waitFor(() => {
            const cacheData = cacheResult.current.cache.get(getQueryKey('Post', 'findMany'));
            expect(cacheData?.data).toHaveLength(2);
        });
    });
});

describe('SWR React Hooks Test separate due to potential nock issue', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    it('independent mutation and query', async () => {
        const queryArgs = { where: { id: '1' } };
        const data = { id: '1', name: 'foo' };

        let queryCount = 0;
        nock(makeUrl('User', 'findUnique', queryArgs))
            .get(/.*/)
            .reply(200, () => {
                console.log('Querying data:', JSON.stringify(data));
                queryCount++;
                return { data };
            })
            .persist();

        const { result } = renderHook(() => useModelQuery('User', 'findUnique', queryArgs), { wrapper });
        await waitFor(() => {
            expect(result.current.data).toMatchObject({ name: 'foo' });
        });

        nock(makeUrl('Post', 'create'))
            .post(/.*/)
            .reply(200, () => {
                console.log('Mutating data');
                return { data: { id: '1', title: 'post1' } };
            });

        const { result: useMutateResult } = renderHook(() => useInvalidation('Post', modelMeta));
        await waitFor(async () => {
            const mutate = useMutateResult.current;
            const r = await mutationRequest(
                'POST',
                makeUrl('Post', 'create', undefined),
                { data: { title: 'post1' } },
                mutate
            );
            console.log('Mutate result:', r);
            // no refetch caused by invalidation
            expect(queryCount).toBe(1);
        });
    });

    it('cascaded delete', async () => {
        const data: any[] = [{ id: '1', title: 'post1', ownerId: '1' }];

        nock(makeUrl('Post', 'findMany'))
            .get(/.*/)
            .reply(200, () => {
                console.log('Querying data:', JSON.stringify(data));
                return { data };
            })
            .persist();

        const { result } = renderHook(() => useModelQuery('Post', 'findMany'), { wrapper });
        await waitFor(() => {
            expect(result.current.data).toHaveLength(1);
        });

        nock(makeUrl('User', 'delete'))
            .delete(/.*/)
            .reply(200, () => {
                console.log('Mutating data');
                data.pop();
                return { data: { id: '1' } };
            });

        const { result: useMutateResult } = renderHook(() => useInvalidation('User', modelMeta));

        await waitFor(async () => {
            const mutate = useMutateResult.current;
            await mutationRequest('DELETE', makeUrl('User', 'delete', undefined), { where: { id: '1' } }, mutate);
        });

        const { result: cacheResult } = renderHook(() => useSWRConfig());
        await waitFor(() => {
            const cacheData = cacheResult.current.cache.get(getQueryKey('Post', 'findMany'));
            expect(cacheData?.data).toHaveLength(0);
        });
    });
});
