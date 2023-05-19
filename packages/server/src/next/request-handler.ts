import {
    DbClientContract,
    DbOperations,
    isPrismaClientKnownRequestError,
    isPrismaClientUnknownRequestError,
    isPrismaClientValidationError,
} from '@zenstackhq/runtime';
import { NextApiRequest, NextApiResponse } from 'next';
import { logError } from '../api/utils';
import { AdapterBaseOptions } from '../types';
import { marshalToObject, unmarshalFromObject, unmarshalFromString } from '../utils';

/**
 * Options for initializing a Next.js API endpoint request handler.
 * @see requestHandler
 */
export interface RequestHandlerOptions extends AdapterBaseOptions {
    /**
     * Callback method for getting a Prisma instance for the given request/response pair.
     */
    getPrisma: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown> | unknown;
}

/**
 * Creates a Next.js API endpoint request handler which encapsulates Prisma CRUD operations.
 *
 * @param options Options for initialization
 * @returns An API endpoint request handler
 */
export default function requestHandler(
    options: RequestHandlerOptions
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        const prisma = await options.getPrisma(req, res);
        if (!prisma) {
            sendResponse(
                res,
                500,
                {
                    error: 'unable to get prisma from request context',
                },
                options.useSuperJson === true
            );
            return;
        }
        return handleRequest(req, res, prisma as DbClientContract, options);
    };
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
    const useSuperJson = options.useSuperJson === true;

    switch (dbOp) {
        case 'create':
        case 'createMany':
        case 'upsert':
            if (req.method !== 'POST') {
                sendResponse(res, 400, { error: 'invalid http method' }, useSuperJson);
                return;
            }
            args = unmarshalFromObject(req.body, options.useSuperJson);
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
                sendResponse(res, 400, { error: 'invalid http method' }, useSuperJson);
                return;
            }
            args = req.query.q ? unmarshalFromString(req.query.q as string, options.useSuperJson) : {};
            break;

        case 'update':
        case 'updateMany':
            if (req.method !== 'PUT' && req.method !== 'PATCH') {
                sendResponse(res, 400, { error: 'invalid http method' }, useSuperJson);
                return;
            }
            args = unmarshalFromObject(req.body, options.useSuperJson);
            break;

        case 'delete':
        case 'deleteMany':
            if (req.method !== 'DELETE') {
                sendResponse(res, 400, { error: 'invalid http method' }, useSuperJson);
                return;
            }
            args = req.query.q ? unmarshalFromString(req.query.q as string, options.useSuperJson) : {};
            break;

        default:
            sendResponse(res, 400, { error: `unknown method name: ${op}` }, useSuperJson);
            return;
    }

    try {
        if (!prisma[model]) {
            sendResponse(res, 400, { error: `unknown model name: ${model}` }, useSuperJson);
            return;
        }
        const result = await prisma[model][dbOp](args);
        sendResponse(res, resCode, result, useSuperJson);
    } catch (err) {
        if (isPrismaClientKnownRequestError(err)) {
            logError(options.logger, err.message, err.code);
            if (err.code === 'P2004') {
                // rejected by policy
                sendResponse(
                    res,
                    403,
                    {
                        prisma: true,
                        rejectedByPolicy: true,
                        code: err.code,
                        message: err.message,
                        reason: err.meta?.reason,
                    },
                    useSuperJson
                );
            } else {
                sendResponse(
                    res,
                    400,
                    {
                        prisma: true,
                        code: err.code,
                        message: err.message,
                        reason: err.meta?.reason,
                    },
                    useSuperJson
                );
            }
        } else if (isPrismaClientUnknownRequestError(err) || isPrismaClientValidationError(err)) {
            logError(options.logger, err.message);
            sendResponse(
                res,
                400,
                {
                    prisma: true,
                    message: err.message,
                },
                useSuperJson
            );
        } else {
            const _err = err as Error;
            logError(options.logger, _err.message + (_err.stack ? '\n' + _err.stack : ''));
            sendResponse(
                res,
                500,
                {
                    message: (err as Error).message,
                },
                useSuperJson
            );
        }
    }
}

function sendResponse(res: NextApiResponse, status: number, data: unknown, useSuperJson: boolean): void {
    res.status(status).send(marshalToObject(data, useSuperJson));
}
