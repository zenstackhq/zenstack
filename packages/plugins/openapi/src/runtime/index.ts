import {
    DbClientContract,
    DbOperations,
    isPrismaClientKnownRequestError,
    isPrismaClientUnknownRequestError,
    isPrismaClientValidationError,
} from '@zenstackhq/runtime';
import invariant from 'tiny-invariant';

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
 * Options for initializing a Next.js API endpoint request handler.
 * @see requestHandler
 */
export type RequestHandlerOptions = {
    /**
     * Logger configuration. By default log to console. Set to null to turn off logging.
     */
    logger?: LoggerConfig | null;
};

function logError(logger: LoggerConfig | undefined | null, message: string, code?: string) {
    if (logger === undefined) {
        console.error(`@zenstackhq/openapi: error ${code ? '[' + code + ']' : ''}, ${message}`);
    } else if (logger?.error) {
        logger.error(message, code);
    }
}

export type RequestContext = {
    method: string;
    path: string;
    query: Record<string, string | string[]>;
    requestBody: unknown;
    prisma: DbClientContract;
    logger?: LoggerConfig;
};

export type Response = {
    status: number;
    body: unknown;
};

export async function handleRequest({
    method,
    path,
    query,
    requestBody,
    prisma,
    logger,
}: RequestContext): Promise<Response> {
    const parts = path.split('/');
    if (parts.length < 2) {
        return { status: 400, body: { error: 'invalid request path' } };
    }

    const op = parts.pop();
    const model = parts.pop();

    invariant(op);
    invariant(model);

    const dbOp = op as keyof DbOperations;
    let args: unknown;
    let resCode = 200;

    switch (dbOp) {
        case 'create':
        case 'createMany':
        case 'upsert':
            if (method !== 'POST') {
                return { status: 400, body: { message: 'invalid request method, only POST is supported' } };
            }
            args = requestBody;
            // TODO: upsert's status code should be conditional
            resCode = 201;
            break;

        case 'findFirst':
        case 'findUnique':
        case 'findMany':
        case 'aggregate':
        case 'groupBy':
        case 'count':
            if (method !== 'GET') {
                return { status: 400, body: { message: 'invalid request method, only GET is supported' } };
            }
            args = query.q ? unmarshal(query.q as string) : {};
            break;

        case 'update':
        case 'updateMany':
            if (method !== 'PUT' && method !== 'PATCH') {
                return { status: 400, body: { message: 'invalid request method, only PUT AND PATCH are supported' } };
            }
            args = requestBody;
            break;

        case 'delete':
        case 'deleteMany':
            if (method !== 'DELETE') {
                return { status: 400, body: { message: 'invalid request method, only DELETE is supported' } };
            }
            args = query.q ? unmarshal(query.q as string) : {};
            break;

        default:
            return { status: 400, body: { message: 'invalid operation: ' + op } };
    }

    try {
        if (!prisma[model]) {
            return { status: 400, body: { message: `unknown model name: ${model}` } };
        }
        const result = await prisma[model][dbOp](args);
        return { status: resCode, body: result };
    } catch (err) {
        if (isPrismaClientKnownRequestError(err)) {
            logError(logger, err.code, err.message);
            if (err.code === 'P2004') {
                // rejected by policy
                return {
                    status: 403,
                    body: {
                        prisma: true,
                        rejectedByPolicy: true,
                        code: err.code,
                        message: err.message,
                        reason: err.meta?.reason,
                    },
                };
            } else {
                return {
                    status: 400,
                    body: {
                        prisma: true,
                        code: err.code,
                        message: err.message,
                        reason: err.meta?.reason,
                    },
                };
            }
        } else if (isPrismaClientUnknownRequestError(err) || isPrismaClientValidationError(err)) {
            logError(logger, err.message);
            return {
                status: 400,
                body: {
                    prisma: true,
                    message: err.message,
                },
            };
        } else {
            logError(logger, (err as Error).message);
            return {
                status: 400,
                body: {
                    message: (err as Error).message,
                },
            };
        }
    }
}

function unmarshal(value: string) {
    return JSON.parse(value);
}
