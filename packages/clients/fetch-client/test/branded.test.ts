import type { TypeDefResult } from '@zenstackhq/orm';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createClient } from '../src/index';
import { schema } from './schemas/branded/schema-lite';

const ENDPOINT = 'http://localhost/api/model';

type Schema = typeof schema;
type UserId = TypeDefResult<Schema, 'UserId'>;
type PostId = TypeDefResult<Schema, 'PostId'>;
type Email = TypeDefResult<Schema, 'Email'>;
type Age = TypeDefResult<Schema, 'Age'>;

function makeResponseText(data: unknown) {
    return JSON.stringify({ data });
}

function parseBody(init: RequestInit | undefined) {
    return JSON.parse(init?.body as string);
}

describe('Branded primitive types', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        mockFetch = vi.fn();
        globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.resetAllMocks();
    });

    it('brands model fields in results', async () => {
        const data = { id: 'user_1', email: 'u1@test.com', age: 20 };
        mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(data) });

        const client = createClient(schema, { endpoint: ENDPOINT });
        const user = await client.user.findUniqueOrThrow({ where: { id: 'user_1' as UserId } });

        expectTypeOf(user).toEqualTypeOf<{ id: UserId; email: Email; age: Age | null }>();
        expectTypeOf(user.id).not.toEqualTypeOf<PostId>();

        // branding is type-only, the deserialized values are plain primitives
        expect(user).toEqual(data);
    });

    it('brands fields of included relations', async () => {
        const data = {
            id: 'user_1',
            email: 'u1@test.com',
            age: null,
            posts: [{ id: 'post_1', title: 'Post 1', authorId: 'user_1' }],
        };
        mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(data) });

        const client = createClient(schema, { endpoint: ENDPOINT });
        const user = await client.user.findUniqueOrThrow({
            where: { email: 'u1@test.com' as Email },
            include: { posts: true },
        });

        expectTypeOf(user.posts).toEqualTypeOf<Array<{ id: PostId; title: string; authorId: UserId }>>();
        expect(user.posts[0]?.authorId).toBe(user.id);
    });

    it('sends branded values as plain primitives', async () => {
        const data = { id: 'post_1', title: 'Post 1', authorId: 'user_1' };
        mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(data) });

        const client = createClient(schema, { endpoint: ENDPOINT });
        const post = await client.post.create({
            data: { id: 'post_1' as PostId, title: 'Post 1', author: { connect: { id: 'user_1' as UserId } } },
        });

        expectTypeOf(post.authorId).toEqualTypeOf<UserId>();

        const [url, init] = mockFetch.mock.calls[0] ?? [];
        expect(url).toBe(`${ENDPOINT}/post/create`);
        expect(parseBody(init)).toEqual({
            data: { id: 'post_1', title: 'Post 1', author: { connect: { id: 'user_1' } } },
        });
    });

    it('requires branded values in value filters, but not in substring filters', async () => {
        mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText([]) });

        const client = createClient(schema, { endpoint: ENDPOINT });
        await client.user.findMany({
            where: { id: { startsWith: 'user_', not: 'user_2' as UserId }, age: { gte: 18 as Age } },
        });

        const [url] = mockFetch.mock.calls[0] ?? [];
        const q = JSON.parse(decodeURIComponent(new URL(url).searchParams.get('q')!));
        expect(q).toEqual({ where: { id: { startsWith: 'user_', not: 'user_2' }, age: { gte: 18 } } });

        // type-level checks only, never invoked
        const _typeChecks = () => {
            // @ts-expect-error plain strings are not branded
            client.user.findMany({ where: { id: 'user_1' } });

            // @ts-expect-error plain strings are not branded
            client.user.findMany({ where: { id: { in: ['user_1'] } } });

            // @ts-expect-error plain numbers are not branded
            client.user.findMany({ where: { age: { gte: 18 } } });

            // @ts-expect-error a PostId is not a UserId
            client.post.findMany({ where: { authorId: 'post_1' as PostId } });
        };
        void _typeChecks;
    });

    it('requires branded values for writes and unique lookups', () => {
        const client = createClient(schema, { endpoint: ENDPOINT });

        // type-level checks only, never invoked
        const _typeChecks = () => {
            // @ts-expect-error plain strings are not branded
            client.user.findUnique({ where: { id: 'user_1' } });

            client.user.create({
                // @ts-expect-error plain strings are not branded
                data: { id: 'user_1', email: 'u1@test.com' },
            });

            client.user.update({
                where: { id: 'user_1' as UserId },
                // @ts-expect-error plain numbers are not branded
                data: { age: 30 },
            });

            client.post.create({
                // @ts-expect-error a UserId is not a PostId
                data: { id: 'post_1' as UserId, title: 'Post 1', authorId: 'user_1' as UserId },
            });
        };
        void _typeChecks;
    });

    it('brands procedure params and results', async () => {
        const client = createClient(schema, { endpoint: ENDPOINT });

        mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText('u1@test.com') });
        const userEmail = await client.$procs.getUserEmail.query({ args: { id: 'user_1' as UserId } });
        expectTypeOf(userEmail).toEqualTypeOf<Email>();
        expect(userEmail).toBe('u1@test.com');

        mockFetch.mockResolvedValue({ ok: true, text: async () => makeResponseText(30) });
        const userAge = await client.$procs.setUserAge.mutate({ args: { id: 'user_1' as UserId, age: 30 as Age } });
        expectTypeOf(userAge).toEqualTypeOf<Age>();
        expect(userAge).toBe(30);

        const [url, init] = mockFetch.mock.calls[1] ?? [];
        expect(url).toBe(`${ENDPOINT}/$procs/setUserAge`);
        expect(parseBody(init)).toEqual({ args: { id: 'user_1', age: 30 } });

        const _typeChecks = () => {
            // @ts-expect-error plain strings are not branded
            client.$procs.getUserEmail.query({ args: { id: 'user_1' } });
        };
        void _typeChecks;
    });
});
