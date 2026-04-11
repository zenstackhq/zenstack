import { lowerCaseFirst, safeJSONStringify } from '@zenstackhq/common-helpers';
import { CoreCrudOperations, ORMError, ORMErrorReason, type ClientContract } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import SuperJSON from 'superjson';
import { match } from 'ts-pattern';
import z from 'zod';
import { fromError } from 'zod-validation-error/v4';
import type { ApiHandler, LogConfig, RequestContext, Response } from '../../types';
import { getProcedureDef, mapProcedureArgs, PROCEDURE_ROUTE_PREFIXES } from '../common/procedures';
import { loggerSchema, queryOptionsSchema } from '../common/schemas';
import type { CommonHandlerOptions, OpenApiSpecGenerator, OpenApiSpecOptions } from '../common/types';
import { processSuperJsonRequestPayload, unmarshalQ } from '../common/utils';
import { log, registerCustomSerializers } from '../utils';

const TRANSACTION_ROUTE_PREFIX = '$transaction' as const;
const VALID_OPS = new Set(CoreCrudOperations as unknown as string[]);

registerCustomSerializers();

/**
 * Options for {@link RPCApiHandler}
 */
export type RPCApiHandlerOptions<Schema extends SchemaDef = SchemaDef> = {
    /**
     * The schema
     */
    schema: Schema;

    /**
     * Logging configuration
     */
    log?: LogConfig;
} & CommonHandlerOptions<Schema>;

/**
 * RPC style API request handler that mirrors the ZenStackClient API
 */
export class RPCApiHandler<Schema extends SchemaDef = SchemaDef> implements ApiHandler<Schema>, OpenApiSpecGenerator {
    constructor(private readonly options: RPCApiHandlerOptions<Schema>) {
        this.validateOptions(options);
    }

    private validateOptions(options: RPCApiHandlerOptions<Schema>) {
        const schema = z.strictObject({
            schema: z.object(),
            log: loggerSchema.optional(),
            queryOptions: queryOptionsSchema.optional(),
        });
        const parseResult = schema.safeParse(options);
        if (!parseResult.success) {
            throw new Error(`Invalid options: ${fromError(parseResult.error)}`);
        }
    }

    get schema(): Schema {
        return this.options.schema;
    }

    get log(): LogConfig | undefined {
        return this.options.log;
    }

    async handleRequest({ client, method, path, query, requestBody }: RequestContext<Schema>): Promise<Response> {
        const parts = path.split('/').filter((p) => !!p);
        const op = parts.pop();
        let model = parts.pop();

        if (parts.length !== 0 || !op || !model) {
            return this.makeBadInputErrorResponse('invalid request path');
        }

        if (model === PROCEDURE_ROUTE_PREFIXES) {
            return this.handleProcedureRequest({
                client,
                method: method.toUpperCase(),
                proc: op,
                query,
                requestBody,
            });
        }

        if (model === TRANSACTION_ROUTE_PREFIX) {
            return this.handleTransaction({
                client,
                method: method.toUpperCase(),
                type: op,
                requestBody,
            });
        }

        model = lowerCaseFirst(model);
        method = method.toUpperCase();
        let args: unknown;
        let resCode = 200;

        switch (op) {
            case 'create':
            case 'createMany':
            case 'createManyAndReturn':
            case 'upsert':
                if (method !== 'POST') {
                    return this.makeBadInputErrorResponse('invalid request method, only POST is supported');
                }
                if (!requestBody) {
                    return this.makeBadInputErrorResponse('missing request body');
                }

                args = requestBody;
                resCode = 201;
                break;

            case 'findFirst':
            case 'findUnique':
            case 'findMany':
            case 'aggregate':
            case 'groupBy':
            case 'count':
            case 'exists':
                if (method !== 'GET') {
                    return this.makeBadInputErrorResponse('invalid request method, only GET is supported');
                }
                try {
                    args = query?.['q'] ? unmarshalQ(query['q'] as string, query['meta'] as string | undefined) : {};
                } catch {
                    return this.makeBadInputErrorResponse('invalid "q" query parameter');
                }
                break;

            case 'update':
            case 'updateMany':
            case 'updateManyAndReturn':
                if (method !== 'PUT' && method !== 'PATCH') {
                    return this.makeBadInputErrorResponse('invalid request method, only PUT or PATCH are supported');
                }
                if (!requestBody) {
                    return this.makeBadInputErrorResponse('missing request body');
                }

                args = requestBody;
                break;

            case 'delete':
            case 'deleteMany':
                if (method !== 'DELETE') {
                    return this.makeBadInputErrorResponse('invalid request method, only DELETE is supported');
                }
                try {
                    args = query?.['q'] ? unmarshalQ(query['q'] as string, query['meta'] as string | undefined) : {};
                } catch (err) {
                    return this.makeBadInputErrorResponse(
                        err instanceof Error ? err.message : 'invalid "q" query parameter',
                    );
                }
                break;

            default:
                return this.makeBadInputErrorResponse('invalid operation: ' + op);
        }

        const { result: processedArgs, error } = await this.processRequestPayload(args);
        if (error) {
            return this.makeBadInputErrorResponse(error);
        }

        try {
            if (!this.isValidModel(client, model)) {
                return this.makeBadInputErrorResponse(`unknown model name: ${model}`);
            }

            log(
                this.options.log,
                'debug',
                () => `handling "${model}.${op}" request with args: ${safeJSONStringify(processedArgs)}`,
            );

            const clientResult = await (client as any)[model][op](processedArgs);
            let responseBody: any = { data: clientResult };

            // superjson serialize response
            if (clientResult) {
                const { json, meta } = SuperJSON.serialize(clientResult);
                responseBody = { data: json };
                if (meta) {
                    responseBody.meta = { serialization: meta };
                }
            }

            const response = { status: resCode, body: responseBody };
            log(
                this.options.log,
                'debug',
                () => `sending response for "${model}.${op}" request: ${safeJSONStringify(response)}`,
            );
            return response;
        } catch (err) {
            log(this.options.log, 'error', `error occurred when handling "${model}.${op}" request`, err);
            if (err instanceof ORMError) {
                return this.makeORMErrorResponse(err);
            } else {
                return this.makeGenericErrorResponse(err);
            }
        }
    }

