import { type inferAsyncReturnType } from '@trpc/server';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { withPresets } from '@zenstackhq/runtime';
import { prisma } from './db';

export const createContext = async ({ req, res }: CreateNextContextOptions) => {
    return {
        prisma: withPresets(prisma, { user: { id: 'user1' } }),
    };
};

export type Context = inferAsyncReturnType<typeof createContext>;
