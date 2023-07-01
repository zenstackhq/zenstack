/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import { getModelZodSchemas, ModelZodSchema } from '@zenstackhq/runtime/zod';
import type { Handler, Request, Response } from 'express';
import RPCAPIHandler from '../api/rpc';
import { AdapterBaseOptions } from '../types';
import { buildUrlQuery, marshalToObject, unmarshalFromObject } from '../utils';

/**
 * Express middleware options
 */
export interface MiddlewareOptions extends AdapterBaseOptions {
    /**
     * Callback for getting a PrismaClient for the given request
     */
    getPrisma: (req: Request, res: Response) => unknown | Promise<unknown>;
    /**
     * This option is used to enable/disable the option to manage the response
     * by the middleware. If set to true, the middleware will not send the
     * response and the user will be responsible for sending the response.
     * Defaults to true;
     */
    manageCustomResponse?: boolean;
}

/**
 * Creates an Express middleware for handling CRUD requests.
 */
const factory = (options: MiddlewareOptions): Handler => {
    let zodSchemas: ModelZodSchema | undefined;
    if (typeof options.zodSchemas === 'object') {
        zodSchemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        zodSchemas = getModelZodSchemas();
    }

    const requestHandler = options.handler || RPCAPIHandler();
    const useSuperJson = options.useSuperJson === true;

    return async (request, response) => {
        const prisma = (await options.getPrisma(request, response)) as DbClientContract;
        const { manageCustomResponse } = options;

        if (manageCustomResponse && !prisma) {
            throw new Error('unable to get prisma from request context');
        }

        if (!prisma) {
            response
                .status(500)
                .json(marshalToObject({ message: 'unable to get prisma from request context' }, useSuperJson));
            return;
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
            if (manageCustomResponse) {
                throw new Error('invalid query parameters');
            }
            response.status(400).json(marshalToObject({ message: 'invalid query parameters' }, useSuperJson));
            return;
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
            if (manageCustomResponse) {
                return {
                    status: r.status,
                    body: r.body,
                };
            }
            response.status(r.status).json(marshalToObject(r.body, useSuperJson));
        } catch (err) {
            if (manageCustomResponse) {
                throw err;
            }
            response
                .status(500)
                .json(marshalToObject({ message: `An unhandled error occurred: ${err}` }, useSuperJson));
        }
    };
};

export default factory;
