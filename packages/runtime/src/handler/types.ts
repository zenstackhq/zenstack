import { NextApiRequest, NextApiResponse } from 'next';

export interface RequestHandler {
    handle(
        req: NextApiRequest,
        res: NextApiResponse,
        path: string[]
    ): Promise<void>;
}
