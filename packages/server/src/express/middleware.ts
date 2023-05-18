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

    const requestHandler = options.handler || RPCAPIHandler({ logger: options.logger, zodSchemas });
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

        const r = await requestHandler({
            method: request.method,
            path: request.path,
            query,
            requestBody: unmarshalFromObject(request.body, useSuperJson),
            prisma,
        });

        response.status(r.status).json(marshalToObject(r.body, useSuperJson));
    };
};

export default factory;
