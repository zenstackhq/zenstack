import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuid } from 'uuid';
import { TRANSACTION_FIELD_NAME } from '../../constants';
import { RequestHandlerOptions } from '../../request-handler';
import {
    DbClientContract,
    DbOperations,
    PolicyOperationKind,
    QueryContext,
    ServerErrorCode,
    Service,
} from '../../types';
import { RequestHandler, RequestHandlerError } from '../types';
import { and } from './guard-utils';
import { QueryProcessor } from './query-processor';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime';

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
        // model specific db client
        const db = this.service.db[model];

        // parse additional query args from "q" parameter
        const args = req.query.q ? JSON.parse(req.query.q as string) : {};

        // get updated query args with policy checks injected
        const processedArgs = await this.queryProcessor.processQueryArgs(
            model,
            args,
            'read',
            context
        );

        let result;
        if (id) {
            // GET <model>/:id, make sure "id" is injected
            if (processedArgs.where) {
                processedArgs.where = and(processedArgs.where, { id });
            } else {
                processedArgs.where = { id };
            }
            result = await db.findFirst(processedArgs);
            if (!result) {
                throw new RequestHandlerError(
                    ServerErrorCode.ENTITY_NOT_FOUND,
                    'not found'
                );
            }
        } else {
            // GET <model>/, get list
            result = await db.findMany(processedArgs);
        }

        console.log(`Finding ${model}:\n${JSON.stringify(processedArgs)}`);
        await this.queryProcessor.postProcess(model, result, 'read', context);

        res.status(200).send(result);
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

        const db = this.service.db;

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

        const transactionid = uuid();

        // inject update args with policy checks, and collect what model types are affected,
        // either directly or via nested writes
        const { writeArgs, includedModels } =
            await this.queryProcessor.processQueryArgsForWrite(
                model,
                args,
                'create',
                context,
                transactionid
            );

        // start an interactive transaction
        const result = await db.$transaction(
            async (tx: Record<string, DbOperations>) => {
                console.log(`Create ${model}:\n${JSON.stringify(writeArgs)}`);

                // conduct the create
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const created: any = await tx[model].create(writeArgs);

                // ensure all affected entities still pass policy checks
                await this.checkPolicyForIncludedModels(
                    includedModels,
                    transactionid,
                    tx,
                    context
                );

                // re-read the created entity, respecting the "include" and "select" directives
                // in the original query

                // TODO: shouldn't we inject 'read' guard so that select/include can't leak data?
                const finalResultArgs = {
                    where: { id: created.id },
                    include: args.include,
                    select: args.select,
                };
                return await tx[model].findUnique(finalResultArgs);
            }
        );

        // While the transaction track-and-check approach ensures that all update results
        // are still valid, it doesn't guarantee that only "visible" data is returned.
        // We make a final post-processing pass to trim the data before returning.
        await this.queryProcessor.postProcess(model, result, 'create', context);

        res.status(201).send(result);
    }

    /**
     * In a transaction context, check entities affected by the transaction (marked by transactionId)
     * satisfies policy checks. If not, throw an error.
     *
     * @param includedModels Model types for narrowing down the search for entities
     * @param transactionId The transaction id
     * @param transaction The transaction client
     * @param context The query context
     */
    private async checkPolicyForIncludedModels(
        includedModels: Set<string>,
        transactionId: string,
        transaction: Record<string, DbOperations>,
        context: QueryContext
    ) {
        const modelChecks = Array.from(includedModels).map(
            async (modelToCheck) => {
                for (const operation of ['create', 'update', 'delete']) {
                    // find entities involved by the transaction for the operation
                    const queryArgs = {
                        where: {
                            [TRANSACTION_FIELD_NAME]: `${transactionId}:${operation}`,
                        },
                    };

                    // get a full count without any policy-check filtering
                    const fullCount = await transaction[modelToCheck].count(
                        queryArgs
                    );

                    if (fullCount > 0) {
                        // get a count with policy-check filtering
                        const processedQueryArgs =
                            await this.queryProcessor.processQueryArgs(
                                modelToCheck,
                                queryArgs,
                                operation as PolicyOperationKind,
                                context
                            );
                        console.log(
                            `Counting ${operation} ${modelToCheck}:\n${JSON.stringify(
                                processedQueryArgs
                            )}`
                        );
                        const filteredCount = await transaction[
                            modelToCheck
                        ].count(processedQueryArgs);

                        if (fullCount !== filteredCount) {
                            // counts don't match, meaning that some of the affected entities failed policy checks
                            console.log(
                                `Model ${modelToCheck}: filtered count ${filteredCount} mismatch full count ${fullCount}, transactionId: ${transactionId}`
                            );
                            throw new RequestHandlerError(
                                ServerErrorCode.DENIED_BY_POLICY,
                                'denied by policy'
                            );
                        }
                    }

                    if (operation === 'delete' && fullCount > 0) {
                        // delete was converted to update during preprocessing, we need to proceed with it now
                        const deleteArgs = {
                            where: {
                                [TRANSACTION_FIELD_NAME]: `${transactionId}:delete`,
                            },
                        };
                        console.log(
                            `Deleting nested entities for ${modelToCheck}:\n${JSON.stringify(
                                deleteArgs
                            )}`
                        );
                        await transaction[modelToCheck].deleteMany(deleteArgs);
                    }
                }
            }
        );

        await Promise.all(modelChecks);
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

        // ensure entity passes policy check
        await this.ensureEntityPolicy(id, model, 'update', context);

        const args = req.body;
        if (!args) {
            throw new RequestHandlerError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'body is required'
            );
        }

        const db = this.service.db;

        // See comments in "post" method for the approach used for policy checking
        const transactionid = uuid();
        args.where = { ...args.where, id };

        const { preWriteGuard, writeArgs, includedModels } =
            await this.queryProcessor.processQueryArgsForWrite(
                model,
                args,
                'update',
                context,
                transactionid
            );

        // make sure target matches policy before update
        console.log(
            `Finding pre-write record:\n${JSON.stringify(preWriteGuard)}`
        );
        let preUpdate = await db[model].findFirst(preWriteGuard);
        if (preUpdate) {
            // run post processing to see if any field is deleted, if so, reject
            const deleted = await this.queryProcessor.postProcess(
                model,
                preUpdate,
                'update',
                context
            );
            if (deleted) {
                preUpdate = null;
            }
        }

        if (!preUpdate) {
            console.log(`Pre-write guard check failed`);
            throw new RequestHandlerError(
                ServerErrorCode.DENIED_BY_POLICY,
                'denied by policy before update'
            );
        }

        const r = await db.$transaction(
            async (tx: Record<string, DbOperations>) => {
                console.log(`Update ${model}:\n${JSON.stringify(writeArgs)}`);
                await tx[model].update(writeArgs);

                await this.checkPolicyForIncludedModels(
                    includedModels,
                    transactionid,
                    tx,
                    context
                );

                // TODO: shouldn't we inject 'read' guard so that select/include can't leak data?
                const finalResultArgs = {
                    where: { id },
                    include: args.include,
                    select: args.select,
                };
                return await tx[model].findUnique(finalResultArgs);
            }
        );

        await this.queryProcessor.postProcess(model, r, 'update', context);
        res.status(200).send(r);
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
