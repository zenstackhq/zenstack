import Decimal from 'decimal.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deserialize, fetcher, makeUrl, marshal, serialize, unmarshal } from '../src/fetch';
import type { QueryError } from '../src/types';

describe('Fetcher and serialization tests', () => {
    describe('serialize and deserialize', () => {
        it('serializes plain objects', () => {
            const input = { name: 'John', age: 30 };
            const result = serialize(input);
            expect(result.data).toEqual(input);
            expect(result.meta).toBeUndefined();
        });

        it('serializes and deserializes Decimal values', () => {
            const input = { price: new Decimal('123.45') };
            const { data, meta } = serialize(input);
            const result = deserialize(data, meta);
            expect(result).toEqual(input);
            expect((result as any).price).toBeInstanceOf(Decimal);
            expect((result as any).price.toString()).toBe('123.45');
        });

        it('serializes and deserializes Date values', () => {
            const input = { createdAt: new Date('2023-01-15T12:00:00Z') };
            const { data, meta } = serialize(input);
            const result = deserialize(data, meta);
            expect(result).toEqual(input);
            expect((result as any).createdAt).toBeInstanceOf(Date);
        });

        it('serializes complex nested objects with special types', () => {
            const input = {
                user: {
                    name: 'Alice',
                    balance: new Decimal('999.99'),
                    createdAt: new Date('2023-01-01T00:00:00Z'),
                },
                items: [{ price: new Decimal('10.50') }, { price: new Decimal('20.75') }],
            };
            const { data, meta } = serialize(input);
            const result = deserialize(data, meta);

            expect((result as any).user.balance).toBeInstanceOf(Decimal);
            expect((result as any).user.balance.toString()).toBe('999.99');
            expect((result as any).user.createdAt).toBeInstanceOf(Date);
            expect((result as any).items[0].price).toBeInstanceOf(Decimal);
            expect((result as any).items[1].price.toString()).toBe('20.75');
        });

        it('handles undefined and null values', () => {
            const input = { foo: undefined, bar: null };
            const { data, meta } = serialize(input);
            const result = deserialize(data, meta);
            expect(result).toEqual({ bar: null });
        });

        it('handles arrays with mixed types', () => {
            const input = [new Decimal('1.23'), 'string', 42, new Date('2023-01-01T00:00:00Z')];
            const { data, meta } = serialize(input);
            const result = deserialize(data, meta) as any[];

            expect(result[0]).toBeInstanceOf(Decimal);
            expect(result[1]).toBe('string');
            expect(result[2]).toBe(42);
            expect(result[3]).toBeInstanceOf(Date);
        });
    });

    describe('marshal and unmarshal', () => {
        it('marshals and unmarshals plain objects', () => {
            const input = { name: 'John', age: 30 };
            const marshaled = marshal(input);
            const result = unmarshal(marshaled);
            expect(result).toEqual(input);
        });

        it('marshals and unmarshals objects with Decimal values', () => {
            const input = { price: new Decimal('123.45') };
            const marshaled = marshal(input);
            const parsed = JSON.parse(marshaled);

            // marshal spreads the data into the root object with meta
            expect(parsed.data.price).toBeDefined();
            expect(parsed.meta).toBeDefined();
            expect(parsed.meta.serialization).toBeDefined();

            const result = unmarshal(marshaled);
            expect(result).toHaveProperty('price');
        });

        it('includes metadata when serialization is needed', () => {
            const input = { date: new Date('2023-01-01T00:00:00Z') };
            const marshaled = marshal(input);
            const parsed = JSON.parse(marshaled);
            expect(parsed.meta).toBeDefined();
            expect(parsed.meta.serialization).toBeDefined();
        });

        it('unmarshals response format with data and meta', () => {
            // Create properly serialized data using serialize/deserialize
            const originalValue = { value: new Decimal('100.00') };
            const { data: serializedData, meta: serializedMeta } = serialize(originalValue);

            // Create the response format that unmarshal expects
            const responseFormat = {
                data: serializedData,
                meta: { serialization: serializedMeta },
            };
            const marshaled = JSON.stringify(responseFormat);

            const result = unmarshal(marshaled);
            expect(result).toBeDefined();
            expect((result as any).value).toBeInstanceOf(Decimal);
            // Decimal normalizes '100.00' to '100'
            expect((result as any).value.toString()).toBe('100');
        });
    });

    describe('makeUrl', () => {
        it('creates URL without args', () => {
            const url = makeUrl('/api', 'User', 'findMany');
            expect(url).toBe('/api/user/findMany');
        });

        it('creates URL with simple args', () => {
            const args = { where: { id: '1' } };
            const url = makeUrl('/api', 'User', 'findUnique', args);
            expect(url).toContain('/api/user/findUnique?data=');
            expect(url).toContain(encodeURIComponent(JSON.stringify(args)));
        });

        it('lowercases first letter of model name', () => {
            const url = makeUrl('/api', 'BlogPost', 'findMany');
            expect(url).toBe('/api/blogPost/findMany');
        });

        it('creates URL with args containing special types', () => {
            const args = {
                where: {
                    price: new Decimal('99.99'),
                    createdAt: new Date('2023-01-01T00:00:00Z'),
                },
            };
            const url = makeUrl('/api', 'Product', 'findFirst', args);

            expect(url).toContain('/api/product/findFirst?data=');
            expect(url).toContain('&meta=');

            // Verify we can reconstruct the args from the URL
            const urlObj = new URL(url, 'http://localhost');
            const qParam = urlObj.searchParams.get('data');
            const metaParam = urlObj.searchParams.get('meta');

            expect(qParam).toBeDefined();
            expect(metaParam).toBeDefined();

            const reconstructed = deserialize(JSON.parse(qParam!), JSON.parse(metaParam!).serialization);
            expect((reconstructed as any).where.price).toBeInstanceOf(Decimal);
            expect((reconstructed as any).where.createdAt).toBeInstanceOf(Date);
        });

        it('handles empty args object', () => {
            const url = makeUrl('/api', 'User', 'findMany', {});
            expect(url).toContain('/api/user/findMany?data=');
        });

        it('handles complex nested args', () => {
            const args = {
                include: { posts: true },
                where: { AND: [{ active: true }, { verified: true }] },
            };
            const url = makeUrl('/api', 'User', 'findMany', args);
            expect(url).toContain('/api/user/findMany?data=');
            expect(url).toContain(encodeURIComponent(JSON.stringify(args)));
        });
    });

    describe('fetcher', () => {
        let mockFetch: ReturnType<typeof vi.fn>;
        const originalFetch = globalThis.fetch;

        beforeEach(() => {
            mockFetch = vi.fn();
            global.fetch = mockFetch as typeof global.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
            vi.resetAllMocks();
        });

        it('successfully fetches and deserializes data', async () => {
            const responseData = { id: '1', name: 'Alice' };
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => marshal(responseData),
            });

            const result = await fetcher('/api/user/findUnique', {});

            expect(result).toEqual(responseData);
            expect(mockFetch).toHaveBeenCalledWith('/api/user/findUnique', {});
        });

        it('deserializes response with special types', async () => {
            const responseData = {
                id: '1',
                balance: new Decimal('500.50'),
                createdAt: new Date('2023-01-01T00:00:00Z'),
            };

            // Simulate server response format: { data: {...}, meta: { serialization: {...} } }
            const { data: serializedData, meta: serializedMeta } = serialize(responseData);
            const serverResponse = JSON.stringify({
                data: serializedData,
                meta: { serialization: serializedMeta },
            });

            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => serverResponse,
            });

            const result = await fetcher<typeof responseData>('/api/user/findUnique', {});

            expect(result.balance).toBeInstanceOf(Decimal);
            expect(result.balance.toString()).toBe('500.5');
            expect(result.createdAt).toBeInstanceOf(Date);
        });

        it('throws QueryError on non-ok response', async () => {
            const errorInfo = { code: 'NOT_FOUND', message: 'User not found' };
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                text: async () => marshal({ error: errorInfo }),
            });

            await expect(fetcher('/api/user/findUnique', {})).rejects.toThrow(
                'An error occurred while fetching the data.',
            );

            try {
                await fetcher('/api/user/findUnique', {});
            } catch (error) {
                const queryError = error as QueryError;
                expect(queryError.status).toBe(404);
                expect(queryError.info).toEqual(errorInfo);
            }
        });

        it('returns undefined for cannot-read-back policy rejection', async () => {
            const errorInfo = {
                rejectedByPolicy: true,
                rejectReason: 'cannot-read-back',
            };
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
                text: async () => marshal({ error: errorInfo }),
            });

            const result = await fetcher('/api/user/create', {});

            expect(result).toBeUndefined();
        });

        it('throws error for other policy rejections', async () => {
            const errorInfo = {
                rejectedByPolicy: true,
                rejectReason: 'access-denied',
            };
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
                text: async () => JSON.stringify({ error: errorInfo }),
            });

            await expect(fetcher('/api/user/create', {})).rejects.toThrow();
        });

        it('use custom fetch if provided', async () => {
            const customFetch = vi.fn().mockResolvedValue({
                ok: true,
                text: async () => marshal({ id: '1', name: 'Custom' }),
            });

            const result = await fetcher('/api/user/findUnique', {}, customFetch);

            // Custom fetch should be called instead of global fetch
            expect(customFetch).toHaveBeenCalledWith('/api/user/findUnique', {});
            expect(customFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).not.toHaveBeenCalled();
            expect(result).toEqual({ id: '1', name: 'Custom' });
        });

        it('passes request options to fetch', async () => {
            const responseData = { id: '1' };
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => marshal({ data: responseData }),
            });

            const options: RequestInit = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'test' }),
            };

            await fetcher('/api/user/create', options);

            expect(mockFetch).toHaveBeenCalledWith('/api/user/create', options);
        });

        it('handles empty response body', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => marshal(null),
            });

            const result = await fetcher('/api/user/delete', {});
            expect(result).toBeNull();
        });

        it('handles array responses', async () => {
            const responseData = [
                { id: '1', name: 'Alice' },
                { id: '2', name: 'Bob' },
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => marshal(responseData),
            });

            const result = await fetcher<typeof responseData>('/api/user/findMany', {});

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
            expect(result[0]?.name).toBe('Alice');
            expect(result[1]?.name).toBe('Bob');
        });

        it('preserves response data structure with nested objects', async () => {
            const responseData = {
                id: '1',
                name: 'Alice',
                posts: [
                    { id: 'p1', title: 'Post 1', viewCount: new Decimal('100') },
                    { id: 'p2', title: 'Post 2', viewCount: new Decimal('200') },
                ],
            };

            // Simulate server response format
            const { data: serializedData, meta: serializedMeta } = serialize(responseData);
            const serverResponse = JSON.stringify({
                data: serializedData,
                meta: { serialization: serializedMeta },
            });

            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => serverResponse,
            });

            const result = await fetcher<typeof responseData>('/api/user/findUnique', {});

            expect(result.posts).toHaveLength(2);
            expect(result.posts[0]?.viewCount).toBeInstanceOf(Decimal);
            expect(result.posts[0]?.viewCount.toString()).toBe('100');
            expect(result.posts[1]?.viewCount.toString()).toBe('200');
        });
    });

    describe('Decimal custom serializer', () => {
        it('handles Decimal instances', () => {
            const value = new Decimal('123.456');
            const { data, meta } = serialize({ value });
            const result = deserialize(data, meta);
            expect((result as any).value).toBeInstanceOf(Decimal);
            expect((result as any).value.toString()).toBe('123.456');
        });

        it('handles negative Decimal values', () => {
            const value = new Decimal('-99.99');
            const { data, meta } = serialize({ value });
            const result = deserialize(data, meta);
            expect((result as any).value.toString()).toBe('-99.99');
        });

        it('handles very large Decimal values', () => {
            const value = new Decimal('999999999999999999.999999999999');
            const { data, meta } = serialize({ value });
            const result = deserialize(data, meta);
            expect((result as any).value).toBeInstanceOf(Decimal);
            expect((result as any).value.toString()).toBe(value.toString());
        });

        it('handles zero Decimal value', () => {
            const value = new Decimal('0');
            const { data, meta } = serialize({ value });
            const result = deserialize(data, meta);
            expect((result as any).value.toString()).toBe('0');
        });
    });
});
