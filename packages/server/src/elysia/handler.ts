import { DbClientContract } from '@zenstackhq/runtime';
import { Elysia, Context as ElysiaContext } from 'elysia';
import { RPCApiHandler } from '../api';
import { loadAssets } from '../shared';
import { AdapterBaseOptions } from '../types';

/**
 * Options for initializing an Elysia middleware.
 */
export interface ElysiaOptions extends AdapterBaseOptions {
    /**
     * Callback method for getting a Prisma instance for the given request context.
     */
    getPrisma: (context: ElysiaContext) => Promise<unknown> | unknown;
}

/**
 * Creates an Elysia middleware handler for ZenStack.
 * This handler provides RPC API functionality through Elysia's routing system.
 */
export function createElysiaHandler(options: ElysiaOptions) {
    const { modelMeta, zodSchemas } = loadAssets(options);
    const requestHandler = options.handler ?? RPCApiHandler();

    return async (app: Elysia) => {
        app.all('/*', async ({ request, body, set }: ElysiaContext) => {
            const prisma = (await options.getPrisma({ request, body, set } as ElysiaContext)) as DbClientContract;
            if (!prisma) {
                set.status = 500;
                return {
                    message: 'unable to get prisma from request context'
                };
            }

            const url = new URL(request.url);
            const query = Object.fromEntries(url.searchParams);
            const path = url.pathname;

            if (!path) {
                set.status = 400;
                return {
                    message: 'missing path parameter'
                };
            }

            try {
                const r = await requestHandler({
                    method: request.method,
                    path,
                    query,
                    requestBody: body,
                    prisma,
                    modelMeta,
                    zodSchemas,
                    logger: options.logger,
                });

                set.status = r.status;
                return r.body;
            } catch (err) {
                set.status = 500;
                return {
                    message: `An unhandled error occurred: ${err}`
                };
            }
        });

        return app;
    };
} 