import { type inferAsyncReturnType } from '@trpc/server';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { enhance } from '@zenstackhq/runtime';
import { prisma } from './db';

export const createContext = async ({ req, res }: CreateNextContextOptions) => {
    return {
        prisma: enhance(prisma, { user: { id: 'user1' } }),
    };
};

export type Context = inferAsyncReturnType<typeof createContext>;