    private async handleTransaction({
        client,
        method,
        type,
        requestBody,
    }: {
        client: ClientContract<Schema>;
        method: string;
        type: string;
        requestBody?: unknown;
    }): Promise<Response> {
        if (method !== 'POST') {
            return this.makeBadInputErrorResponse('invalid request method, only POST is supported');
        }

        if (type !== 'sequential') {
            return this.makeBadInputErrorResponse(`unsupported transaction type: ${type}`);
        }

        if (!requestBody || !Array.isArray(requestBody) || requestBody.length === 0) {
            return this.makeBadInputErrorResponse('request body must be a non-empty array of operations');
        }

        const processedOps: Array<{ model: string; op: string; args: unknown }> = [];

        for (let i = 0; i < requestBody.length; i++) {
            const item = requestBody[i];
            if (!item || typeof item !== 'object') {
                return this.makeBadInputErrorResponse(`operation at index ${i} must be an object`);
            }
            const { model: itemModel, op: itemOp, args: itemArgs } = item as any;
            if (!itemModel || typeof itemModel !== 'string') {
                return this.makeBadInputErrorResponse(`operation at index ${i} is missing a valid "model" field`);
            }
            if (!itemOp || typeof itemOp !== 'string') {
                return this.makeBadInputErrorResponse(`operation at index ${i} is missing a valid "op" field`);
            }
            if (!VALID_OPS.has(itemOp)) {
                return this.makeBadInputErrorResponse(`operation at index ${i} has invalid op: ${itemOp}`);
            }
            if (!this.isValidModel(client, lowerCaseFirst(itemModel))) {
                return this.makeBadInputErrorResponse(`operation at index ${i} has unknown model: ${itemModel}`);
            }
            if (
                itemArgs !== undefined &&
                itemArgs !== null &&
                (typeof itemArgs !== 'object' || Array.isArray(itemArgs))
            ) {
                return this.makeBadInputErrorResponse(`operation at index ${i} has invalid "args" field`);
            }

            const { result: processedArgs, error: argsError } = await this.processRequestPayload(itemArgs ?? {});
            if (argsError) {
                return this.makeBadInputErrorResponse(`operation at index ${i}: ${argsError}`);
            }
            processedOps.push({ model: lowerCaseFirst(itemModel), op: itemOp, args: processedArgs });
        }

        try {
            const promises = processedOps.map(({ model, op, args }) => {
                return (client as any)[model][op](args);
            });

            log(this.options.log, 'debug', () => `handling "$transaction" request with ${promises.length} operations`);

            const clientResult = await client.$transaction(promises as any);

            const { json, meta } = SuperJSON.serialize(clientResult);
            const responseBody: any = { data: json };
            if (meta) {
                responseBody.meta = { serialization: meta };
            }

            const response = { status: 200, body: responseBody };
            log(
                this.options.log,
                'debug',
                () => `sending response for "$transaction" request: ${safeJSONStringify(response)}`,
            );
            return response;
        } catch (err) {
            log(this.options.log, 'error', `error occurred when handling "$transaction" request`, err);
            if (err instanceof ORMError) {
                return this.makeORMErrorResponse(err);
            }
            return this.makeGenericErrorResponse(err);
        }
    }

