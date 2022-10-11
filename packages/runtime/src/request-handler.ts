import { NextApiRequest, NextApiResponse } from 'next';
import DataHandler from './handler/data-handler';
import { AuthUser, Service } from './types';

export type RequestHandlerOptions = {
    getServerUser: (
        req: NextApiRequest,
        res: NextApiResponse
    ) => Promise<AuthUser | undefined>;
};

export function RequestHandler<DbClient>(
    service: Service<DbClient>,
    options: RequestHandlerOptions
) {
    const dataHandler = new DataHandler<DbClient>(service, options);
    return async (req: NextApiRequest, res: NextApiResponse) => {
        const [route, ...rest] = req.query.path as string[];
        switch (route) {
            case 'data':
                return dataHandler.handle(req, res, rest);

            default:
                res.status(404).json({ error: 'Unknown route: ' + route });
        }
    };
}
