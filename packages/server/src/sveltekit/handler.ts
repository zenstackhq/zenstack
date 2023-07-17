import type { Handle, RequestEvent } from '@sveltejs/kit';
import type { ZodSchemas } from '@zenstackhq/runtime';
import { DbClientContract } from '@zenstackhq/runtime';
import RPCApiHandler from '../api/rpc';
import { logInfo } from '../api/utils';
import { AdapterBaseOptions } from '../types';

/**
 * SvelteKit request handler options
 */
export interface HandlerOptions extends AdapterBaseOptions {
    /**
     * Url prefix, e.g.: /api
     */
    prefix: string;

    /**
     * Callback for getting a PrismaClient for the given request
     */
    getPrisma: (event: RequestEvent) => unknown | Promise<unknown>;
}

/**
 * SvelteKit server hooks handler for handling CRUD requests.
 */
export default function createHandler(options: HandlerOptions): Handle {
    logInfo(options.logger, `ZenStackHandler installing routes at prefix: ${options.prefix}`);

    let zodSchemas: ZodSchemas | undefined;
    if (typeof options.zodSchemas === 'object') {
        zodSchemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        zodSchemas = require('@zenstackhq/runtime/zod');
        if (!zodSchemas) {
            throw new Error('Unable to load zod schemas from default location');
        }
    }

    const requestHanler = options.handler ?? RPCApiHandler();
    if (options.useSuperJson !== undefined) {
        console.warn(
            'The option "useSuperJson" is deprecated. The server APIs automatically use superjson for serialization.'
        );
    }

    return async ({ event, resolve }) => {
        if (event.url.pathname.startsWith(options.prefix)) {
            const prisma = (await options.getPrisma(event)) as DbClientContract;
            if (!prisma) {
                return new Response(JSON.stringify({ message: 'unable to get prisma from request context' }), {
                    status: 400,
                    headers: {
                        'content-type': 'application/json',
                    },
                });
            }

            const query = Object.fromEntries(event.url.searchParams);
            let requestBody: unknown;
            if (event.request.body) {
                const text = await event.request.text();
                if (text) {
                    requestBody = JSON.parse(text);
                }
            }

            const path = event.url.pathname.substring(options.prefix.length);

            try {
                const r = await requestHanler({
                    method: event.request.method,
                    path,
                    query,
                    requestBody,
                    prisma,
                    zodSchemas,
                    modelMeta: options.modelMeta,
                });

                return new Response(JSON.stringify(r.body), {
                    status: r.status,
                    headers: {
                        'content-type': 'application/json',
                    },
                });
            } catch (err) {
                return new Response(JSON.stringify({ message: `An unhandled error occurred: ${err}` }), {
                    status: 500,
                    headers: {
                        'content-type': 'application/json',
                    },
                });
            }
        }

        return resolve(event);
    };
}
