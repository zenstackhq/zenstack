import { DbClientContract } from '@zenstackhq/runtime';
import { Context, MiddlewareHandler } from 'hono';
import { StatusCode } from 'hono/utils/http-status';
import { RPCApiHandler } from '../api';
import { loadAssets } from '../shared';
import { AdapterBaseOptions } from '../types';

/**
 * Options for initializing a Hono middleware.
 */
export interface HonoOptions extends AdapterBaseOptions {
    /**
     * Callback method for getting a Prisma instance for the given request.
     */
    getPrisma: (ctx: Context) => Promise<unknown> | unknown;
}

export function createHonoHandler(options: HonoOptions): MiddlewareHandler {
    const { modelMeta, zodSchemas } = loadAssets(options);
    const requestHandler = options.handler ?? RPCApiHandler();

    return async (ctx) => {
        const prisma = (await options.getPrisma(ctx)) as DbClientContract;
        if (!prisma) {
            return ctx.json({ message: 'unable to get prisma from request context' }, 500);
        }

        const url = new URL(ctx.req.url);
        const query = Object.fromEntries(url.searchParams);

        const path = ctx.req.path.substring(ctx.req.routePath.length - 1);

        if (!path) {
            return ctx.json({ message: 'missing path parameter' }, 400);
        }

        let requestBody: unknown;
        if (ctx.req.raw.body) {
            try {
                requestBody = await ctx.req.json();
            } catch {
                // noop
            }
        }

        try {
            const r = await requestHandler({
                method: ctx.req.method,
                path,
                query,
                requestBody,
                prisma,
                modelMeta,
                zodSchemas,
                logger: options.logger,
            });
            return ctx.json(r.body as object, r.status as StatusCode);
        } catch (err) {
            return ctx.json({ message: `An unhandled error occurred: ${err}` }, 500);
        }
    };
}
