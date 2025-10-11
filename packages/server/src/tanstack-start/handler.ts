/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { DbClientContract } from '@zenstackhq/runtime';
import { TanStackStartOptions } from '.';
import { RPCApiHandler } from '../api';
import { loadAssets } from '../shared';

/**
 * Creates a TanStack Start server route handler which encapsulates Prisma CRUD operations.
 *
 * @param options Options for initialization
 * @returns A TanStack Start server route handler
 */
export default function factory(
    options: TanStackStartOptions
): ({ request, params }: { request: Request; params: Record<string, string> }) => Promise<Response> {
    const { modelMeta, zodSchemas } = loadAssets(options);

    const requestHandler = options.handler || RPCApiHandler();

    return async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const prisma = (await options.getPrisma(request, params)) as DbClientContract;
        if (!prisma) {
            return new Response(JSON.stringify({ message: 'unable to get prisma from request context' }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }

        const url = new URL(request.url);
        const query = Object.fromEntries(url.searchParams);

        // Extract path from params._splat for catch-all routes
        const path = params._splat;

        if (!path) {
            return new Response(JSON.stringify({ message: 'missing path parameter' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }

        let requestBody: unknown;
        if (request.body) {
            try {
                requestBody = await request.json();
            } catch {
                // noop
            }
        }

        try {
            const r = await requestHandler({
                method: request.method!,
                path,
                query,
                requestBody,
                prisma,
                modelMeta,
                zodSchemas,
                logger: options.logger,
            });
            return new Response(JSON.stringify(r.body), {
                status: r.status,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        } catch (err) {
            return new Response(JSON.stringify({ message: `An unhandled error occurred: ${err}` }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }
    };
}

