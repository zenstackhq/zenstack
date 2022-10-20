import { NextApiRequest, NextApiResponse } from 'next';
import { RequestHandlerOptions } from '../../request-handler';
import {
    PolicyOperationKind,
    QueryContext,
    ServerErrorCode,
    Service,
} from '../../types';
import { RequestHandler, RequestHandlerError } from '../types';
import { QueryProcessor } from './query-processor';
import { v4 as uuid } from 'uuid';
import { TRANSACTION_FIELD_NAME } from '../../constants';
import { and } from './guard-utils';

const PRISMA_ERROR_MAPPING: Record<string, ServerErrorCode> = {
    P2002: ServerErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
    P2003: ServerErrorCode.REFERENCE_CONSTRAINT_VIOLATION,
    P2025: ServerErrorCode.REFERENCE_CONSTRAINT_VIOLATION,
};

export default class DataHandler<DbClient> implements RequestHandler {
    private readonly queryProcessor: QueryProcessor;

    constructor(
        private readonly service: Service<DbClient>,
        private readonly options: RequestHandlerOptions
    ) {
        this.queryProcessor = new QueryProcessor(service);
    }

    async handle(req: NextApiRequest, res: NextApiResponse, path: string[]) {
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
        } catch (err: any) {
            console.log(`Error handling ${method} ${model}: ${err}`);
            if (err instanceof RequestHandlerError) {
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
            } else if (err.code) {
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
        const db = (this.service.db as any)[model];
        const args = req.query.q ? JSON.parse(req.query.q as string) : {};
        const processedArgs = await this.queryProcessor.processQueryArgs(
            model,
            args,
            'read',
            context
        );

        let r;
        if (id) {
            if (processedArgs.where) {
                processedArgs.where = and(processedArgs.where, { id });
            } else {
                processedArgs.where = { id };
            }
            r = await db.findFirst(processedArgs);
            if (!r) {
                throw new RequestHandlerError(
                    ServerErrorCode.ENTITY_NOT_FOUND,
                    'not found'
                );
            }
        } else {
            r = await db.findMany(processedArgs);
        }

        console.log(`Finding ${model}:\n${JSON.stringify(processedArgs)}`);
        await this.queryProcessor.postProcess(model, r, 'read', context);

        res.status(200).send(r);
    }

    private async post(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        context: QueryContext
    ) {
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

        const db = this.service.db as any;
        const transactionid = uuid();
        const { writeArgs, includedModels } =
            await this.queryProcessor.processQueryArgsForWrite(
                model,
                args,
                'create',
                context,
                transactionid
            );

        const r = await db.$transaction(async (tx: any) => {
            console.log(`Create ${model}:\n${JSON.stringify(writeArgs)}`);
            const created = await tx[model].create(writeArgs);

            await this.checkPolicyForIncludedModels(
                includedModels,
                transactionid,
                tx,
                context
            );

            const finalResultArgs = {
                where: { id: created.id },
                include: args.include,
                select: args.select,
            };
            return await tx[model].findUnique(finalResultArgs);
        });

        await this.queryProcessor.postProcess(model, r, 'create', context);
        res.status(201).send(r);
    }

    private async checkPolicyForIncludedModels(
        includedModels: Set<string>,
        transactionId: string,
        transaction: any,
        context: QueryContext
    ) {
        const modelChecks = Array.from(includedModels).map(
            async (modelToCheck) => {
                for (const operation of ['create', 'update', 'delete']) {
                    const queryArgs = {
                        where: {
                            [TRANSACTION_FIELD_NAME]: `${transactionId}:${operation}`,
                        },
                    };
                    const fullCount = await transaction[modelToCheck].count(
                        queryArgs
                    );

                    if (fullCount > 0) {
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

        const db = this.service.db as any;
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

        const r = await db.$transaction(async (tx: any) => {
            console.log(`Update ${model}:\n${JSON.stringify(writeArgs)}`);
            await tx[model].update(writeArgs);

            await this.checkPolicyForIncludedModels(
                includedModels,
                transactionid,
                tx,
                context
            );

            const finalResultArgs = {
                where: { id },
                include: args.include,
                select: args.select,
            };
            return await tx[model].findUnique(finalResultArgs);
        });

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
        const db = (this.service.db as any)[model];
        const r = await db.delete(delArgs);
        await this.queryProcessor.postProcess(model, r, 'delete', context);

        res.status(200).send(r);
    }

    private async ensureEntityPolicy(
        id: string,
        model: string,
        operation: PolicyOperationKind,
        context: QueryContext
    ) {
        const db = (this.service.db as any)[model];

        // check if the record is readable concerning "delete" policy
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
