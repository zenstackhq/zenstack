/* eslint-disable */

import type { AnyRouter } from '@trpc/server';
import type { NextPageContext } from 'next';
import { type CreateTRPCNext, createTRPCNext as _createTRPCNext } from '@trpc/next';
import type { DeepOverrideAtPath } from './utils';
import { ClientType as UserClientType } from "./User.next.type";
import { ClientType as PostClientType } from "./Post.next.type";

export function createTRPCNext<
    TRouter extends AnyRouter,
    TPath extends string | undefined = undefined,
    TSSRContext extends NextPageContext = NextPageContext,
    TFlags = null
>(opts: Parameters<typeof _createTRPCNext>[0]) {
    const r: CreateTRPCNext<TRouter, TSSRContext, TFlags> = _createTRPCNext<TRouter, TSSRContext, TFlags>(opts);
    return r as DeepOverrideAtPath<CreateTRPCNext<TRouter, TSSRContext, TFlags>, ClientType<TRouter>, TPath>;
}

export interface ClientType<AppRouter extends AnyRouter> {
    user: UserClientType<AppRouter>;
    post: PostClientType<AppRouter>;
}
