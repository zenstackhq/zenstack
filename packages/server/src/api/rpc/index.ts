import {
    DbOperations,
    isPrismaClientKnownRequestError,
    isPrismaClientUnknownRequestError,
    isPrismaClientValidationError,
} from '@zenstackhq/runtime';
import { ModelZodSchema } from '@zenstackhq/runtime/zod';
import { LoggerConfig, RequestContext, Response } from '../types';
import { logError, stripAuxFields, zodValidate } from '../utils';

export type Options = {
    logger?: LoggerConfig | null;
    zodSchemas?: ModelZodSchema;
};

/**
 * Prisma RPC style API request handler that mirrors the Prisma Client API
 */
class RequestHandler {
    constructor(private readonly options: Options = {}) {}

    async handleRequest({ prisma, method, path, query, requestBody }: RequestContext): Promise<Response> {
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
                    args = query?.q ? this.unmarshal(query.q as string) : {};
                } catch {
                    return { status: 400, body: { message: 'query param must contain valid JSON' } };
                }
                break;

            case 'update':
            case 'updateMany':
                if (method !== 'PUT' && method !== 'PATCH') {
                    return {
                        status: 400,
                        body: { message: 'invalid request method, only PUT AND PATCH are supported' },
                    };
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
                    args = query?.q ? this.unmarshal(query.q as string) : {};
                } catch {
                    return { status: 400, body: { message: 'query param must contain valid JSON' } };
                }
                break;

            default:
                return { status: 400, body: { message: 'invalid operation: ' + op } };
        }

        if (this.options.zodSchemas) {
            const { data, error } = zodValidate(this.options.zodSchemas, model, dbOp, args);
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
                logError(this.options.logger, err.code, err.message);
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
                logError(this.options.logger, err.message);
                return {
                    status: 400,
                    body: {
                        prisma: true,
                        message: err.message,
                    },
                };
            } else {
                const _err = err as Error;
                logError(this.options.logger, _err.message + (_err.stack ? '\n' + _err.stack : ''));
                return {
                    status: 400,
                    body: {
                        message: (err as Error).message,
                    },
                };
            }
        }
    }

    private unmarshal(value: string) {
        return JSON.parse(value);
    }
}

export default function makeHandler(options?: Options) {
    const handler = new RequestHandler(options);
    return handler.handleRequest.bind(handler);
}
