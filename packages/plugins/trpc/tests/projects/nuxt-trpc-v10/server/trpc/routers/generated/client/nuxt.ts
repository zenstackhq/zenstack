/* eslint-disable */

import type { AnyRouter } from '@trpc/server';
import { createTRPCNuxtClient as _createTRPCNuxtClient } from 'trpc-nuxt/client';
import type { DeepOverrideAtPath } from './utils';
import { ClientType as UserClientType } from "./User.nuxt.type";
import { ClientType as PostClientType } from "./Post.nuxt.type";

export function createTRPCNuxtClient<TRouter extends AnyRouter, TPath extends string | undefined = undefined>(
    opts: Parameters<typeof _createTRPCNuxtClient<TRouter>>[0]
) {
    const r = _createTRPCNuxtClient<TRouter>(opts);
    return r as DeepOverrideAtPath<typeof r, ClientType<TRouter>, TPath>;
}

export interface ClientType<AppRouter extends AnyRouter> {
    user: UserClientType<AppRouter>;
    post: PostClientType<AppRouter>;
}
