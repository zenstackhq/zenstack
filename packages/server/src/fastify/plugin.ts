/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import { getModelZodSchemas, ModelZodSchema } from '@zenstackhq/runtime/zod';
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { HandleRequestFn, LoggerConfig } from '../api/utils';

/**
 * Fastify plugin options
 */
export interface PluginOptions {
    /**
     * Url prefix, e.g.: /api
     */
    prefix: string;

    /**
     * Callback for getting a PrismaClient for the given request
     */
    getPrisma: (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;

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
     * API format to use from `@zenstackhq/server/api`
     */
    api: HandleRequestFn;
}

/**
 * Fastify plugin for handling CRUD requests.
 */
const pluginHandler: FastifyPluginCallback<PluginOptions> = (fastify, options, done) => {
    const prefix = options.prefix ?? '';

    if (options.logger?.info === undefined) {
        console.log(`ZenStackPlugin installing routes at prefix: ${prefix}`);
    } else {
        options.logger?.info?.(`ZenStackPlugin installing routes at prefix: ${prefix}`);
    }

    let schemas: ModelZodSchema | undefined;
    if (typeof options.zodSchemas === 'object') {
        schemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        schemas = getModelZodSchemas();
    }

    fastify.all(`${prefix}/*`, async (request, reply) => {
        const prisma = (await options.getPrisma(request, reply)) as DbClientContract;
        if (!prisma) {
            throw new Error('unable to get prisma from request context');
        }
        const query = request.query as Record<string, string>;

        const response = await options.api({
            method: request.method,
            path: (request.params as any)['*'],
            query,
            requestBody: request.body,
            prisma,
            logger: options.logger,
            zodSchemas: schemas,
        });

        reply.status(response.status).send(response.body);
    });

    done();
};

export default fp(pluginHandler);
