/* eslint-disable */

import type { AnyRouter } from '@trpc/server';
import type { CreateTRPCReactOptions } from '@trpc/react-query/shared';
import { type CreateTRPCReact, createTRPCReact as _createTRPCReact } from '@trpc/react-query';
import type { DeepOverrideAtPath } from './utils';
import type { ClientType } from '../routers';

export function createTRPCReact<
    TRouter extends AnyRouter,
    TPath extends string | undefined = undefined,
    TSSRContext = unknown,
    TFlags = null
>(opts?: CreateTRPCReactOptions<TRouter>) {
    const r: CreateTRPCReact<TRouter, TSSRContext, TFlags> = _createTRPCReact<TRouter, TSSRContext, TFlags>(opts);
    return r as DeepOverrideAtPath<CreateTRPCReact<TRouter, TSSRContext, TFlags>, ClientType<TRouter>, TPath>;
}
