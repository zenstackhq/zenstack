/**
 * @vitest-environment happy-dom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { deserialize, serialize } from '@zenstackhq/client-helpers/fetch';
import nock from 'nock';
import { describe, expect, it } from 'vitest';
import { AnyNull, DbNull, JsonNull, useClientQueries } from '../../src/react';
import { schema } from '../schemas/basic/schema-lite';
import { BASE_URL, createWrapper, registerCleanup } from './helpers';

registerCleanup();

describe('JSON null value serialization', () => {
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
