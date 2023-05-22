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
        if (!prisma) {
            response
                .status(500)
                .json(marshalToObject({ message: 'unable to get prisma from request context' }, useSuperJson));
            return;
        }

        let query: Record<string, string | string[]> = {};
        try {
            query = buildUrlQuery(request.query, useSuperJson);
        } catch {
            response.status(400).json(marshalToObject({ message: 'invalid query parameters' }, useSuperJson));
            return;
        }

        try {
            const url = request.protocol + '://' + request.get('host') + request.originalUrl;
            const r = await requestHandler({
                method: request.method,
                url: new URL(url),
                path: request.path,
                query,
                requestBody: unmarshalFromObject(request.body, useSuperJson),
                prisma,
                modelMeta: options.modelMeta,
                zodSchemas,
                logger: options.logger,
            });
            response.status(r.status).json(marshalToObject(r.body, useSuperJson));
        } catch (err) {
            response
                .status(500)
                .json(marshalToObject({ message: `An unhandled error occurred: ${err}` }, useSuperJson));
        }
    };
};

export default factory;
