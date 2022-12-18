import { type GetServerSidePropsContext } from 'next';
import { unstable_getServerSession } from 'next-auth';

import { authOptions } from '../../pages/api/auth/[...nextauth]';

export const getServerAuthSession = async (ctx: {
    req: GetServerSidePropsContext['req'];
    res: GetServerSidePropsContext['res'];
}) => {
    return await unstable_getServerSession(ctx.req, ctx.res, authOptions);
};
