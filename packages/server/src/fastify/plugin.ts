/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import { ModelZodSchema } from '@zenstackhq/runtime/zod';
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { handleRequest, LoggerConfig } from '../openapi';

/**
 * Fastify plugin options
 */
export interface PluginOptions {
    /**
     * Url prefix, e.g.: /api
     */
    prefix: string;

    /**
     * Callback for gettign a PrismaClient for the given request
     */
    getPrisma: (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;

    /**
     * Logger settings
     */
    logger?: LoggerConfig;

    /**
     * Path to the generated zod schemas
     */
    zodSchemas?: ModelZodSchema;
}

const pluginHandler: FastifyPluginCallback<PluginOptions> = (fastify, options, done) => {
    const prefix = options.prefix ?? '';

    if (options.logger?.info === undefined) {
        console.log(`ZenStackPlugin installing routes at prefix: ${prefix}`);
    } else {
        options.logger?.info?.(`ZenStackPlugin installing routes at prefix: ${prefix}`);
    }

    fastify.all(`${prefix}/*`, async (request, reply) => {
        const prisma = (await options.getPrisma(request, reply)) as DbClientContract;
        if (!prisma) {
            throw new Error('unable to get prisma from request context');
        }
        const query = request.query as Record<string, string>;

        const response = await handleRequest({
            method: request.method,
            path: (request.params as any)['*'],
            query,
            requestBody: request.body,
            prisma,
            logger: options.logger,
            zodSchemas: options.zodSchemas,
        });

        reply.status(response.status).send(response.body);
    });

    done();
};

export default fp(pluginHandler);
