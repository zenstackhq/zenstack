/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbClientContract } from '@zenstackhq/runtime';
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import RPCApiHandler from '../api/rpc';
import { logInfo } from '../api/utils';
import { AdapterBaseOptions } from '../types';
import { buildUrlQuery, marshalToObject, unmarshalFromObject } from '../utils';
import type { ZodSchemas } from '@zenstackhq/runtime/enhancements/types';
import * as defaultZodSchemas from '@zenstackhq/runtime/zod';

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

    let schemas: ZodSchemas | undefined;
    if (typeof options.zodSchemas === 'object') {
        schemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        if (!defaultZodSchemas) {
            throw new Error('Unable to load zod schemas from default location');
        }
        schemas = defaultZodSchemas;
    }

    const requestHanler = options.handler ?? RPCApiHandler();
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

        try {
            const response = await requestHanler({
                method: request.method,
                path: (request.params as any)['*'],
                query,
                requestBody: unmarshalFromObject(request.body, useSuperJson),
                prisma,
                modelMeta: options.modelMeta,
                zodSchemas: schemas,
                logger: options.logger,
            });
            reply.status(response.status).send(marshalToObject(response.body, useSuperJson));
        } catch (err) {
            reply.status(500).send(marshalToObject({ message: `An unhandled error occurred: ${err}` }, useSuperJson));
        }
    });

    done();
};

export default fp(pluginHandler);
