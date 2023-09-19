/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { DbClientContract } from '@zenstackhq/runtime';
import { NextRequest, NextResponse } from 'next/server';
import { AppRouteRequestHandlerOptions } from '.';
import RPCAPIHandler from '../api/rpc';
import { loadAssets } from '../shared';

type Context = { params: { path: string[] } };

/**
 * Creates a Next.js 13 "app dir" API route request handler which encapsulates Prisma CRUD operations.
 *
 * @param options Options for initialization
 * @returns An API route request handler
 */
export default function factory(
    options: AppRouteRequestHandlerOptions
): (req: NextRequest, context: Context) => Promise<NextResponse> {
    const { modelMeta, zodSchemas } = loadAssets(options);

    const requestHandler = options.handler || RPCAPIHandler();
    if (options.useSuperJson !== undefined) {
        console.warn(
            'The option "useSuperJson" is deprecated. The server APIs automatically use superjson for serialization.'
        );
    }

    return async (req: NextRequest, context: Context) => {
        const prisma = (await options.getPrisma(req)) as DbClientContract;
        if (!prisma) {
            return NextResponse.json({ message: 'unable to get prisma from request context' }, { status: 500 });
        }

        const url = new URL(req.url);
        const query = Object.fromEntries(url.searchParams);

        if (!context.params.path) {
            return NextResponse.json(
                { message: 'missing path parameter' },
                {
                    status: 400,
                }
            );
        }
        const path = context.params.path.join('/');

        let requestBody: unknown;
        if (req.body) {
            try {
                requestBody = await req.json();
            } catch {
                // noop
            }
        }

        try {
            const r = await requestHandler({
                method: req.method!,
                path,
                query,
                requestBody,
                prisma,
                modelMeta,
                zodSchemas,
                logger: options.logger,
            });
            return NextResponse.json(r.body, { status: r.status });
        } catch (err) {
            return NextResponse.json({ message: `An unhandled error occurred: ${err}` }, { status: 500 });
        }
    };
}
