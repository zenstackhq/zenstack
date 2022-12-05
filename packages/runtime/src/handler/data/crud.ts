/* eslint-disable @typescript-eslint/no-explicit-any */
import cuid from 'cuid';
import superjson from 'superjson';
import { TRANSACTION_FIELD_NAME } from '../../constants';
import {
    DbClientContract,
    DbOperations,
    getServerErrorMessage,
    QueryContext,
    ServerErrorCode,
    Service,
} from '../../types';
import { ValidationError } from '../../validation';
import { CRUDError } from '../types';
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
export class CRUD<DbClient> {
    constructor(private readonly service: Service<DbClient>) {}

    private get db() {
        return this.service.db as DbClientContract;
    }

    async get(
        model: string,
        id: string,
        args: any,
        context: QueryContext
    ): Promise<unknown> {
        args = args ?? {};
        args.where = and(args.where, { id });

        let entities: unknown[];
        try {
            entities = await readWithCheck(
                model,
                args,
                this.service,
                context,
                this.db
            );
        } catch (err) {
            throw this.processError(err, 'get', model);
        }

        return entities[0];
    }

    async find(
        model: string,
        args: any,
        context: QueryContext
    ): Promise<unknown[]> {
        try {
            return await readWithCheck(
                model,
                args ?? {},
                this.service,
                context,
                this.db
            );
        } catch (err) {
            throw this.processError(err, 'find', model);
        }
    }

    async create(
        model: string,
        args: any,
        context: QueryContext
    ): Promise<unknown> {
        if (!args) {
            throw new CRUDError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'body is required'
            );
        }
        if (!args.data) {
            throw new CRUDError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'data field is required'
            );
        }

        let createResult: { id: string };

        try {
            await this.service.validateModelPayload(model, 'create', args.data);

            // preprocess payload to modify fields as required by attribute like @password
            await preprocessWritePayload(model, args, this.service);

            const transactionId = cuid();

            // start an interactive transaction
            createResult = await this.db.$transaction(
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
                    this.service.verbose(
                        `Conducting create: ${model}:\n${superjson.stringify(
                            args
                        )}`
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
                            this.service.verbose(
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
        } catch (err) {
            throw this.processError(err, 'create', model);
        }

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args, where: { id: createResult.id } };
        delete readArgs.data;

        try {
            const result = await readWithCheck(
                model,
                readArgs,
                this.service,
                context,
                this.db
            );
            if (result.length === 0) {
                throw new CRUDError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
                );
            }
            return result[0];
        } catch (err) {
            if (
                err instanceof CRUDError &&
                err.code === ServerErrorCode.DENIED_BY_POLICY
            ) {
                throw new CRUDError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
                );
            } else {
                throw err;
            }
        }
    }

    async update(
        model: string,
        id: string,
        args: any,
        context: QueryContext
    ): Promise<unknown> {
        if (!args) {
            throw new CRUDError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'body is required'
            );
        }

        try {
            await this.service.validateModelPayload(model, 'update', args.data);

            // preprocess payload to modify fields as required by attribute like @password
            await preprocessWritePayload(model, args, this.service);

            args.where = { ...args.where, id };

            const transactionId = cuid();

            await this.db.$transaction(
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
                    this.service.verbose(
                        `Conducting update: ${model}:\n${superjson.stringify(
                            args
                        )}`
                    );
                    await tx[model].update(args);

                    // verify that nested creates pass policy check
                    await Promise.all(
                        createdModels.map(async (model) => {
                            const createdIds = await queryIds(model, tx, {
                                [TRANSACTION_FIELD_NAME]: `${transactionId}:create`,
                            });
                            this.service.verbose(
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
        } catch (err) {
            throw this.processError(err, 'update', model);
        }

        // verify that return data requested by query args pass policy check
        const readArgs = { ...args };
        delete readArgs.data;

        try {
            const result = await readWithCheck(
                model,
                readArgs,
                this.service,
                context,
                this.db
            );
            if (result.length === 0) {
                throw new CRUDError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
                );
            }
            return result[0];
        } catch (err) {
            if (
                err instanceof CRUDError &&
                err.code === ServerErrorCode.DENIED_BY_POLICY
            ) {
                throw new CRUDError(
                    ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED
                );
            } else {
                throw err;
            }
        }
    }

    async del(
        model: string,
        id: string,
        args: any,
        context: QueryContext
    ): Promise<unknown> {
        let result: unknown;

        try {
            // ensures the item under deletion passes policy check
            await checkPolicyForIds(
                model,
                [id],
                'delete',
                this.service,
                context,
                this.db
            );

            args = args ?? {};
            args.where = { ...args.where, id };

            result = await this.db.$transaction(
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
                            err instanceof CRUDError &&
                            err.code === ServerErrorCode.DENIED_BY_POLICY
                        ) {
                            // can't read back, just return undefined, outer logic handles it
                        } else {
                            throw err;
                        }
                    }

                    // conduct the deletion
                    this.service.verbose(
                        `Conducting delete ${model}:\n${superjson.stringify(
                            args
                        )}`
                    );
                    await tx[model].delete(args);

                    return readResult;
                }
            );
        } catch (err) {
            throw this.processError(err, 'del', model);
        }

        if (result) {
            return result;
        } else {
            throw new CRUDError(ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED);
        }
    }

    private isPrismaClientKnownRequestError(
        err: any
    ): err is { code: string; message: string } {
        return (
            err.__proto__.constructor.name === 'PrismaClientKnownRequestError'
        );
    }

    private isPrismaClientValidationError(
        err: any
    ): err is { message: string } {
        return err.__proto__.constructor.name === 'PrismaClientValidationError';
    }

    private processError(
        err: unknown,
        operation: 'get' | 'find' | 'create' | 'update' | 'del',
        model: string
    ) {
        if (err instanceof CRUDError) {
            return err;
        }

        if (this.isPrismaClientKnownRequestError(err)) {
            this.service.warn(
                `Prisma request error: ${operation} ${model}: ${err}`
            );

            // errors thrown by Prisma, try mapping to a known error
            if (PRISMA_ERROR_MAPPING[err.code]) {
                return new CRUDError(
                    PRISMA_ERROR_MAPPING[err.code],
                    getServerErrorMessage(PRISMA_ERROR_MAPPING[err.code])
                );
            } else {
                return new CRUDError(
                    ServerErrorCode.UNKNOWN,
                    'an unhandled Prisma error occurred: ' + err.code
                );
            }
        } else if (this.isPrismaClientValidationError(err)) {
            this.service.warn(
                `Prisma validation error: ${operation} ${model}: ${err}`
            );

            // prisma validation error
            return new CRUDError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                getServerErrorMessage(ServerErrorCode.INVALID_REQUEST_PARAMS)
            );
        } else if (err instanceof ValidationError) {
            this.service.warn(
                `Field constraint validation error: ${operation} ${model}: ${err.message}`
            );

            return new CRUDError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                err.message
            );
        } else {
            // generic errors
            this.service.error(
                `An unknown error occurred: ${JSON.stringify(err)}`
            );
            if (err instanceof Error && err.stack) {
                this.service.error(err.stack);
            }
            return new CRUDError(
                ServerErrorCode.UNKNOWN,
                getServerErrorMessage(ServerErrorCode.UNKNOWN)
            );
        }
    }
}
