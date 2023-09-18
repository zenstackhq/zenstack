import { DbClientContract, ModelMeta, ZodSchemas, getDefaultModelMeta } from '@zenstackhq/runtime';
import { LoggerConfig } from '../types';

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
     * Model metadata. By default loaded from the @see loadPath path. You can pass
     * it in explicitly to override.
     */
    modelMeta?: ModelMeta;

    /**
     * Zod schemas for validating create and update payloads. By default loaded from
     * the @see loadPath path. You can pass it in explicitly to override.
     */
    zodSchemas?: ZodSchemas;

    /**
     * Logging configuration. Set to `null` to disable logging.
     * If unset or set to `undefined`, log will be output to console.
     */
    logger?: LoggerConfig;
};

/**
 * Base class for API handlers
 */
export abstract class APIHandlerBase {
    // model meta loaded from default location
    protected readonly defaultModelMeta: ModelMeta | undefined;

    constructor() {
        try {
            this.defaultModelMeta = getDefaultModelMeta(undefined);
        } catch {
            // noop
        }
    }
}
