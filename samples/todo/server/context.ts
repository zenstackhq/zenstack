import { type inferAsyncReturnType } from '@trpc/server';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getServerAuthSession } from './common/get-server-auth-session';

import { prisma } from './db/client';
import { withPolicy } from '@zenstackhq/runtime/server';
import policy from './policy';

export const createContext = async ({ req, res }: CreateNextContextOptions) => {
    const session = await getServerAuthSession({ req, res });
    return {
        session,
        prisma: withPolicy<typeof prisma>(prisma, policy, {
            user: session?.user,
        }),
    };
};

export type Context = inferAsyncReturnType<typeof createContext>;
