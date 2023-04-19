import {
    DbOperations,
    isPrismaClientKnownRequestError,
    isPrismaClientUnknownRequestError,
    isPrismaClientValidationError,
} from '@zenstackhq/runtime';
import { RequestContext, Response, logError, stripAuxFields, zodValidate } from '../utils';

/**
 * Handles HTTP requests with a Prisma format
 */
export default async function handleRequest({
    method,
    path,
    query,
    requestBody,
    prisma,
    logger,
    zodSchemas,
}: RequestContext): Promise<Response> {
    const parts = path.split('/').filter((p) => !!p);
    const op = parts.pop();
    const model = parts.pop();

    if (parts.length !== 0 || !op || !model) {
        return { status: 400, body: { message: 'invalid request path' } };
    }

    method = method.toUpperCase();
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
            if (!requestBody) {
                return { status: 400, body: { message: 'missing request body' } };
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
            try {
                args = query?.q ? unmarshal(query.q as string) : {};
            } catch {
                return { status: 400, body: { message: 'query param must contain valid JSON' } };
            }
            break;

        case 'update':
        case 'updateMany':
            if (method !== 'PUT' && method !== 'PATCH') {
                return { status: 400, body: { message: 'invalid request method, only PUT AND PATCH are supported' } };
            }
            if (!requestBody) {
                return { status: 400, body: { message: 'missing request body' } };
            }

            args = requestBody;
            break;

        case 'delete':
        case 'deleteMany':
            if (method !== 'DELETE') {
                return { status: 400, body: { message: 'invalid request method, only DELETE is supported' } };
            }
            try {
                args = query?.q ? unmarshal(query.q as string) : {};
            } catch {
                return { status: 400, body: { message: 'query param must contain valid JSON' } };
            }
            break;

        default:
            return { status: 400, body: { message: 'invalid operation: ' + op } };
    }

    if (zodSchemas) {
        const { data, error } = zodValidate(zodSchemas, model, dbOp, args);
        if (error) {
            return { status: 400, body: { message: error } };
        } else {
            args = data;
        }
    }

    try {
        if (!prisma[model]) {
            return { status: 400, body: { message: `unknown model name: ${model}` } };
        }
        const result = await prisma[model][dbOp](args);
        stripAuxFields(result);
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
