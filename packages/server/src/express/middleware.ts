/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import { ModelMeta } from '@zenstackhq/runtime/enhancements/types';
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
     * Model metadata. By default loaded from `node_modules/.zenstack/model-meta` . You can use this
     * option to override with an explicitly loaded one.
     */
    modelMeta?: ModelMeta;

    /**
     * Api request handler function
     */
    api?: HandleRequestFn;
}

/**
 * Creates an Express middleware for handling CRUD requests.
 */
const factory = (options: MiddlewareOptions): Handler => {
    let schemas: ModelZodSchema | undefined;
    if (typeof options.zodSchemas === 'object') {
        schemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        schemas = getModelZodSchemas();
    }

    const requestHandler = options.api || RPCAPIHandler({ logger: options.logger, zodSchemas: schemas });

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
