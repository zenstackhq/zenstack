/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { ZodSchemas } from '@zenstackhq/runtime';
import { DbClientContract } from '@zenstackhq/runtime';
import { NextApiRequest, NextApiResponse } from 'next';
import { PagesRouteRequestHandlerOptions } from '.';
import RPCAPIHandler from '../api/rpc';
import { buildUrlQuery, marshalToObject, unmarshalFromObject } from '../utils';

/**
 * Creates a Next.js API endpoint (traditional "pages" route) request handler which encapsulates Prisma CRUD operations.
 *
 * @param options Options for initialization
 * @returns An API endpoint request handler
 */
export default function factory(
    options: PagesRouteRequestHandlerOptions
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
    let zodSchemas: ZodSchemas | undefined;
    if (typeof options.zodSchemas === 'object') {
        zodSchemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        zodSchemas = require('@zenstackhq/runtime/zod');
        if (!zodSchemas) {
            throw new Error('Unable to load zod schemas from default location');
        }
    }

    const requestHandler = options.handler || RPCAPIHandler();
    const useSuperJson = options.useSuperJson === true;
    if (useSuperJson) {
        console.warn(
            'The option "useSuperJson" is deprecated. The server APIs automatically use superjson for serialization.'
        );
    }

    return async (req: NextApiRequest, res: NextApiResponse) => {
        const prisma = (await options.getPrisma(req, res)) as DbClientContract;
        if (!prisma) {
            res.status(500).json(
                marshalToObject({ message: 'unable to get prisma from request context' }, useSuperJson)
            );
            return;
        }

        let query: Record<string, string | string[]> = {};
        try {
            query = buildUrlQuery(req.query, useSuperJson);
        } catch {
            res.status(400).json(marshalToObject({ message: 'invalid query parameters' }, useSuperJson));
            return;
        }

        if (!req.query.path) {
            res.status(400).json(marshalToObject({ message: 'missing path parameter' }, useSuperJson));
            return;
        }
        const path = (req.query.path as string[]).join('/');

        try {
            const r = await requestHandler({
                method: req.method!,
                path,
                query,
                requestBody: unmarshalFromObject(req.body, useSuperJson),
                prisma,
                modelMeta: options.modelMeta,
                zodSchemas,
                logger: options.logger,
            });
            res.status(r.status).send(marshalToObject(r.body, useSuperJson));
        } catch (err) {
            res.status(500).send(marshalToObject({ message: `An unhandled error occurred: ${err}` }, useSuperJson));
        }
    };
}
