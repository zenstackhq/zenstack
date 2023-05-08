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
 * Options for initializing an API endpoint request handler.
 * @see requestHandler
 */
export type RequestHandlerOptions = {
    /**
     * Logger configuration. By default log to console. Set to null to turn off logging.
     */
    logger?: LoggerConfig | null;
};

/**
 * API request context
 */
export type RequestContext = {
    prisma: DbClientContract;
    method: string;
    path: string;
    query?: Record<string, string>;
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
