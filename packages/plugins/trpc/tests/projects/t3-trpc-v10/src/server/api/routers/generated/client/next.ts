/* eslint-disable */

import type { AnyRouter } from '@trpc/server';
import type { NextPageContext } from 'next';
import { type CreateTRPCNext, createTRPCNext as _createTRPCNext } from '@trpc/next';
import type { DeepOverrideAtPath } from './utils';
import type { ClientType } from '../routers';

export function createTRPCNext<
    TRouter extends AnyRouter,
    TPath extends string | undefined = undefined,
    TSSRContext extends NextPageContext = NextPageContext,
    TFlags = null,
>(opts: Parameters<typeof _createTRPCNext>[0]) {
    const r: CreateTRPCNext<TRouter, TSSRContext, TFlags> = _createTRPCNext<TRouter, TSSRContext, TFlags>(opts);
    return r as DeepOverrideAtPath<CreateTRPCNext<TRouter, TSSRContext, TFlags>, ClientType<TRouter>, TPath>;
}
