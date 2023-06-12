import { NextApiRequest, NextApiResponse } from 'next';
import type { NextRequest } from 'next/server';
import type { AdapterBaseOptions } from '../types';
import { default as AppRouteHandler } from './app-route-handler';
import { default as PagesRouteHandler } from './pages-route-handler';

/**
 * Options for initializing a Next.js API endpoint request handler.
 */
export interface PagesRouteRequestHandlerOptions extends AdapterBaseOptions {
    /**
     * Callback method for getting a Prisma instance for the given request/response pair.
     */
    getPrisma: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown> | unknown;

    /**
     * Use Next.js 13 app dir or not
     */
    useAppDir?: false | undefined;
}

/**
 * Options for initializing a Next.js 13 app dir API route handler.
 */
export interface AppRouteRequestHandlerOptions extends AdapterBaseOptions {
    /**
     * Callback method for getting a Prisma instance for the given request.
     */
    getPrisma: (req: NextRequest) => Promise<unknown> | unknown;

    /**
     * Use Next.js 13 app dir or not
     */
    useAppDir: true;
}

/**
 * Creates a Next.js API route handler.
 * @see https://zenstack.dev/docs/reference/server-adapters/next
 */
export function NextRequestHandler(options: PagesRouteRequestHandlerOptions): ReturnType<typeof PagesRouteHandler>;
export function NextRequestHandler(options: AppRouteRequestHandlerOptions): ReturnType<typeof AppRouteHandler>;
export function NextRequestHandler(options: PagesRouteRequestHandlerOptions | AppRouteRequestHandlerOptions) {
    if (options.useAppDir === true) {
        return AppRouteHandler(options);
    } else {
        return PagesRouteHandler(options);
    }
}

// for backward compatibility
export { PagesRouteRequestHandlerOptions as RequestHandlerOptions };
