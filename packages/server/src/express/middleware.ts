/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import type { Handler, Request, Response } from 'express';
import RPCAPIHandler from '../api/rpc';
import { loadAssets } from '../shared';
import { AdapterBaseOptions } from '../types';

/**
 * Express middleware options
 */
export interface MiddlewareOptions extends AdapterBaseOptions {
    /**
     * Callback for getting a PrismaClient for the given request
     */
    getPrisma: (req: Request, res: Response) => unknown | Promise<unknown>;

    /**
     * Controls if the middleware directly sends a response. If set to false,
     * the response is stored in the `res.locals` object and then the middleware
     * calls the `next()` function to pass the control to the next middleware.
     * Subsequent middleware or request handlers need to make sure to send
     * a response.
     *
     * Defaults to true;
     */
    sendResponse?: boolean;
}

/**
 * Creates an Express middleware for handling CRUD requests.
 */
const factory = (options: MiddlewareOptions): Handler => {
    const { modelMeta, zodSchemas } = loadAssets(options);

    const requestHandler = options.handler || RPCAPIHandler();
    if (options.useSuperJson !== undefined) {
        console.warn(
            'The option "useSuperJson" is deprecated. The server APIs automatically use superjson for serialization.'
        );
    }

    return async (request, response, next) => {
        const prisma = (await options.getPrisma(request, response)) as DbClientContract;
        const { sendResponse } = options;

        if (sendResponse === false && !prisma) {
            throw new Error('unable to get prisma from request context');
        }

        if (!prisma) {
            return response.status(500).json({ message: 'unable to get prisma from request context' });
        }

        // express converts query parameters with square brackets into object
        // e.g.: filter[foo]=bar is parsed to { filter: { foo: 'bar' } }
        // we need to revert this behavior and reconstruct params from original URL
        const url = request.protocol + '://' + request.get('host') + request.originalUrl;
        const searchParams = new URL(url).searchParams;
        const query = Object.fromEntries(searchParams);

        try {
            const r = await requestHandler({
                method: request.method,
                path: request.path,
                query,
                requestBody: request.body,
                prisma,
                modelMeta,
                zodSchemas,
                logger: options.logger,
            });
            if (sendResponse === false) {
                // attach response and pass control to the next middleware
                response.locals = {
                    status: r.status,
                    body: r.body,
                };
                return next();
            }
            return response.status(r.status).json(r.body);
        } catch (err) {
            if (sendResponse === false) {
                throw err;
            }
            return response.status(500).json({ message: `An unhandled error occurred: ${err}` });
        }
    };
};

export default factory;
