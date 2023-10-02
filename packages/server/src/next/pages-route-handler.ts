/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { DbClientContract } from '@zenstackhq/runtime';
import { NextApiRequest, NextApiResponse } from 'next';
import { PagesRouteRequestHandlerOptions } from '.';
import RPCAPIHandler from '../api/rpc';
import { loadAssets } from '../shared';

/**
 * Creates a Next.js API endpoint (traditional "pages" route) request handler which encapsulates Prisma CRUD operations.
 *
 * @param options Options for initialization
 * @returns An API endpoint request handler
 */
export default function factory(
    options: PagesRouteRequestHandlerOptions
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
    const { modelMeta, zodSchemas } = loadAssets(options);

    const requestHandler = options.handler || RPCAPIHandler();
    if (options.useSuperJson !== undefined) {
        console.warn(
            'The option "useSuperJson" is deprecated. The server APIs automatically use superjson for serialization.'
        );
    }

    return async (req: NextApiRequest, res: NextApiResponse) => {
        const prisma = (await options.getPrisma(req, res)) as DbClientContract;
        if (!prisma) {
            res.status(500).json({ message: 'unable to get prisma from request context' });
            return;
        }

        if (!req.query.path) {
            res.status(400).json({ message: 'missing path parameter' });
            return;
        }
        const path = (req.query.path as string[]).join('/');

        try {
            const r = await requestHandler({
                method: req.method!,
                path,
                query: req.query as Record<string, string | string[]>,
                requestBody: req.body,
                prisma,
                modelMeta,
                zodSchemas,
                logger: options.logger,
            });
            res.status(r.status).send(r.body);
        } catch (err) {
            res.status(500).send({ message: `An unhandled error occurred: ${err}` });
        }
    };
}
