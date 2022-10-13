import type { NextApiRequest, NextApiResponse } from 'next';
import { RequestionHandlerOptions } from '..';
import inviteUserHandler from './invite-user';

export default async function (
    req: NextApiRequest,
    res: NextApiResponse,
    path: string[],
    options: RequestionHandlerOptions
) {
    const [type, ...rest] = path;
    switch (type) {
        case 'invite-user':
            return inviteUserHandler(req, res, rest, options);

        default:
            res.status(404).json({ error: 'Unknown function: ' + type });
    }
}
