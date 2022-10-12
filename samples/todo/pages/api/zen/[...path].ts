import { NextApiRequest, NextApiResponse } from 'next';
import {
    type RequestHandlerOptions,
    RequestHandler,
} from '@zenstackhq/runtime';
import { authOptions } from '@api/auth/[...nextauth]';
import { unstable_getServerSession } from 'next-auth';
import service from '@zenstackhq/generated';

const options: RequestHandlerOptions = {
    async getServerUser(req: NextApiRequest, res: NextApiResponse) {
        const session = await unstable_getServerSession(req, res, authOptions);
        return session?.user;
    },
};
export default RequestHandler(service, options);
