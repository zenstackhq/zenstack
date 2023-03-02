import {
    DbClientContract,
    DbOperations,
    isPrismaClientKnownRequestError,
    isPrismaClientUnknownRequestError,
    isPrismaClientValidationError,
} from '@zenstackhq/runtime';
import { NextApiRequest, NextApiResponse } from 'next';
import superjson from 'superjson';

type LoggerMethod = (code: string | undefined, message: string) => void;

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
     * Callback method for getting a Prisma instance for the given request/response pair.
     */
    getPrisma: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown> | unknown;

    /**
     * Logger configuration. By default log to console. Set to null to turn off logging.
     */
    logger?: LoggerConfig | null;

    /**
     * Whether to use superjson for serialization/deserialization. Defaults to true.
     */
    useSuperJson?: boolean;
};

/**
 * Creates a Next.js API endpoint request handler which encapsulates Prisma CRUD operations.
 *
 * @param options Options for initialization
 * @returns An API endpoint request handler
 */
export function requestHandler(
    options: RequestHandlerOptions
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        let prisma = options.getPrisma(req, res);
        if (prisma instanceof Promise) {
            prisma = await prisma;
        }
        if (!prisma) {
            res.status(500).send({
                error: 'unable to get prisma from request context',
            });
            return;
        }
        return handleRequest(req, res, prisma as DbClientContract, options);
    };
}

function logError(options: RequestHandlerOptions, code: string | undefined, message: string) {
    if (options.logger === undefined) {
        console.error(`zenstack-next error: ${code ? '[' + code + ']' : ''} ${message}`);
    } else if (options.logger?.error) {
        options.logger.error(code, message);
    }
}

async function handleRequest(
    req: NextApiRequest,
    res: NextApiResponse,
    prisma: DbClientContract,
    options: RequestHandlerOptions
): Promise<void> {
    const [model, op] = req.query.path as string[];

    const dbOp = op as keyof DbOperations;
    let args: unknown;
    let resCode = 200;

    switch (dbOp) {
        case 'create':
        case 'createMany':
        case 'upsert':
            if (req.method !== 'POST') {
                res.status(400).send({ error: 'invalid http method' });
                return;
            }
            args = unmarshal(req.body, options.useSuperJson);
            // TODO: upsert's status code should be conditional
            resCode = 201;
            break;

        case 'findFirst':
        case 'findUnique':
        case 'findMany':
        case 'aggregate':
        case 'groupBy':
        case 'count':
            if (req.method !== 'GET') {
                res.status(400).send({ error: 'invalid http method' });
                return;
            }
            args = req.query.q ? unmarshal(req.query.q as string, options.useSuperJson) : {};
            break;

        case 'update':
        case 'updateMany':
            if (req.method !== 'PUT' && req.method !== 'PATCH') {
                res.status(400).send({ error: 'invalid http method' });
                return;
            }
            args = unmarshal(req.body, options.useSuperJson);
            break;

        case 'delete':
        case 'deleteMany':
            if (req.method !== 'DELETE') {
                res.status(400).send({ error: 'invalid http method' });
                return;
            }
            args = req.query.q ? unmarshal(req.query.q as string, options.useSuperJson) : {};
            break;

        default:
            res.status(400).send({ error: `unknown method name: ${op}` });
            return;
    }

    try {
        if (!prisma[model]) {
            res.status(400).send({ error: `unknown model name: ${model}` });
            return;
        }
        const result = await prisma[model][dbOp](args);
        res.status(resCode).send(marshal(result, options.useSuperJson));
    } catch (err) {
        if (isPrismaClientKnownRequestError(err)) {
            logError(options, err.code, err.message);
            if (err.code === 'P2004') {
                // rejected by policy
                res.status(403).send({
                    prisma: true,
                    rejectedByPolicy: true,
                    code: err.code,
                    message: err.message,
                    reason: err.meta?.reason,
                });
            } else {
                res.status(400).send({
                    prisma: true,
                    code: err.code,
                    message: err.message,
                    reason: err.meta?.reason,
                });
            }
        } else if (isPrismaClientUnknownRequestError(err) || isPrismaClientValidationError(err)) {
            logError(options, undefined, err.message);
            res.status(400).send({
                prisma: true,
                message: err.message,
            });
        } else {
            logError(options, undefined, (err as Error).message);
            res.status(500).send({
                message: (err as Error).message,
            });
        }
    }
}

function marshal(value: unknown, useSuperJson = true) {
    return useSuperJson ? JSON.parse(superjson.stringify(value)) : value;
}

function unmarshal(value: unknown, useSuperJson = true) {
    if (!value) {
        return value;
    }

    if (useSuperJson) {
        if (typeof value === 'string') {
            return superjson.parse(value);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const json = (value as any).json;
            if (json && typeof json === 'object') {
                return superjson.parse(JSON.stringify(value));
            } else {
                return value;
            }
        }
    } else {
        return value;
    }
}
