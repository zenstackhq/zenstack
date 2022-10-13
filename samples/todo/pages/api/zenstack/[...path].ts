import { NextApiRequest, NextApiResponse } from 'next';
import {
    type RequestHandlerOptions,
    requestHandler,
} from '@zenstackhq/runtime/server';
import { authOptions } from '@api/auth/[...nextauth]';
import { unstable_getServerSession } from 'next-auth';
import service from '@zenstackhq/runtime';

const options: RequestHandlerOptions = {
    async getServerUser(req: NextApiRequest, res: NextApiResponse) {
        const session = await unstable_getServerSession(req, res, authOptions);
        return session?.user;
    },
};
export default requestHandler(service, options);
