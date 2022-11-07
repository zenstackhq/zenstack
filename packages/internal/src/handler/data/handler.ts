/* eslint-disable @typescript-eslint/no-explicit-any */
import cuid from 'cuid';
import { NextApiRequest, NextApiResponse } from 'next';
import { TRANSACTION_FIELD_NAME } from '../../constants';
import { RequestHandlerOptions } from '../../request-handler';
import {
    DbClientContract,
    DbOperations,
    getServerErrorMessage,
    QueryContext,
    ServerErrorCode,
    Service,
} from '../../types';
import { RequestHandler, RequestHandlerError } from '../types';
import {
    and,
    checkPolicyForIds,
    injectTransactionId,
    preprocessWritePayload,
    preUpdateCheck,
    queryIds,
    readWithCheck,
} from './policy-utils';

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
    constructor(
        private readonly service: Service<DbClient>,
        private readonly options: RequestHandlerOptions
    ) {}

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
            } else if (this.isPrismaClientKnownRequestError(err)) {
                // errors thrown by Prisma, try mapping to a known error
                if (PRISMA_ERROR_MAPPING[err.code]) {
                    res.status(400).send({
                        code: PRISMA_ERROR_MAPPING[err.code],
                        message: getServerErrorMessage(
                            PRISMA_ERROR_MAPPING[err.code]
                        ),
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
                if (err instanceof Error) {
                    console.error(err.stack);
                }
                res.status(500).send({
                    error: ServerErrorCode.UNKNOWN,
                    message: getServerErrorMessage(ServerErrorCode.UNKNOWN),
                });
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
                throw new RequestHandlerError(ServerErrorCode.ENTITY_NOT_FOUND);
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

        // preprocess payload to modify fields as required by attribute like @password
        await preprocessWritePayload(model, args, this.service);

        const transactionId = cuid();

        // start an interactive transaction
        const r = await this.service.db.$transaction(
            async (tx: Record<string, DbOperations>) => {
                // inject transaction id into update/create payload (direct and nested)
                const { createdModels } = await injectTransactionId(
                    model,
                    args,
                    'create',
                    transactionId,
                    this.service
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
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
                );
            }
            res.status(201).send(result[0]);
        } catch (err) {
            if (
                err instanceof RequestHandlerError &&
                err.code === ServerErrorCode.DENIED_BY_POLICY
            ) {
                throw new RequestHandlerError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
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

        // preprocess payload to modify fields as required by attribute like @password
        await preprocessWritePayload(model, args, this.service);

        args.where = { ...args.where, id };

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
                const { createdModels } = await injectTransactionId(
                    model,
                    args,
                    'update',
                    transactionId,
                    this.service
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
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
                );
            }
            res.status(200).send(result[0]);
        } catch (err) {
            if (
                err instanceof RequestHandlerError &&
                err.code === ServerErrorCode.DENIED_BY_POLICY
            ) {
                throw new RequestHandlerError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
                );
            } else {
                throw err;
            }
        }
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

        // ensures the item under deletion passes policy check
        await checkPolicyForIds(
            model,
            [id],
            'delete',
            this.service,
            context,
            this.service.db
        );

        const args = req.query.q ? JSON.parse(req.query.q as string) : {};
        args.where = { ...args.where, id };

        const r = await this.service.db.$transaction(
            async (tx: Record<string, DbOperations>) => {
                // first fetch the data that needs to be returned after deletion
                let readResult: any;
                try {
                    const items = await readWithCheck(
                        model,
                        args,
                        this.service,
                        context,
                        tx
                    );
                    readResult = items[0];
                } catch (err) {
                    if (
                        err instanceof RequestHandlerError &&
                        err.code === ServerErrorCode.DENIED_BY_POLICY
                    ) {
                        // can't read back, just return undefined, outer logic handles it
                    } else {
                        throw err;
                    }
                }

                // conduct the deletion
                console.log(
                    `Conducting delete ${model}:\n${JSON.stringify(args)}`
                );
                await tx[model].delete(args);

                return readResult;
            }
        );

        if (r) {
            res.status(200).send(r);
        } else {
            throw new RequestHandlerError(
                ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
            );
        }
    }

    private isPrismaClientKnownRequestError(err: any): err is { code: string } {
        // we can't reference Prisma generated types so need to weakly check error type
        return !!err.clientVersion && typeof err.code === 'string';
    }
}
