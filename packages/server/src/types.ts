import type { ModelMeta, ZodSchemas } from '@zenstackhq/runtime';
import { DbClientContract } from '@zenstackhq/runtime';

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
    /**
     * The PrismaClient instance
     */
    prisma: DbClientContract;

    /**
     * The HTTP method
     */
    method: string;

    /**
     * The request endpoint path (excluding any prefix)
     */
    path: string;

    /**
     * The query parameters
     */
    query?: Record<string, string | string[]>;

    /**
     * The request body object
     */
    requestBody?: unknown;

    /**
     * Model metadata. By default loaded from the standard output location
     * of the `@zenstackhq/model-meta` plugin. You can pass it in explicitly
     * if you configured the plugin to output to a different location.
     */
    modelMeta?: ModelMeta;

    /**
     * Zod schemas for validating create and update payloads. By default
     * loaded from the standard output location of the `@zenstackhq/zod`
     * plugin. You can pass it in explicitly if you configured the plugin
     * to output to a different location.
     */
    zodSchemas?: ZodSchemas;

    /**
     * Logging configuration. Set to `null` to disable logging.
     * If unset or set to `undefined`, log will be output to console.
     */
    logger?: LoggerConfig;
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
     * Model metadata. By default loaded from the standard output location
     * of the `@zenstackhq/model-meta` plugin. You can pass it in explicitly
     * if you configured the plugin to output to a different location.
     */
    modelMeta?: ModelMeta;

    /**
     * Zod schemas for validating request input. Pass `true` to load from standard location
     * (need to enable `@core/zod` plugin in schema.zmodel) or omit to disable input validation.
     */
    zodSchemas?: ZodSchemas | boolean;

    /**
     * Api request handler function. Can be created using `@zenstackhq/server/api/rest` or `@zenstackhq/server/api/rpc` factory functions.
     * Defaults to RPC-style API handler created with `/api/rpc`.
     */
    handler?: HandleRequestFn;

    /**
     * Whether to use superjson for serialization/deserialization. Defaults to `false`.
     */
    useSuperJson?: boolean;
}
