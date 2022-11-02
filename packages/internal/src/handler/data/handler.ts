/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextApiRequest, NextApiResponse } from 'next';
import { TRANSACTION_FIELD_NAME } from '../../constants';
import { RequestHandlerOptions } from '../../request-handler';
import {
    DbClientContract,
    DbOperations,
    FieldInfo,
    PolicyOperationKind,
    QueryContext,
    ServerErrorCode,
    Service,
} from '../../types';
import {
    PrismaWriteActionType,
    RequestHandler,
    RequestHandlerError,
} from '../types';
import {
    and,
    checkPolicyForIds,
    ensureArray,
    preUpdateCheck,
    queryIds,
    readWithCheck,
} from './guard-utils';
import { QueryProcessor } from './query-processor';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import {
    NestedWriteVisitor,
    NestedWriterVisitorAction,
} from './nested-write-vistor';
import cuid from 'cuid';

const PRISMA_ERROR_MAPPING: Record<string, ServerErrorCode> = {
    P2002: ServerErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
    P2003: ServerErrorCode.REFERENCE_CONSTRAINT_VIOLATION,
    P2025: ServerErrorCode.REFERENCE_CONSTRAINT_VIOLATION,
};

/**
 * Request handler for /data endpoint which processes data CRUD requests.
 */
