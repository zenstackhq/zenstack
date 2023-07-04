/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import type { Handler, Request, Response } from 'express';
import RPCAPIHandler from '../api/rpc';
import { AdapterBaseOptions } from '../types';
import { buildUrlQuery, marshalToObject, unmarshalFromObject } from '../utils';
import type { ZodSchemas } from '@zenstackhq/runtime/enhancements/types';

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

    return async (request, response, next) => {
        const prisma = (await options.getPrisma(request, response)) as DbClientContract;
        const { sendResponse } = options;

        if (sendResponse === false && !prisma) {
            throw new Error('unable to get prisma from request context');
        }

        if (!prisma) {
            return response
                .status(500)
                .json(marshalToObject({ message: 'unable to get prisma from request context' }, useSuperJson));
        }

        let query: Record<string, string | string[]> = {};
        try {
            // express converts query parameters with square brackets into object
            // e.g.: filter[foo]=bar is parsed to { filter: { foo: 'bar' } }
            // we need to revert this behavior and reconstruct params from original URL
            const url = request.protocol + '://' + request.get('host') + request.originalUrl;
            const searchParams = new URL(url).searchParams;
            const rawQuery: Record<string, string | string[]> = {};
            for (const key of searchParams.keys()) {
                const values = searchParams.getAll(key);
                rawQuery[key] = values.length === 1 ? values[0] : values;
            }
            query = buildUrlQuery(rawQuery, useSuperJson);
        } catch {
            if (sendResponse === false) {
                throw new Error('invalid query parameters');
            }
            return response.status(400).json(marshalToObject({ message: 'invalid query parameters' }, useSuperJson));
        }

        try {
            const r = await requestHandler({
                method: request.method,
                path: request.path,
                query,
                requestBody: unmarshalFromObject(request.body, useSuperJson),
                prisma,
                modelMeta: options.modelMeta,
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
            return response.status(r.status).json(marshalToObject(r.body, useSuperJson));
        } catch (err) {
            if (sendResponse === false) {
                throw err;
            }
            return response
                .status(500)
                .json(marshalToObject({ message: `An unhandled error occurred: ${err}` }, useSuperJson));
        }
    };
};

export default factory;
