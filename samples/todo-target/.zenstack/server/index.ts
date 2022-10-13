import type { NextApiRequest, NextApiResponse } from 'next';
import dataHandler from './data';
import functionHandler from './function';

export type RequestionHandlerOptions = {
    getServerUser: (
        req: NextApiRequest,
        res: NextApiResponse
    ) => Promise<{ id: string } | undefined>;
};

export function RequestHandler(options: RequestionHandlerOptions) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        console.log('ZenStack request:', req.query.path);

        const [route, ...rest] = req.query.path as string[];

        switch (route) {
            case 'data':
                return dataHandler(req, res, rest, options);

            case 'function':
                return functionHandler(req, res, rest, options);

            default:
                res.status(404).json({ error: 'Unknown route: ' + route });
        }
    };
}
