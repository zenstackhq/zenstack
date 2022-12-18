import { withPolicy } from '@zenstackhq/runtime/server';
import { GetServerSidePropsContext } from 'next';
import { getServerAuthSession } from 'server/common/get-server-auth-session';
import policy from 'server/policy';
import { prisma } from './client';

/**
 * Get an authorization-enabled database client
 * @param ctx
 * @returns
 */
export async function auth(ctx: {
    req: GetServerSidePropsContext['req'];
    res: GetServerSidePropsContext['res'];
}) {
    const session = await getServerAuthSession(ctx);
    return withPolicy(prisma, policy, { user: session?.user });
}
