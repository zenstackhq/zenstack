import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import nock from 'nock';
import React from 'react';
import { afterEach } from 'vitest';
import { QuerySettingsProvider } from '../../src/react';

export const BASE_URL = 'http://localhost';

export function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <QuerySettingsProvider value={{ endpoint: `${BASE_URL}/api/model` }}>{children}</QuerySettingsProvider>
        </QueryClientProvider>
    );
    return { queryClient, wrapper };
}

export function makeUrl(model: string, operation: string, args?: unknown) {
    let r = `${BASE_URL}/api/model/${model}/${operation}`;
    if (args) {
        r += `?q=${encodeURIComponent(JSON.stringify(args))}`;
    }
    return r;
}

export function registerCleanup() {
    afterEach(() => {
        nock.cleanAll();
        cleanup();
    });
}
