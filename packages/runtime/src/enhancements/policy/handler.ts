/* eslint-disable @typescript-eslint/no-explicit-any */

import { upperCaseFirst } from 'upper-case-first';
import { fromZodError } from 'zod-validation-error';
import { CrudFailureReason, PrismaErrorCode } from '../../constants';
import { isPrismaClientKnownRequestError } from '../../error';
import { AuthUser, DbClientContract, DbOperations, FieldInfo, PolicyOperationKind } from '../../types';
import { ModelDataVisitor } from '../model-data-visitor';
import { resolveField } from '../model-meta';
import { NestedWriteVisitor, NestedWriteVisitorContext } from '../nested-write-vistor';
import { PrismaProxyHandler } from '../proxy';
import type { ModelMeta, PolicyDef, ZodSchemas } from '../types';
import { enumerate, formatObject, getIdFields, prismaClientValidationError } from '../utils';
import { Logger } from './logger';
import { PolicyUtil } from './policy-utils';

/**
 * Prisma proxy handler for injecting access policy check.
 */
export class PolicyProxyHandler<DbClient extends DbClientContract> implements PrismaProxyHandler {
    private readonly logger: Logger;
    private readonly utils: PolicyUtil;

    constructor(
        private readonly prisma: DbClient,
        private readonly policy: PolicyDef,
        private readonly modelMeta: ModelMeta,
        private readonly zodSchemas: ZodSchemas | undefined,
        private readonly model: string,
        private readonly user?: AuthUser,
        private readonly logPrismaQuery?: boolean
    ) {
        this.logger = new Logger(prisma);
        this.utils = new PolicyUtil(this.prisma, this.modelMeta, this.policy, this.zodSchemas, this.user);
    }

    private get modelClient() {
        return this.prisma[this.model];
    }

    //#region Find

    async findUnique(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }

