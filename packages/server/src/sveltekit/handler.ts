import type { Handle, RequestEvent } from '@sveltejs/kit';
import { DbClientContract } from '@zenstackhq/runtime';
import RPCApiHandler from '../api/rpc';
import { logInfo } from '../api/utils';
import { AdapterBaseOptions } from '../types';
import { buildUrlQuery, marshalToString, unmarshalFromString } from '../utils';
import type { ZodSchemas } from '@zenstackhq/runtime/enhancements/types';
import * as defaultZodSchemas from '@zenstackhq/runtime/zod';

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

    return async ({ event, resolve }) => {
        if (event.url.pathname.startsWith(options.prefix)) {
            const prisma = (await options.getPrisma(event)) as DbClientContract;
            if (!prisma) {
                return new Response(
                    marshalToString({ message: 'unable to get prisma from request context' }, useSuperJson),
                    {
                        status: 400,
                        headers: {
                            'content-type': 'application/json',
                        },
                    }
                );
            }

            const queryObj: Record<string, string[]> = {};
            for (const key of event.url.searchParams.keys()) {
                const values = event.url.searchParams.getAll(key);
                queryObj[key] = values;
            }

            let query: Record<string, string | string[]> = {};
            try {
                query = buildUrlQuery(queryObj, useSuperJson);
            } catch {
                return new Response(marshalToString({ message: 'invalid query parameters' }, useSuperJson), {
                    status: 400,
                    headers: {
                        'content-type': 'application/json',
                    },
                });
            }

            let requestBody: unknown;
            if (event.request.body) {
                const text = await event.request.text();
                if (text) {
                    requestBody = unmarshalFromString(text, useSuperJson);
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
                    zodSchemas: schemas,
                    modelMeta: options.modelMeta,
                });

                return new Response(marshalToString(r.body, useSuperJson), {
                    status: r.status,
                    headers: {
                        'content-type': 'application/json',
                    },
                });
            } catch (err) {
                return new Response(marshalToString({ message: `An unhandled error occurred: ${err}` }, useSuperJson), {
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
