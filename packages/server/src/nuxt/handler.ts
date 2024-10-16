import type { DbClientContract } from '@zenstackhq/runtime';
import {
    EventHandlerRequest,
    H3Event,
    defineEventHandler,
    getQuery,
    getRouterParams,
    readBody,
    setResponseStatus,
} from 'h3';
import RPCApiHandler from '../api/rpc';
import { loadAssets } from '../shared';
import { AdapterBaseOptions } from '../types';

/**
 * Nuxt request handler options
 */
export interface HandlerOptions extends AdapterBaseOptions {
    /**
     * Callback for getting a PrismaClient for the given request
     */
    getPrisma: (event: H3Event<EventHandlerRequest>) => unknown | Promise<unknown>;
}

export function createEventHandler(options: HandlerOptions) {
    return defineEventHandler(async (event) => {
        const { modelMeta, zodSchemas } = loadAssets(options);
        const requestHandler = options.handler ?? RPCApiHandler();

        const prisma = (await options.getPrisma(event)) as DbClientContract;
        if (!prisma) {
            setResponseStatus(event, 500);
            return { message: 'unable to get prisma from request context' };
        }

        const routerParam = getRouterParams(event);
        const query = await getQuery(event);

        let reqBody: unknown;
        if (event.method === 'POST' || event.method === 'PUT' || event.method === 'PATCH') {
            reqBody = await readBody(event);
        }

        try {
            const { status, body } = await requestHandler({
                method: event.method,
                path: routerParam._,
                query: query as Record<string, string | string[]>,
                requestBody: reqBody,
                prisma,
                modelMeta,
                zodSchemas,
                logger: options.logger,
            });

            setResponseStatus(event, status);
            return body;
        } catch (err) {
            setResponseStatus(event, 500);
            return { message: `An unhandled error occurred: ${err}` };
        }
    });
}