export default class DataHandler<DbClient extends DbClientContract>
    implements RequestHandler
{
    private readonly queryProcessor: QueryProcessor;

    constructor(
        private readonly service: Service<DbClient>,
        private readonly options: RequestHandlerOptions
    ) {
        this.queryProcessor = new QueryProcessor(service);
    }

    async handle(
        req: NextApiRequest,
        res: NextApiResponse,
        path: string[]
    ): Promise<void> {
        const [model, id] = path;
        const method = req.method;

        const context = { user: await this.options.getServerUser(req, res) };

        try {
            switch (method) {
                case 'GET':
                    await this.get(req, res, model, id, context);
                    break;

                case 'POST':
                    await this.post(req, res, model, context);
                    break;

                case 'PUT':
                    await this.put(req, res, model, id, context);
                    break;

                case 'DELETE':
                    await this.del(req, res, model, id, context);
                    break;

                default:
                    console.warn(`Unhandled method: ${method}`);
                    res.status(200).send({});
                    break;
            }
        } catch (err: unknown) {
            console.log(`Error handling ${method} ${model}: ${err}`);

            if (err instanceof RequestHandlerError) {
                // in case of errors thrown directly by ZenStack
                switch (err.code) {
                    case ServerErrorCode.DENIED_BY_POLICY:
                    case ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED:
                        res.status(403).send({
                            code: err.code,
                            message: err.message,
                        });
                        break;
                    case ServerErrorCode.ENTITY_NOT_FOUND:
                        res.status(404).send({
                            code: err.code,
                            message: err.message,
                        });
                        break;
                    default:
                        res.status(400).send({
                            code: err.code,
                            message: err.message,
                        });
                }
            } else if (err instanceof PrismaClientKnownRequestError) {
                // errors thrown by Prisma, try mapping to a known error
                if (PRISMA_ERROR_MAPPING[err.code]) {
                    res.status(400).send({
                        code: PRISMA_ERROR_MAPPING[err.code],
                        message: 'database access error',
                    });
                } else {
                    res.status(400).send({
                        code: 'PRISMA:' + err.code,
                        message: 'an unhandled Prisma error occurred',
                    });
                }
            } else {
                // generic errors
                console.error(
                    `An unknown error occurred: ${JSON.stringify(err)}`
                );
                res.status(500).send({ error: ServerErrorCode.UNKNOWN });
            }
        }
    }

    private async get(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        // parse additional query args from "q" parameter
        const args = req.query.q ? JSON.parse(req.query.q as string) : {};

        if (id) {
            // GET <model>/:id, make sure "id" is injected
            args.where = and(args.where, { id });

            const result = await readWithCheck(
                model,
                args,
                this.service,
                context,
                this.service.db
            );

            if (result.length === 0) {
                throw new RequestHandlerError(
                    ServerErrorCode.ENTITY_NOT_FOUND,
                    'not found'
                );
            }
            res.status(200).send(result[0]);
        } else {
            // GET <model>/, get list
            const result = await readWithCheck(
                model,
                args,
                this.service,
                context,
                this.service.db
            );
            res.status(200).send(result);
        }
    }

    private async post(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        context: QueryContext
    ) {
        // validate args
        const args = req.body;
        if (!args) {
            throw new RequestHandlerError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'body is required'
            );
        }
        if (!args.data) {
            throw new RequestHandlerError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'data field is required'
            );
        }

        // const db = this.service.db;

        // POST creates an entity for a model.
        //
        // Here we cannot exaustively validate the created entity fulfills policies
        // by only inspecting the input payload, because of default values, nested
        // creates/updates, relations, and maybe other reasons.
        //
        // Instead a safer approach is used. For create and update operations, an
        // interactive transaction is employed to conduct the write. After the write
        // completes (without closing the transaction), the affected entities are
        // fetched (in the transaction context) and checked against policies, and roll
        // back the transaction in case of any failure.
        //
        // With operations like upsert and nested updateMany, etc., it's not always
        // possible to identify what entities are affected during the write. An auxiliary
        // field zenstack_transaction is used for tracking this. The value of the
        // field is set like:
        //     zenstack_transaction = <transaction_id>:<operation>
        // , where <transaction_id> is a UUID shared by the entire transaction, and <operation>
        // is the action taken to the specific entity.

        const transactionId = cuid();

        // start an interactive transaction
        const r = await this.service.db.$transaction(
            async (tx: Record<string, DbOperations>) => {
                // inject transaction id into update/create payload (direct and nested)
                const { createdModels } = await this.injectTransactionId(
                    model,
                    args,
                    'create',
                    transactionId
                );

                // conduct the create
                console.log(
                    `Conducting create: ${model}:\n${JSON.stringify(args)}`
                );
                const createResult = (await tx[model].create(args)) as {
                    id: string;
                };

                // verify that the created entity pass policy check
                await checkPolicyForIds(
                    model,
                    [createResult.id],
                    'create',
                    this.service,
                    context,
                    tx
                );

                // verify that nested creates pass policy check
                await Promise.all(
                    createdModels.map(async (model) => {
                        const createdIds = await queryIds(model, tx, {
                            [TRANSACTION_FIELD_NAME]: `${transactionId}:create`,
                        });
                        console.log(
                            `Validating nestedly created entities: ${model}#[${createdIds.join(
                                ', '
                            )}]`
                        );
                        await checkPolicyForIds(
                            model,
                            createdIds,
                            'create',
                            this.service,
                            context,
                            tx
                        );
                    })
                );

                return createResult;
            }
        );

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args, where: { id: r.id } };
        delete readArgs.data;

        try {
            const result = await readWithCheck(
                model,
                readArgs,
                this.service,
                context,
                this.service.db
            );
            if (result.length === 0) {
                throw new RequestHandlerError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED,
                    `create result could not be read back due to policy check`
                );
            }
            res.status(201).send(result[0]);
        } catch (err) {
            if (
                err instanceof RequestHandlerError &&
                err.code === ServerErrorCode.DENIED_BY_POLICY
            ) {
                throw new RequestHandlerError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED,
                    `create result could not be read back due to policy check`
                );
            } else {
                throw err;
            }
        }
    }

    private async put(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        if (!id) {
            throw new RequestHandlerError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'missing "id" parameter'
            );
        }

        const args = req.body;
        if (!args) {
            throw new RequestHandlerError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'body is required'
            );
        }

        args.where = { id };
        const transactionId = cuid();

        await this.service.db.$transaction(
            async (tx: Record<string, DbOperations>) => {
                // make sure the entity (including ones involved in nested write) pass policy check
                await preUpdateCheck(
                    model,
                    id,
                    args,
                    this.service,
                    context,
                    tx
                );

                // inject transaction id into update/create payload (direct and nested)
                const { createdModels } = await this.injectTransactionId(
                    model,
                    args,
                    'update',
                    transactionId
                );

                // conduct the update
                console.log(
                    `Conducting update: ${model}:\n${JSON.stringify(args)}`
                );
                await tx[model].update(args);

                // verify that nested creates pass policy check
                await Promise.all(
                    createdModels.map(async (model) => {
                        const createdIds = await queryIds(model, tx, {
                            [TRANSACTION_FIELD_NAME]: `${transactionId}:create`,
                        });
                        console.log(
                            `Validating nestedly created entities: ${model}#[${createdIds.join(
                                ', '
                            )}]`
                        );
                        await checkPolicyForIds(
                            model,
                            createdIds,
                            'create',
                            this.service,
                            context,
                            tx
                        );
                    })
                );
            }
        );

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args };
        delete readArgs.data;

        try {
            const result = await readWithCheck(
                model,
                readArgs,
                this.service,
                context,
                this.service.db
            );
            if (result.length === 0) {
                throw new RequestHandlerError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED,
                    `update result could not be read back due to policy check`
                );
            }
            res.status(200).send(result[0]);
        } catch (err) {
            if (
                err instanceof RequestHandlerError &&
                err.code === ServerErrorCode.DENIED_BY_POLICY
            ) {
                throw new RequestHandlerError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED,
                    `update result could not be read back due to policy check`
                );
            } else {
                throw err;
            }
        }
    }

    private async injectTransactionId(
        model: string,
        args: any,
        operation: PolicyOperationKind,
        transactionId: string
    ) {
        const updatedModels = new Set<string>();
        const createdModels = new Set<string>();

        if (args.data) {
            args.data[TRANSACTION_FIELD_NAME] = `${transactionId}:${operation}`;
            updatedModels.add(model);
        }

        const visitAction: NestedWriterVisitorAction = async (
            fieldInfo: FieldInfo,
            action: PrismaWriteActionType,
            writeData: any
        ) => {
            if (fieldInfo.isDataModel && writeData) {
                switch (action) {
                    case 'update':
                    case 'updateMany':
                        ensureArray(writeData).forEach((item) => {
                            if (fieldInfo.isArray && item.data) {
                                item.data[
                                    TRANSACTION_FIELD_NAME
                                ] = `${transactionId}:update`;
                            } else {
                                item[
                                    TRANSACTION_FIELD_NAME
                                ] = `${transactionId}:update`;
                            }
                            updatedModels.add(fieldInfo.type);
                        });
                        break;

                    case 'upsert':
                        ensureArray(writeData).forEach((item) => {
                            item.create[
                                TRANSACTION_FIELD_NAME
                            ] = `${transactionId}:create`;
                            createdModels.add(fieldInfo.type);
                            item.update[
                                TRANSACTION_FIELD_NAME
                            ] = `${transactionId}:update`;
                            updatedModels.add(fieldInfo.type);
                        });
                        break;

                    case 'create':
                    case 'createMany':
                        ensureArray(writeData).forEach((item) => {
                            item[
                                TRANSACTION_FIELD_NAME
                            ] = `${transactionId}:create`;
                            createdModels.add(fieldInfo.type);
                        });
                        break;

                    case 'connectOrCreate':
                        ensureArray(writeData).forEach((item) => {
                            item.create[
                                TRANSACTION_FIELD_NAME
                            ] = `${transactionId}:create`;
                            createdModels.add(fieldInfo.type);
                        });
                        break;
                }
            }
        };

        const visitor = new NestedWriteVisitor(this.service);
        await visitor.visit(
            model,
            args.data,
            ['update'],
            undefined,
            visitAction
        );

        return {
            createdModels: Array.from(createdModels),
            updatedModels: Array.from(updatedModels),
        };
    }

    private async del(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        if (!id) {
            throw new RequestHandlerError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'missing "id" parameter'
            );
        }

        // ensure entity passes policy check
        await this.ensureEntityPolicy(id, model, 'delete', context);

        const args = req.query.q ? JSON.parse(req.query.q as string) : {};

        // proceed with deleting
        const delArgs = await this.queryProcessor.processQueryArgs(
            model,
            args,
            'delete',
            context,
            false
        );
        delArgs.where = { ...delArgs.where, id };

        console.log(`Deleting ${model}:\n${JSON.stringify(delArgs)}`);
        const db = this.service.db[model];
        const r = await db.delete(delArgs);
        await this.queryProcessor.postProcess(model, r, 'delete', context);

        res.status(200).send(r);
    }

    /**
     * Ensures entity of a specified "id" satisfies policies for a given "operation".
     */
    private async ensureEntityPolicy(
        id: string,
        model: string,
        operation: PolicyOperationKind,
        context: QueryContext
    ) {
        const db = this.service.db[model];

        // check if the record is readable concerning policy for the operation
        const readArgs = await this.queryProcessor.processQueryArgs(
            model,
            { where: { id } },
            operation,
            context
        );
        console.log(
            `Finding pre-operation ${model}:\n${JSON.stringify(readArgs)}`
        );
        const read = await db.findFirst(readArgs);
        if (!read) {
            throw new RequestHandlerError(
                ServerErrorCode.DENIED_BY_POLICY,
                'denied by policy'
            );
        }
        return read;
    }
}
