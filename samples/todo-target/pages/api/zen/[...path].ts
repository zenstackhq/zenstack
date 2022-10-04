import { RequestHandler, RequestionHandlerOptions } from '@zenstack/server';
import { NextApiRequest, NextApiResponse } from 'next';
import { authOptions } from '@api/auth/[...nextauth]';
import { unstable_getServerSession } from 'next-auth';

const options: RequestionHandlerOptions = {
    async getServerUser(req: NextApiRequest, res: NextApiResponse) {
        const session = await unstable_getServerSession(req, res, authOptions);
        return session?.user;
    },
};
export default RequestHandler(options);
