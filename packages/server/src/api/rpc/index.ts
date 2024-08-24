import {
    CrudFailureReason,
    DbOperations,
    PrismaErrorCode,
    ZodSchemas,
    isPrismaClientKnownRequestError,
    isPrismaClientUnknownRequestError,
    isPrismaClientValidationError,
} from '@zenstackhq/runtime';
import SuperJSON from 'superjson';
import { upperCaseFirst } from 'upper-case-first';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { Response } from '../../types';
import { APIHandlerBase, RequestContext } from '../base';
import { logError, registerCustomSerializers } from '../utils';

registerCustomSerializers();

const ERROR_STATUS_MAPPING: Record<string, number> = {
    [PrismaErrorCode.CONSTRAINT_FAILED]: 403,
    [PrismaErrorCode.REQUIRED_CONNECTED_RECORD_NOT_FOUND]: 404,
    [PrismaErrorCode.DEPEND_ON_RECORD_NOT_FOUND]: 404,
};

/**
 * Prisma RPC style API request handler that mirrors the Prisma Client API
 */
class RequestHandler extends APIHandlerBase {
    async handleRequest({
        prisma,
        method,
        path,
        query,
        requestBody,
        modelMeta,
        zodSchemas,
        logger,
    }: RequestContext): Promise<Response> {
        modelMeta = modelMeta ?? this.defaultModelMeta;
        if (!modelMeta) {
            throw new Error('Model metadata is not provided or loaded from default location');
        }

        const parts = path.split('/').filter((p) => !!p);
        const op = parts.pop();
        const model = parts.pop();

        if (parts.length !== 0 || !op || !model) {
            return { status: 400, body: this.makeError('invalid request path') };
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
                    return {
                        status: 400,
                        body: this.makeError('invalid request method, only POST is supported'),
                    };
                }
                if (!requestBody) {
                    return { status: 400, body: this.makeError('missing request body') };
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
            case 'check':
                if (method !== 'GET') {
                    return {
                        status: 400,
                        body: this.makeError('invalid request method, only GET is supported'),
                    };
                }
                try {
                    args = query?.q ? this.unmarshalQ(query.q as string, query.meta as string | undefined) : {};
                } catch {
                    return { status: 400, body: this.makeError('invalid "q" query parameter') };
                }
                break;

            case 'update':
            case 'updateMany':
                if (method !== 'PUT' && method !== 'PATCH') {
                    return {
                        status: 400,
                        body: this.makeError('invalid request method, only PUT AND PATCH are supported'),
                    };
                }
                if (!requestBody) {
                    return { status: 400, body: this.makeError('missing request body') };
                }

                args = requestBody;
                break;

            case 'delete':
            case 'deleteMany':
                if (method !== 'DELETE') {
                    return {
                        status: 400,
                        body: this.makeError('invalid request method, only DELETE is supported'),
                    };
                }
                try {
                    args = query?.q ? this.unmarshalQ(query.q as string, query.meta as string | undefined) : {};
                } catch {
                    return { status: 400, body: this.makeError('invalid "q" query parameter') };
                }
                break;

            default:
                return { status: 400, body: this.makeError('invalid operation: ' + op) };
        }

        const { error, zodErrors, data: parsedArgs } = await this.processRequestPayload(args, model, dbOp, zodSchemas);
        if (error) {
            return { status: 422, body: this.makeError(error, CrudFailureReason.DATA_VALIDATION_VIOLATION, zodErrors) };
        }

        try {
            if (!prisma[model]) {
                return { status: 400, body: this.makeError(`unknown model name: ${model}`) };
            }

            const result = await prisma[model][dbOp](parsedArgs);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let response: any = { data: result };

            // superjson serialize response
            if (result) {
                const { json, meta } = SuperJSON.serialize(result);
                response = { data: json };
                if (meta) {
                    response.meta = { serialization: meta };
                }
            }

            return { status: resCode, body: response };
        } catch (err) {
            if (isPrismaClientKnownRequestError(err)) {
                let status: number;

                if (err.meta?.reason === CrudFailureReason.DATA_VALIDATION_VIOLATION) {
                    // data validation error
                    status = 422;
                } else {
                    status = ERROR_STATUS_MAPPING[err.code] ?? 400;
                }

                const { error } = this.makeError(
                    err.message,
                    err.meta?.reason as string,
                    err.meta?.zodErrors as ZodError
                );
                return {
                    status,
                    body: {
                        error: {
                            ...error,
                            prisma: true,
                            code: err.code,
                        },
                    },
                };
            } else if (isPrismaClientUnknownRequestError(err) || isPrismaClientValidationError(err)) {
                logError(logger, err.message);
                return {
                    status: 400,
                    body: {
                        error: {
                            prisma: true,
                            message: err.message,
                        },
                    },
                };
            } else {
                const _err = err as Error;
                logError(logger, _err.message + (_err.stack ? '\n' + _err.stack : ''));
                return {
                    status: 400,
                    body: this.makeError((err as Error).message),
                };
            }
        }
    }

    private makeError(message: string, reason?: string, zodErrors?: ZodError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error: any = { message, reason };
        if (reason === CrudFailureReason.ACCESS_POLICY_VIOLATION || reason === CrudFailureReason.RESULT_NOT_READABLE) {
            error.rejectedByPolicy = true;
        }
        if (reason === CrudFailureReason.DATA_VALIDATION_VIOLATION) {
            error.rejectedByValidation = true;
        }
        if (zodErrors) {
            error.zodErrors = zodErrors;
        }
        return { error };
    }

    private async processRequestPayload(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: any,
        model: string,
        dbOp: string,
        zodSchemas: ZodSchemas | undefined
    ) {
        const { meta, ...rest } = args;
        if (meta?.serialization) {
            // superjson deserialization
            args = SuperJSON.deserialize({ json: rest, meta: meta.serialization });
        }
        return this.zodValidate(zodSchemas, model, dbOp as keyof DbOperations, args);
    }

    private getZodSchema(zodSchemas: ZodSchemas, model: string, operation: keyof DbOperations) {
        // e.g.: UserInputSchema { findUnique: [schema] }
        return zodSchemas.input?.[`${upperCaseFirst(model)}InputSchema`]?.[operation];
    }

    private zodValidate(
        zodSchemas: ZodSchemas | undefined,
        model: string,
        operation: keyof DbOperations,
        args: unknown
    ) {
        const zodSchema = zodSchemas && this.getZodSchema(zodSchemas, model, operation);
        if (zodSchema) {
            const parseResult = zodSchema.safeParse(args);
            if (parseResult.success) {
                return { data: args, error: undefined, zodErrors: undefined };
            } else {
                return {
                    data: undefined,
                    error: fromZodError(parseResult.error).message,
                    zodErrors: parseResult.error,
                };
            }
        } else {
            return { data: args, error: undefined, zodErrors: undefined };
        }
    }

    private unmarshalQ(value: string, meta: string | undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsedValue: any;
        try {
            parsedValue = JSON.parse(value);
        } catch {
            throw new Error('invalid "q" query parameter');
        }

        if (meta) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let parsedMeta: any;
            try {
                parsedMeta = JSON.parse(meta);
            } catch {
                throw new Error('invalid "meta" query parameter');
            }

            if (parsedMeta.serialization) {
                return SuperJSON.deserialize({ json: parsedValue, meta: parsedMeta.serialization });
            }
        }

        return parsedValue;
    }
}

export default function makeHandler() {
    const handler = new RequestHandler();
    return handler.handleRequest.bind(handler);
}

export { makeHandler as RPCApiHandler };
