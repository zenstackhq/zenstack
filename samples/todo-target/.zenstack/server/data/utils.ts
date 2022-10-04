import type { NextApiRequest, NextApiResponse } from 'next';
import { RequestionHandlerOptions } from '..';

export async function requireUser(
    req: NextApiRequest,
    res: NextApiResponse,
    options: RequestionHandlerOptions
) {
    const user = await options.getServerUser(req, res);
    if (!user || !user.id) {
        res.status(401).json({ message: 'User not logged in' });
        return undefined;
    } else {
        return user;
    }
}

export function unauthorized(res: NextApiResponse) {
    res.status(403).json({ message: 'Unauthorized' });
}
