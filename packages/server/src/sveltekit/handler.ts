import type { Handle, RequestEvent } from '@sveltejs/kit';
import { DbClientContract } from '@zenstackhq/runtime';
import { ModelZodSchema, getModelZodSchemas } from '@zenstackhq/runtime/zod';
import RPCApiHandler from '../api/rpc';
import { AdapterBaseOptions } from '../types';
import { marshalToString, unmarshalFromString } from '../utils';

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
    if (options.logger?.info === undefined) {
        console.log(`ZenStackHandler installing routes at prefix: ${options.prefix}`);
    } else {
        options.logger?.info?.(`ZenStackHandler installing routes at prefix: ${options.prefix}`);
    }

    let schemas: ModelZodSchema | undefined;
    if (typeof options.zodSchemas === 'object') {
        schemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        schemas = getModelZodSchemas();
    }

    const requestHanler = options.handler ?? RPCApiHandler({ logger: options.logger, zodSchemas: schemas });

    return async ({ event, resolve }) => {
        if (event.url.pathname.startsWith(options.prefix)) {
            const prisma = (await options.getPrisma(event)) as DbClientContract;
            if (!prisma) {
                throw new Error('unable to get prisma from request context');
            }

            const query: Record<string, string | string[]> = {};
            for (const key of event.url.searchParams.keys()) {
                let values = event.url.searchParams.getAll(key);
                if (key === 'q') {
                    // unmarshal the `q` query param which contains SuperJSON-serialized query
                    values = values.map((v) =>
                        JSON.stringify(unmarshalFromString(decodeURIComponent(v), options.useSuperJson === true))
                    );
                }
                if (values.length === 1) {
                    query[key] = values[0];
                } else {
                    query[key] = values;
                }
            }

            let requestBody: unknown;
            if (event.request.body) {
                const text = await event.request.text();
                if (text) {
                    requestBody = unmarshalFromString(text, options.useSuperJson === true);
                }
            }

            const path = event.url.pathname.substring(options.prefix.length);

            const response = await requestHanler({
                method: event.request.method,
                path,
                query,
                requestBody,
                prisma,
            });

            return new Response(marshalToString(response.body, options.useSuperJson === true), {
                status: response.status,
                headers: {
                    'content-type': 'application/json',
                },
            });
        }

        return resolve(event);
    };
}
