/* eslint-disable */

import type { AnyTRPCRouter as AnyRouter } from '@trpc/server';
import type { CreateTRPCReactOptions } from '@trpc/react-query/shared';
import { type CreateTRPCReact, createTRPCReact as _createTRPCReact } from '@trpc/react-query';
import type { DeepOverrideAtPath } from './utils';

export function createTRPCReact<
    TRouter extends AnyRouter,
    TPath extends string | undefined = undefined,
    TSSRContext = unknown
>(opts?: CreateTRPCReactOptions<TRouter>) {
    const r: CreateTRPCReact<TRouter, TSSRContext> = _createTRPCReact<TRouter, TSSRContext>(opts);
    return r as DeepOverrideAtPath<CreateTRPCReact<TRouter, TSSRContext>, ClientType<TRouter>, TPath>;
}
