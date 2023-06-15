/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { DbClientContract } from '@zenstackhq/runtime';
import { ModelZodSchema, getModelZodSchemas } from '@zenstackhq/runtime/zod';
import { NextRequest, NextResponse } from 'next/server';
import { AppRouteRequestHandlerOptions } from '.';
import RPCAPIHandler from '../api/rpc';
import { buildUrlQuery, marshalToObject, unmarshalFromObject } from '../utils';

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
    let zodSchemas: ModelZodSchema | undefined;
    if (typeof options.zodSchemas === 'object') {
        zodSchemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        zodSchemas = getModelZodSchemas();
    }

    const requestHandler = options.handler || RPCAPIHandler();
    const useSuperJson = options.useSuperJson === true;

    return async (req: NextRequest, context: Context) => {
        const prisma = (await options.getPrisma(req)) as DbClientContract;
        if (!prisma) {
            return NextResponse.json(
                marshalToObject({ message: 'unable to get prisma from request context' }, useSuperJson),
                { status: 500 }
            );
        }

        const url = new URL(req.url);
        let query: Record<string, string | string[]> = Object.fromEntries(url.searchParams);
        try {
            query = buildUrlQuery(query, useSuperJson);
        } catch {
            return NextResponse.json(marshalToObject({ message: 'invalid query parameters' }, useSuperJson), {
                status: 400,
            });
        }

        if (!context.params.path) {
            return NextResponse.json(marshalToObject({ message: 'missing path parameter' }, useSuperJson), {
                status: 400,
            });
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
                requestBody: unmarshalFromObject(requestBody, useSuperJson),
                prisma,
                modelMeta: options.modelMeta,
                zodSchemas,
                logger: options.logger,
            });
            return NextResponse.json(marshalToObject(r.body, useSuperJson), { status: r.status });
        } catch (err) {
            return NextResponse.json(
                marshalToObject({ message: `An unhandled error occurred: ${err}` }, useSuperJson),
                { status: 500 }
            );
        }
    };
}
