import { type inferAsyncReturnType } from '@trpc/server';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getServerAuthSession } from './common/get-server-auth-session';
import { withAuth } from './db/auth';

export const createContext = async ({ req, res }: CreateNextContextOptions) => {
    const session = await getServerAuthSession({ req, res });
    return {
        session,
        // use auth-enabled db client
        prisma: withAuth({ req, res }),
    };
};

export type Context = inferAsyncReturnType<typeof createContext>;
