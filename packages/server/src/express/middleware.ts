/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import { getModelZodSchemas, ModelZodSchema } from '@zenstackhq/runtime/zod';
import type { Handler, Request, Response } from 'express';
import RPCAPIHandler from '../api/rpc';
import { HandleRequestFn, LoggerConfig } from '../api/types';

/**
 * Express middleware options
 */
export interface MiddlewareOptions {
    /**
     * Callback for getting a PrismaClient for the given request
     */
    getPrisma: (req: Request, res: Response) => unknown | Promise<unknown>;

    /**
     * Logger settings
     */
    logger?: LoggerConfig;

    /**
     * Zod schemas for validating request input. Pass `true` to load from standard location
     * (need to enable `@core/zod` plugin in schema.zmodel) or omit to disable input validation.
     */
    zodSchemas?: ModelZodSchema | boolean;

    /**
     * Api request handler function
     */
    handler?: HandleRequestFn;
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
            requestBody: request.body,
            prisma,
        });

        response.status(r.status).json(r.body);
    };
};

export default factory;
