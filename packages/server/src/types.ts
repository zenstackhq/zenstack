import type { ModelMeta, ZodSchemas } from '@zenstackhq/runtime';
import { RequestContext } from './api/base';

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
     * Model metadata. By default loaded from the `node_module/.zenstack/model-meta`
     * module. You can pass it in explicitly if you configured ZenStack to output to
     * a different location.
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
}
