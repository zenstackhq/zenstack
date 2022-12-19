import { requestHandler } from '@zenstackhq/next';
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from 'server/db/auth';

function getPrisma(req: NextApiRequest, res: NextApiResponse) {
    return withAuth({ req, res });
}

export default requestHandler({ getPrisma });
