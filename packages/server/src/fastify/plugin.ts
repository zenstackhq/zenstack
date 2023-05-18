/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import { getModelZodSchemas, ModelZodSchema } from '@zenstackhq/runtime/zod';
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import RPCApiHandler from '../api/rpc';
import { logInfo } from '../api/utils';
import { AdapterBaseOptions } from '../types';
import { buildUrlQuery, marshalToObject, unmarshalFromObject } from '../utils';

/**
 * Fastify plugin options
 */
export interface PluginOptions extends AdapterBaseOptions {
    /**
     * Url prefix, e.g.: /api
     */
    prefix: string;

    /**
     * Callback for getting a PrismaClient for the given request
     */
    getPrisma: (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;
}

/**
 * Fastify plugin for handling CRUD requests.
 */
const pluginHandler: FastifyPluginCallback<PluginOptions> = (fastify, options, done) => {
    const prefix = options.prefix ?? '';
    logInfo(options.logger, `ZenStackPlugin installing routes at prefix: ${prefix}`);

    let schemas: ModelZodSchema | undefined;
    if (typeof options.zodSchemas === 'object') {
        schemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        schemas = getModelZodSchemas();
    }

    const requestHanler = options.handler ?? RPCApiHandler({ logger: options.logger, zodSchemas: schemas });
    const useSuperJson = options.useSuperJson === true;

    fastify.all(`${prefix}/*`, async (request, reply) => {
        const prisma = (await options.getPrisma(request, reply)) as DbClientContract;
        if (!prisma) {
            reply
                .status(500)
                .send(marshalToObject({ message: 'unable to get prisma from request context' }, useSuperJson));
            return;
        }

        let query: Record<string, string | string[]> = {};
        try {
            query = buildUrlQuery(request.query, useSuperJson);
        } catch {
            reply.status(400).send(marshalToObject({ message: 'invalid query parameters' }, useSuperJson));
            return;
        }

        const response = await requestHanler({
            method: request.method,
            path: (request.params as any)['*'],
            query,
            requestBody: unmarshalFromObject(request.body, useSuperJson),
            prisma,
        });

        reply.status(response.status).send(marshalToObject(response.body, useSuperJson));
    });

    done();
};

export default fp(pluginHandler);
