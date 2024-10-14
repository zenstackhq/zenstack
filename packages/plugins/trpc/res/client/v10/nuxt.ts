/* eslint-disable */

import type { AnyRouter } from '@trpc/server';
import { createTRPCNuxtClient as _createTRPCNuxtClient } from 'trpc-nuxt/client';
import type { DeepOverrideAtPath } from './utils';

export function createTRPCNuxtClient<TRouter extends AnyRouter, TPath extends string | undefined = undefined>(
    opts: Parameters<typeof _createTRPCNuxtClient<TRouter>>[0]
) {
    const r = _createTRPCNuxtClient<TRouter>(opts);
    return r as DeepOverrideAtPath<typeof r, ClientType<TRouter>, TPath>;
}