        args = this.utils.clone(args);
        if (!(await this.utils.injectForRead(this.model, args))) {
            return null;
        }

        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`findUnique\` ${this.model}:\n${formatObject(args)}`);
        }

        const result = await this.modelClient.findUnique(args);
        this.utils.postProcessForRead(result);
        return result;
    }

    async findUniqueOrThrow(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }

        args = this.utils.clone(args);
        if (!(await this.utils.injectForRead(this.model, args))) {
            throw this.utils.notFound(this.model);
        }

        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`findUniqueOrThrow\` ${this.model}:\n${formatObject(args)}`);
        }

        const result = await this.modelClient.findUniqueOrThrow(args);
        this.utils.postProcessForRead(result);
        return result;
    }

    async findFirst(args: any) {
        args = args ? this.utils.clone(args) : {};
        if (!(await this.utils.injectForRead(this.model, args))) {
            return null;
        }

        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`findFirst\` ${this.model}:\n${formatObject(args)}`);
        }

        const result = await this.modelClient.findFirst(args);
        this.utils.postProcessForRead(result);
        return result;
    }

    async findFirstOrThrow(args: any) {
        args = args ? this.utils.clone(args) : {};
        if (!(await this.utils.injectForRead(this.model, args))) {
            throw this.utils.notFound(this.model);
        }

        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`findFirstOrThrow\` ${this.model}:\n${formatObject(args)}`);
        }

        const result = await this.modelClient.findFirstOrThrow(args);
        this.utils.postProcessForRead(result);
        return result;
    }

    async findMany(args: any) {
        args = args ? this.utils.clone(args) : {};
        if (!(await this.utils.injectForRead(this.model, args))) {
            return [];
        }

        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`findMany\` ${this.model}:\n${formatObject(args)}`);
        }

        const result = await this.modelClient.findMany(args);
        this.utils.postProcessForRead(result);
        return result;
    }

    //#endregion

    //#region Create

    async create(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required in query argument');
        }

        await this.utils.tryReject(this.model, 'create');

        const origArgs = args;
        args = this.utils.clone(args);

        // input check for top-level create data
        const inputCheck = this.utils.checkInputGuard(this.model, args.data, 'create');
        if (inputCheck === false) {
            throw this.utils.deniedByPolicy(this.model, 'create');
        }

        const hasNestedCreateOrConnect = await this.hasNestedCreateOrConnect(args);

        if (
            !hasNestedCreateOrConnect &&
            // MUST check true here since inputCheck can be undefined (meaning static input check not possible)
            inputCheck === true
        ) {
            // there's no nested write and we've passed input check, proceed directly without a transaction

            // validate zod schema if any
            this.validateCreateInputSchema(this.model, args.data);

            // make a create args only containing data and ID selection
            const createArgs: any = { data: args.data };
            createArgs.select = this.utils.makeIdSelection(this.model);

            if (this.shouldLogQuery) {
                this.logger.info(`[withPolicy] \`create\` ${this.model}: ${formatObject(createArgs)}`);
            }
            const result = await this.modelClient.create(createArgs);

            // filter the read-back data
            const ids = this.utils.getEntityIds(this.model, result);
            return this.utils.readBack(this.prisma, this.model, 'create', args, ids);
        } else {
            // use a transaction to encapsulate all create/connect operations

            const result = await this.prisma.$transaction(async (tx) => {
                const { result, postWriteChecks } = await this.doCreate(this.model, args, tx);

                // execute post-write checks
                await Promise.all(
                    postWriteChecks.map(({ model, operation, uniqueFilter }) =>
                        this.utils.checkPolicyForUnique(model, uniqueFilter, operation, tx)
                    )
                );

                return result;
            });

            // filter the read-back data
            const ids = this.utils.getEntityIds(this.model, result);
            return this.utils.readBack(this.prisma, this.model, 'create', origArgs, ids);
        }
    }

    private async doCreate(model: string, args: any, db: Record<string, DbOperations>) {
        const idSelections: Array<{ path: FieldInfo[]; ids: string[] }> = [];

        // record id fields involved in the nesting context
        const pushIdFields = (model: string, context: NestedWriteVisitorContext) => {
            const idFields = getIdFields(this.modelMeta, model);
            idSelections.push({
                path: context.nestingPath.map((p) => p.field).filter((f): f is FieldInfo => !!f),
                ids: idFields.map((f) => f.name),
            });
        };

        const getEntityKey = (model: string, ids: any) =>
            `${upperCaseFirst(model)}#${Object.keys(ids)
                .sort()
                .map((f) => `${f}:${ids[f]?.toString()}`)
                .join('_')}`;

        const connectedEntities = new Set<string>();

        const visitor = new NestedWriteVisitor(this.modelMeta, {
            create: async (model, args, context) => {
                // validate zod schema if any
                this.validateCreateInputSchema(model, args);
                pushIdFields(model, context);
            },

            connectOrCreate: async (model, args, context) => {
                // validate zod schema if any
                this.validateCreateInputSchema(model, args.create);

                const existing: any = await db[model].findUnique({
                    select: this.utils.makeIdSelection(model),
                    where: args.where,
                });

                if (existing) {
                    if (context.field?.backLink) {
                        const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                        if (backLinkField.isRelationOwner) {
                            // the target side of relation owns the relation,
                            // check if it's updatable
                            await this.utils.checkPolicyForUnique(model, args.where, 'update', db);
                        }
                    }

                    if (context.parent.connect) {
                        if (Array.isArray(context.parent.connect)) {
                            context.parent.connect.push(args.where);
                        } else {
                            context.parent.connect = [context.parent.connect, args.where];
                        }
                    } else {
                        context.parent.connect = args.where;
                    }
                    // record the key of connected entities so we can avoid validating them later
                    connectedEntities.add(getEntityKey(model, existing));
                } else {
                    pushIdFields(model, context);
                    context.parent.create = args.create;
                }

                delete context.parent['connectOrCreate'];
                return false;
            },

            connect: async (model, args, context) => {
                if (context.field?.backLink) {
                    const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                    if (backLinkField.isRelationOwner) {
                        // the target side of relation owns the relation,
                        // check if it's updatable
                        await this.utils.checkPolicyForUnique(model, args, 'update', db);
                    }
                }
            },
        });

        await visitor.visit(model, 'create', args);

        // consolidate the nested ID selections
        let select: any = undefined;
        if (idSelections.length > 0) {
            select = {};
            idSelections.forEach(({ path, ids }) => {
                let curr = select;
                for (const p of path) {
                    if (!curr[p.name]) {
                        curr[p.name] = { select: {} };
                    }
                    curr = curr[p.name].select;
                }
                Object.assign(curr, ...ids.map((f) => ({ [f]: true })));
            });
        }

        // proceed with the create
        const createArgs = { data: args.data, select };
        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`create\` ${model}: ${formatObject(createArgs)}`);
        }
        const result = await db[model].create(createArgs);

        // post create policy check for the top-level and nested creates
        const postCreateChecks = new Map<
            string,
            { model: string; operation: PolicyOperationKind; uniqueFilter: any }
        >();

        const modelDataVisitor = new ModelDataVisitor(this.modelMeta);
        modelDataVisitor.visit(model, result, (model, _data, scalarData) => {
            const key = getEntityKey(model, scalarData);
            // only check if entity is created, not connected
            if (!connectedEntities.has(key) && !postCreateChecks.has(key)) {
                postCreateChecks.set(key, { model, operation: 'create', uniqueFilter: scalarData });
            }
        });

        return { result, postWriteChecks: [...postCreateChecks.values()] };
    }

    private async hasNestedCreateOrConnect(args: any) {
        let hasNestedCreateOrConnect = false;

        const visitor = new NestedWriteVisitor(this.modelMeta, {
            async connect() {
                hasNestedCreateOrConnect = true;
            },
            async connectOrCreate() {
                hasNestedCreateOrConnect = true;
            },
            async create(model, args, context) {
                if (context.field) {
                    hasNestedCreateOrConnect = true;
                }
            },
        });

        await visitor.visit(this.model, 'create', args);
        return hasNestedCreateOrConnect;
    }

    private validateCreateInputSchema(model: string, data: any) {
        const schema = this.utils.getZodSchema(model, 'create');
        if (schema) {
            const parseResult = schema.safeParse(data);
            if (!parseResult.success) {
                throw this.utils.deniedByPolicy(
                    model,
                    'create',
                    `input failed schema check: ${fromZodError(parseResult.error)}`,
                    CrudFailureReason.DATA_VALIDATION_VIOLATION
                );
            }
        }
    }

    async createMany(args: any, skipDuplicates?: boolean) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required and must be an array');
        }

        this.utils.tryReject(this.model, 'create');

        args = this.utils.clone(args);

        let needPostCreateCheck = false;
        for (const item of enumerate(args.data)) {
            const inputCheck = this.utils.checkInputGuard(this.model, item, 'create');
            if (inputCheck === false) {
                throw this.utils.deniedByPolicy(this.model, 'create');
            } else if (inputCheck === true) {
                this.validateCreateInputSchema(this.model, item);
            } else if (inputCheck === undefined) {
                needPostCreateCheck = true;
                break;
            }
        }

        if (!needPostCreateCheck) {
            return this.modelClient.createMany(args, skipDuplicates);
        } else {
            // create entities in a transaction with post-create checks
            return this.prisma.$transaction(async (tx) => {
                // create entities
                let createResult = await Promise.all(
                    enumerate(args.data).map(async (item) => {
                        try {
                            return await tx[this.model].create({
                                select: this.utils.makeIdSelection(this.model),
                                data: item,
                            });
                        } catch (err) {
                            if (
                                isPrismaClientKnownRequestError(err) &&
                                err.code === PrismaErrorCode.UNIQUE_CONSTRAINT_FAILED
                            ) {
                                if (skipDuplicates) {
                                    // ignore duplicate errors
                                    return undefined;
                                }
                            }
                            throw err;
                        }
                    })
                );

                // filter undefined values due to skipDuplicates
                createResult = createResult.filter((p) => !!p);

                // post-create check
                await Promise.all(
                    createResult.map((data) => this.utils.checkPolicyForUnique(this.model, data, 'create', tx))
                );

                return { count: createResult.length };
            });
        }
    }

    //#endregion

    //#region Update & Upsert

    async update(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required in query argument');
        }

        await this.utils.tryReject(this.model, 'update');

        const origArgs = args;
        args = this.utils.clone(args);

        const postWriteChecks: Array<{
            model: string;
            operation: PolicyOperationKind;
            uniqueFilter: any;
            preValue?: any;
        }> = [];

        // handles nested create inside update as an atomic operation that creates an entire subtree (nested creates/connects)
        const _create = async (
            model: string,
            args: any,
            context: NestedWriteVisitorContext,
            db: Record<string, DbOperations>
        ) => {
            let createData = args;
            if (context.field?.backLink) {
                // handles the connection to upstream entity
                const reversedQuery = await this.utils.buildReversedQuery(context);
                if (reversedQuery[context.field.backLink]) {
                    // the built reverse query contains a condition for the backlink field, build a "connect" with it
                    createData = {
                        ...createData,
                        [context.field.backLink]: {
                            connect: reversedQuery[context.field.backLink],
                        },
                    };
                } else {
                    // otherwise, the reverse query is translated to foreign key setting, merge it to the create data
                    createData = {
                        ...createData,
                        ...reversedQuery,
                    };
                }
            }
            const { postWriteChecks: checks } = await this.doCreate(model, { data: createData }, db);
            postWriteChecks.push(...checks);
        };

        // handles nested connect/disconnect inside update
        const _connectDisconnect = async (
            model: string,
            args: any,
            context: NestedWriteVisitorContext,
            db: Record<string, DbOperations>
        ) => {
            if (context.field?.backLink) {
                const backLinkField = this.utils.getModelField(model, context.field.backLink);
                if (backLinkField.isRelationOwner) {
                    // update happens on the related model, require updatable
                    await this.utils.checkPolicyForUnique(model, args, 'update', db);

                    // register post-update check
                    await _registerPostUpdateCheck(model, args, db);
                }
            }
        };

        // registers a post-update check task
        const _registerPostUpdateCheck = async (model: string, where: any, db: Record<string, DbOperations>) => {
            // both "post-update" rules and Zod schemas require a post-update check
            if (this.utils.hasAuthGuard(model, 'postUpdate') || this.utils.getZodSchema(model)) {
                // select pre-update field values
                let preValue: any;
                const preValueSelect = await this.utils.getPreValueSelect(model);
                if (preValueSelect && Object.keys(preValueSelect).length > 0) {
                    preValue = await db[model].findFirst({ where, select: preValueSelect });
                }
                postWriteChecks.push({ model, operation: 'postUpdate', uniqueFilter: where, preValue });
            }
        };

        // update always happens inside a transaction
        const result: any = await this.prisma.$transaction(
            async (tx) => {
                // visit nested writes
                const visitor = new NestedWriteVisitor(this.modelMeta, {
                    update: async (model, _args, context) => {
                        // build a unique query including upstream conditions
                        const uniqueFilter = await this.utils.buildReversedQuery(context);

                        // handle not-found
                        const existing = await tx[model].findFirst({
                            select: this.utils.makeIdSelection(model),
                            where: uniqueFilter,
                        });
                        if (!existing) {
                            throw this.utils.notFound(model);
                        }

                        // check pre-update guard
                        await this.utils.checkPolicyForUnique(model, uniqueFilter, 'update', tx);

                        // register post-update check
                        await _registerPostUpdateCheck(model, uniqueFilter, tx);
                    },

                    updateMany: async (model, args, context) => {
                        // injects auth guard into where clause
                        await this.utils.injectAuthGuard(args, model, 'update');

                        // prepare for post-update check
                        if (this.utils.hasAuthGuard(model, 'postUpdate') || this.utils.getZodSchema(model)) {
                            let select = this.utils.makeIdSelection(model);
                            const preValueSelect = await this.utils.getPreValueSelect(model);
                            if (preValueSelect) {
                                select = { ...select, ...preValueSelect };
                            }
                            const reversedQuery = await this.utils.buildReversedQuery(context);
                            const currentSetQuery = { select, where: reversedQuery };
                            await this.utils.injectAuthGuard(currentSetQuery, model, 'read');
                            const currentSet = await tx[model].findMany(currentSetQuery);
                            currentSet.forEach((preValue) => {
                                postWriteChecks.push({
                                    model,
                                    operation: 'postUpdate',
                                    uniqueFilter: preValue,
                                    preValue: preValueSelect ? preValue : undefined,
                                });
                            });
                        }
                    },

                    create: async (model, args, context) => {
                        // process the entire create subtree separately
                        await _create(model, args, context, tx);

                        // remove it from the update payload
                        delete context.parent.create;

                        // don't visit payload
                        return false;
                    },

                    upsert: async (model, args, context) => {
                        // build a unique query including upstream conditions
                        const uniqueFilter = await this.utils.buildReversedQuery(context);

                        // branch based on if the update target exists
                        const existing = await tx[model].findUnique({ where: uniqueFilter });
                        if (existing) {
                            // check pre-update guard
                            await this.utils.checkPolicyForUnique(model, uniqueFilter, 'update', tx);

                            // register post-update check
                            await _registerPostUpdateCheck(model, uniqueFilter, uniqueFilter);

                            // convert upsert to update
                            context.parent.update = args.update;

                            // should continue visiting payload
                            return true;
                        } else {
                            // process the entire create subtree separately
                            await _create(model, args, context, tx);

                            // remove it from the update payload
                            delete context.parent.upsert;

                            // don't visit payload
                            return false;
                        }
                    },

                    connect: async (model, args, context) => _connectDisconnect(model, args, context, tx),

                    connectOrCreate: async (model, args, context) => {
                        // the where condition is already unique, so we can use it to check if the target exists
                        const existing = await tx[model].findUnique({ where: args.where });
                        if (existing) {
                            // connect
                            await _connectDisconnect(model, args.where, context, tx);
                        } else {
                            // create
                            await _create(model, args.create, context, tx);
                        }
                    },

                    disconnect: async (model, args, context) => _connectDisconnect(model, args, context, tx),

                    set: async (model, args, context) => {
                        // find the set of items to be replaced
                        const reversedQuery = await this.utils.buildReversedQuery(context);
                        const currentSet = await tx[model].findMany({
                            select: this.utils.makeIdSelection(model),
                            where: reversedQuery,
                        });

                        // register current set for update (foreign key)
                        await Promise.all(currentSet.map((item) => _connectDisconnect(model, item, context, tx)));

                        // proceed with connecting the new set
                        await Promise.all(enumerate(args).map((item) => _connectDisconnect(model, item, context, tx)));
                    },

                    delete: async (model, args, context) => {
                        // build a unique query including upstream conditions
                        const uniqueFilter = await this.utils.buildReversedQuery(context);

                        // handle not-found
                        const existing = await tx[model].findFirst({
                            select: this.utils.makeIdSelection(model),
                            where: uniqueFilter,
                        });
                        if (!existing) {
                            // throw not found instead
                            throw this.utils.notFound(model);
                        }

                        // check delete guard
                        await this.utils.checkPolicyForUnique(model, uniqueFilter, 'delete', tx);
                    },

                    deleteMany: async (model, args, context) => {
                        // inject delete guard
                        const guard = await this.utils.getAuthGuard(model, 'delete');
                        context.parent.deleteMany = this.utils.and(args, guard);
                    },
                });

                await visitor.visit(this.model, 'update', args);

                if (this.shouldLogQuery) {
                    this.logger.info(`[withPolicy] \`update\` ${this.model}: ${formatObject(args)}`);
                }
                const result = await tx[this.model].update({
                    where: args.where,
                    data: args.data,
                    select: this.utils.makeIdSelection(this.model),
                });

                // run post-write checks
                await Promise.all(
                    postWriteChecks.map(async ({ model, operation, uniqueFilter, preValue }) => {
                        if (this.shouldLogQuery) {
                            this.logger.info(
                                `[withPolicy] \`postUpdate\` ${model}: ${formatObject(
                                    uniqueFilter
                                )}, preValue: ${formatObject(preValue)}`
                            );
                        }
                        return this.utils.checkPolicyForUnique(model, uniqueFilter, operation, tx, preValue);
                    })
                );

                return result;
            },
            { timeout: 100000 }
        );

        return this.utils.readBack(this.prisma, this.model, 'update', origArgs, result);
    }

    async updateMany(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required in query argument');
        }

        await this.utils.tryReject(this.model, 'update');

        args = this.utils.clone(args);
        await this.utils.injectAuthGuard(args, this.model, 'update');

        return this.modelClient.updateMany(args);
    }

    async upsert(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }
        if (!args.create) {
            throw prismaClientValidationError(this.prisma, 'create field is required in query argument');
        }
        if (!args.update) {
            throw prismaClientValidationError(this.prisma, 'update field is required in query argument');
        }

        await this.utils.tryReject(this.model, 'create');
        await this.utils.tryReject(this.model, 'update');

        // decompose upsert into create or update

        const select = this.utils.makeIdSelection(this.model);
        const existing = await this.prisma[this.model].findUnique({
            where: args.where,
            select,
        });

        const { where, create, update, ...rest } = args;

        if (existing) {
            return this.update({ where, data: update, ...rest });
        } else {
            return await this.create({ data: create, ...rest });
        }
    }

    //#endregion

    //#region Delete

    async delete(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }

        await this.utils.tryReject(this.model, 'delete');

        // read the entity under deletion with respect to read policies
        let err: Error | undefined = undefined;
        let result: any;
        try {
            result = await this.utils.readBack(this.prisma, this.model, 'delete', args, args.where);
        } catch (_err) {
            err = _err as Error;
        }

        // inject delete guard
        const guard = await this.utils.getAuthGuard(this.model, 'delete');
        const deleteArgs = guard === true ? args : { where: { ...args.where, AND: guard } };

        // proceed with the deletion
        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`delete\` ${this.model}:\n${formatObject(deleteArgs)}`);
        }
        await this.modelClient.delete(deleteArgs);

        if (err) {
            throw err;
        } else {
            return result;
        }
    }

    async deleteMany(args: any) {
        await this.utils.tryReject(this.model, 'delete');

        // inject policy conditions
        args = args ?? {};
        await this.utils.injectAuthGuard(args, this.model, 'delete');

        // conduct the deletion
        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`deleteMany\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.deleteMany(args);
    }

    //#endregion

    //#region Aggregation

    async aggregate(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }

        // inject policy conditions
        await this.utils.injectAuthGuard(args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`aggregate\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.aggregate(args);
    }

    async groupBy(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }

        // inject policy conditions
        await this.utils.injectAuthGuard(args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`groupBy\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.groupBy(args);
    }

    async count(args: any) {
        // inject policy conditions
        args = args ?? {};
        await this.utils.injectAuthGuard(args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[withPolicy] \`count\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.count(args);
    }

    //#endregion

    //#region Utils

    private get shouldLogQuery() {
        return this.logPrismaQuery && this.logger.enabled('info');
    }

    //#endregion
}
