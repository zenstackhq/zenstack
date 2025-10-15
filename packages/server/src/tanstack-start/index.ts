import type { AdapterBaseOptions } from '../types';
import { default as Handler } from './handler';

/**
 * Options for initializing a TanStack Start server route handler.
 */
export interface TanStackStartOptions extends AdapterBaseOptions {
    /**
     * Callback method for getting a Prisma instance for the given request and params.
     */
    getPrisma: (request: Request, params: Record<string, string>) => Promise<unknown> | unknown;
}

/**
 * Creates a TanStack Start server route handler.
 * @see https://zenstack.dev/docs/reference/server-adapters/tanstack-start
 */
export function TanStackStartHandler(options: TanStackStartOptions): ReturnType<typeof Handler> {
    return Handler(options);
}

export default TanStackStartHandler;

