/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import { getModelZodSchemas, ModelZodSchema } from '@zenstackhq/runtime/zod';
import type { Handler, Request, Response } from 'express';
import RPCAPIHandler from '../api/rpc';
import { AdapterBaseOptions } from '../types';
import { marshalToObject, unmarshalFromObject } from '../utils';

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

    return async (request, response) => {
        const prisma = (await options.getPrisma(request, response)) as DbClientContract;
        if (!prisma) {
            throw new Error('unable to get prisma from request context');
        }

        const r = await requestHandler({
            method: request.method,
            path: request.path,
            query: request.query as Record<string, string>,
            requestBody: unmarshalFromObject(request.body, options.useSuperJson === true),
            prisma,
        });

        response.status(r.status).json(marshalToObject(r.body, options.useSuperJson === true));
    };
};

export default factory;
