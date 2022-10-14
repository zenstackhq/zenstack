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
            console.error(`Error handling ${method} ${model}: ${err}`);
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
            } else if (err.code && PRISMA_ERROR_MAPPING[err.code]) {
                res.status(400).send({
                    code: PRISMA_ERROR_MAPPING[err.code],
                    message: 'database access error',
                });
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
                processedArgs.where = {
                    AND: [args.where, { id }],
                };
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
        await this.queryProcessor.postProcess(
            model,
            processedArgs,
            r,
            'read',
            context
        );

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

        const db = this.service.db as any;
        const processedArgs = await this.queryProcessor.processQueryArgs(
            model,
            args,
            'create',
            context,
            false
        );

        const r = await db.$transaction(async (tx: any) => {
            console.log(`Create ${model}:\n${JSON.stringify(processedArgs)}`);
            const created = await tx[model].create(processedArgs);

            let queryArgs = {
                where: { id: created.id },
                include: args.include,
                select: args.select,
            };
            queryArgs = await this.queryProcessor.processQueryArgs(
                model,
                queryArgs,
                'create',
                context
            );
            console.log(
                `Finding created ${model}:\n${JSON.stringify(queryArgs)}`
            );
            const found = await tx[model].findFirst(queryArgs);
            if (!found) {
                throw new RequestHandlerError(
                    ServerErrorCode.DENIED_BY_POLICY,
                    'denied by policy'
                );
            }

            return created;
        });

        await this.queryProcessor.postProcess(
            model,
            processedArgs,
            r,
            'create',
            context
        );
        res.status(201).send(r);
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
        const updateArgs = await this.queryProcessor.processQueryArgs(
            model,
            args,
            'update',
            context,
            false
        );
        updateArgs.where = { ...updateArgs.where, id };

        const r = await db.$transaction(async (tx: any) => {
            console.log(`Update ${model}:\n${JSON.stringify(updateArgs)}`);
            const updated = await tx[model].update(updateArgs);

            // make sure after update, the entity passes policy check
            let queryArgs = {
                where: updateArgs.where,
                include: args.include,
                select: args.select,
            };
            queryArgs = await this.queryProcessor.processQueryArgs(
                model,
                queryArgs,
                'update',
                context
            );
            console.log(
                `Finding post-updated ${model}:\n${JSON.stringify(queryArgs)}`
            );
            const found = await tx[model].findFirst(queryArgs);
            if (!found) {
                throw new RequestHandlerError(
                    ServerErrorCode.DENIED_BY_POLICY,
                    'post-update denied by policy'
                );
            }

            return updated;
        });

        await this.queryProcessor.postProcess(
            model,
            updateArgs,
            r,
            'update',
            context
        );
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
        await this.queryProcessor.postProcess(
            model,
            delArgs,
            r,
            'delete',
            context
        );

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
            `Finding to-be-deleted ${model}:\n${JSON.stringify(readArgs)}`
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
