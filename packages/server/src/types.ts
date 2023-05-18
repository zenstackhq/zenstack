import { DbClientContract } from '@zenstackhq/runtime';
import { ModelZodSchema } from '@zenstackhq/runtime/zod';

type LoggerMethod = (message: string, code?: string) => void;

/**
 * Logger config.
 */
export type LoggerConfig = {
    debug?: LoggerMethod;
    info?: LoggerMethod;
    warn?: LoggerMethod;
    error?: LoggerMethod;
};

/**
 * API request context
 */
export type RequestContext = {
    prisma: DbClientContract;
    method: string;
    path: string;
    query?: Record<string, string | string[]>;
    requestBody?: unknown;
};

/**
 * API response
 */
export type Response = {
    status: number;
    body: unknown;
};

/**
 * API request handler function
 */
export type HandleRequestFn = (req: RequestContext) => Promise<Response>;

/**
 * Base type for options used to create a server adapter.
 */
export interface AdapterBaseOptions {
    /**
     * Logger settings
     */
    logger?: LoggerConfig;

    /**
     * Zod schemas for validating request input. Pass `true` to load from standard location
     * (need to enable `@core/zod` plugin in schema.zmodel) or omit to disable input validation.
     */
    zodSchemas?: ModelZodSchema | boolean;

    /**
     * Api request handler function. Can be created using `/api/rest` or `/api/rpc` factory functions.
     * Defaults to RCP-style API handler created with `/api/rpc`.
     */
    handler?: HandleRequestFn;

    /**
     * Whether to use superjson for serialization/deserialization. Defaults to `false`.
     */
    useSuperJson?: boolean;
}