    private async handleProcedureRequest({
        client,
        method,
        proc,
        query,
        requestBody,
    }: {
        client: ClientContract<Schema>;
        method: string;
        proc?: string;
        query?: Record<string, string | string[]>;
        requestBody?: unknown;
    }): Promise<Response> {
        if (!proc) {
            return this.makeBadInputErrorResponse('missing procedure name');
        }

        const procDef = getProcedureDef(this.options.schema, proc);
        if (!procDef) {
            return this.makeBadInputErrorResponse(`unknown procedure: ${proc}`);
        }

        const isMutation = !!procDef.mutation;

        if (isMutation) {
            if (method !== 'POST') {
                return this.makeBadInputErrorResponse('invalid request method, only POST is supported');
            }
        } else {
            if (method !== 'GET') {
                return this.makeBadInputErrorResponse('invalid request method, only GET is supported');
            }
        }

        let argsPayload = method === 'POST' ? requestBody : undefined;
        if (method === 'GET') {
            try {
                argsPayload = query?.['q']
                    ? unmarshalQ(query['q'] as string, query['meta'] as string | undefined)
                    : undefined;
            } catch (err) {
                return this.makeBadInputErrorResponse(
                    err instanceof Error ? err.message : 'invalid "q" query parameter',
                );
            }
        }

        const { result: processedArgsPayload, error } = await processSuperJsonRequestPayload(argsPayload);
        if (error) {
            return this.makeBadInputErrorResponse(error);
        }

        let procInput: unknown;
        try {
            procInput = mapProcedureArgs(procDef, processedArgsPayload);
        } catch (err) {
            return this.makeBadInputErrorResponse(err instanceof Error ? err.message : 'invalid procedure arguments');
        }

        try {
            log(this.options.log, 'debug', () => `handling "$procs.${proc}" request`);

            const clientResult = await (client as any).$procs?.[proc](procInput);

            const { json, meta } = SuperJSON.serialize(clientResult);
            const responseBody: any = { data: json };
            if (meta) {
                responseBody.meta = { serialization: meta };
            }

            const response = { status: 200, body: responseBody };
            log(
                this.options.log,
                'debug',
                () => `sending response for "$procs.${proc}" request: ${safeJSONStringify(response)}`,
            );
            return response;
        } catch (err) {
            log(this.options.log, 'error', `error occurred when handling "$procs.${proc}" request`, err);
            if (err instanceof ORMError) {
                return this.makeORMErrorResponse(err);
            }
            return this.makeGenericErrorResponse(err);
        }
    }

    private isValidModel(client: ClientContract<Schema>, model: string) {
        return Object.keys(client.$schema.models).some((m) => lowerCaseFirst(m) === lowerCaseFirst(model));
    }

    private makeBadInputErrorResponse(message: string) {
        const resp = {
            status: 400,
            body: { error: { message } },
        };
        log(this.options.log, 'debug', () => `sending error response: ${safeJSONStringify(resp)}`);
        return resp;
    }

    private makeGenericErrorResponse(err: unknown) {
        const resp = {
            status: 500,
            body: { error: { message: err instanceof Error ? err.message : 'unknown error' } },
        };
        log(
            this.options.log,
            'debug',
            () => `sending error response: ${safeJSONStringify(resp)}${err instanceof Error ? '\n' + err.stack : ''}`,
        );
        return resp;
    }

    private makeORMErrorResponse(err: ORMError) {
        let status = 400;
        const error: any = { message: err.message, reason: err.reason };

        match(err.reason)
            .with(ORMErrorReason.NOT_FOUND, () => {
                status = 404;
                error.model = err.model;
            })
            .with(ORMErrorReason.INVALID_INPUT, () => {
                status = 422;
                error.rejectedByValidation = true;
                error.model = err.model;
            })
            .with(ORMErrorReason.REJECTED_BY_POLICY, () => {
                status = 403;
                error.rejectedByPolicy = true;
                error.model = err.model;
                error.rejectReason = err.rejectedByPolicyReason;
            })
            .with(ORMErrorReason.DB_QUERY_ERROR, () => {
                status = 400;
                error.dbErrorCode = err.dbErrorCode;
            })
            .otherwise(() => {});

        const resp = { status, body: { error } };
        log(this.options.log, 'debug', () => `sending error response: ${safeJSONStringify(resp)}`);
        return resp;
    }

    async generateSpec(options?: OpenApiSpecOptions) {
        const { RPCApiSpecGenerator } = await import('./openapi');
        const generator = new RPCApiSpecGenerator(this.options);
        return generator.generateSpec(options);
    }

    private async processRequestPayload(args: any) {
        const { meta, ...rest } = args ?? {};
        if (meta?.serialization) {
            try {
                // superjson deserialization
                args = SuperJSON.deserialize({ json: rest, meta: meta.serialization });
            } catch (err) {
                return { result: undefined, error: `failed to deserialize request payload: ${(err as Error).message}` };
            }
        } else {
            // drop meta when no serialization info is present
            args = rest;
        }
        return { result: args, error: undefined };
    }
}
