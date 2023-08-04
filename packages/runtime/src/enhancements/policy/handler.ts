/* eslint-disable @typescript-eslint/no-explicit-any */

import { upperCaseFirst } from 'upper-case-first';
import { fromZodError } from 'zod-validation-error';
import { CrudFailureReason } from '../../constants';
import { AuthUser, DbClientContract, DbOperations, FieldInfo, PolicyOperationKind } from '../../types';
import { ModelDataVisitor } from '../model-data-visitor';
import { resolveField } from '../model-meta';
import { NestedWriteVisitor, NestedWriteVisitorContext } from '../nested-write-vistor';
import { PrismaProxyHandler } from '../proxy';
import type { ModelMeta, PolicyDef, ZodSchemas } from '../types';
import { enumerate, formatObject, getIdFields, prismaClientValidationError } from '../utils';
import { Logger } from './logger';
import { PolicyUtil } from './policy-utils';

// a record for post-write policy check
type PostWriteCheckRecord = {
    model: string;
    operation: PolicyOperationKind;
    uniqueFilter: any;
    preValue?: any;
};

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
        this.utils = new PolicyUtil(
            this.prisma,
            this.modelMeta,
            this.policy,
            this.zodSchemas,
            this.user,
            this.shouldLogQuery
        );
    }

    private get modelClient() {
        return this.prisma[this.model];
    }

    //#region Find

    // find operations behaves as if the entities that don't match access policies don't exist

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
            this.logger.info(`[policy] \`findUnique\` ${this.model}:\n${formatObject(args)}`);
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
            this.logger.info(`[policy] \`findUniqueOrThrow\` ${this.model}:\n${formatObject(args)}`);
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
            this.logger.info(`[policy] \`findFirst\` ${this.model}:\n${formatObject(args)}`);
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
            this.logger.info(`[policy] \`findFirstOrThrow\` ${this.model}:\n${formatObject(args)}`);
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
            this.logger.info(`[policy] \`findMany\` ${this.model}:\n${formatObject(args)}`);
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

        // static input policy check for top-level create data
        const inputCheck = this.utils.checkInputGuard(this.model, args.data, 'create');
        if (inputCheck === false) {
            throw this.utils.deniedByPolicy(this.model, 'create');
        }

        const hasNestedCreateOrConnect = await this.hasNestedCreateOrConnect(args);

        return this.prisma.$transaction(async (tx) => {
            if (
                // MUST check true here since inputCheck can be undefined (meaning static input check not possible)
                inputCheck === true &&
                // simple create: no nested create/connect
                !hasNestedCreateOrConnect
            ) {
                // there's no nested write and we've passed input check, proceed with the create directly

                // validate zod schema if any
                this.validateCreateInputSchema(this.model, args.data);

                // make a create args only containing data and ID selection
                const createArgs: any = { data: args.data, select: this.utils.makeIdSelection(this.model) };

                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`create\` ${this.model}: ${formatObject(createArgs)}`);
                }
                const result = await tx[this.model].create(createArgs);

                // filter the read-back data
                return this.utils.readBack(tx, this.model, 'create', args, result);
            } else {
                // proceed with a complex create and collect post-write checks
                const { result, postWriteChecks } = await this.doCreate(this.model, args, tx);

                // execute post-write checks
                await this.runPostWriteChecks(postWriteChecks, tx);

                // filter the read-back data
                return this.utils.readBack(tx, this.model, 'create', origArgs, result);
            }
        });
    }

    // create with nested write
    private async doCreate(model: string, args: any, db: Record<string, DbOperations>) {
        // record id fields involved in the nesting context
        const idSelections: Array<{ path: FieldInfo[]; ids: string[] }> = [];
        const pushIdFields = (model: string, context: NestedWriteVisitorContext) => {
            const idFields = getIdFields(this.modelMeta, model);
            idSelections.push({
                path: context.nestingPath.map((p) => p.field).filter((f): f is FieldInfo => !!f),
                ids: idFields.map((f) => f.name),
            });
        };

        // create a string key that uniquely identifies an entity
        const getEntityKey = (model: string, ids: any) =>
            `${upperCaseFirst(model)}#${Object.keys(ids)
                .sort()
                .map((f) => `${f}:${ids[f]?.toString()}`)
                .join('_')}`;

        // record keys of entities that are connected instead of created
        const connectedEntities = new Set<string>();

        // visit the create payload
        const visitor = new NestedWriteVisitor(this.modelMeta, {
            create: async (model, args, context) => {
                this.validateCreateInputSchema(model, args);
                pushIdFields(model, context);
            },

            createMany: async (model, args, context) => {
                enumerate(args.data).forEach((item) => this.validateCreateInputSchema(model, item));
                pushIdFields(model, context);
            },

            connectOrCreate: async (model, args, context) => {
                if (!args.where) {
                    throw this.utils.validationError(`'where' field is required for connectOrCreate`);
                }

                this.validateCreateInputSchema(model, args.create);

                const existing = await this.utils.checkExistence(db, model, args.where);
                if (existing) {
                    // connect case
                    if (context.field?.backLink) {
                        const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                        if (backLinkField?.isRelationOwner) {
                            // the target side of relation owns the relation,
                            // check if it's updatable
                            await this.utils.checkPolicyForUnique(model, args.where, 'update', db);
                        }
                    }

                    if (context.parent.connect) {
                        // if the payload parent already has a "connect" clause, merge it
                        if (Array.isArray(context.parent.connect)) {
                            context.parent.connect.push(args.where);
                        } else {
                            context.parent.connect = [context.parent.connect, args.where];
                        }
                    } else {
                        // otherwise, create a new "connect" clause
                        context.parent.connect = args.where;
                    }
                    // record the key of connected entities so we can avoid validating them later
                    connectedEntities.add(getEntityKey(model, existing));
                } else {
                    // create case
                    pushIdFields(model, context);

                    // create a new "create" clause at the parent level
                    context.parent.create = args.create;
                }

                // remove the connectOrCreate clause
                delete context.parent['connectOrCreate'];

                // return false to prevent visiting the nested payload
                return false;
            },

            connect: async (model, args, context) => {
                if (!args || typeof args !== 'object' || Object.keys(args).length === 0) {
                    throw this.utils.validationError(`'connect' field must be an non-empty object`);
                }

                if (context.field?.backLink) {
                    const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                    if (backLinkField?.isRelationOwner) {
                        // check existence
                        await this.utils.checkExistence(db, model, args, true);

                        // the target side of relation owns the relation,
                        // check if it's updatable
                        await this.utils.checkPolicyForUnique(model, args, 'update', db);
                    }
                }
            },
        });

        await visitor.visit(model, 'create', args);

        // build the final "select" clause including all nested ID fields
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
            this.logger.info(`[policy] \`create\` ${model}: ${formatObject(createArgs)}`);
        }
        const result = await db[model].create(createArgs);

        // post create policy check for the top-level and nested creates
        const postCreateChecks = new Map<string, PostWriteCheckRecord>();

        // visit the create result and collect entities that need to be post-checked
        const modelDataVisitor = new ModelDataVisitor(this.modelMeta);
        modelDataVisitor.visit(model, result, (model, _data, scalarData) => {
            const key = getEntityKey(model, scalarData);
            // only check if entity is created, not connected
            if (!connectedEntities.has(key) && !postCreateChecks.has(key)) {
                postCreateChecks.set(key, { model, operation: 'create', uniqueFilter: scalarData });
            }
        });

        // return only the ids of the top-level entity
        const ids = this.utils.getEntityIds(this.model, result);
        return { result: ids, postWriteChecks: [...postCreateChecks.values()] };
    }

    // Checks if the given create payload has nested create or connect
    private async hasNestedCreateOrConnect(args: any) {
        let hasNestedCreateOrConnect = false;

        const visitor = new NestedWriteVisitor(this.modelMeta, {
            async create(_model, _args, context) {
                if (context.field) {
                    hasNestedCreateOrConnect = true;
                    return false;
                } else {
                    return true;
                }
            },
            async connect() {
                hasNestedCreateOrConnect = true;
                return false;
            },
            async connectOrCreate() {
                hasNestedCreateOrConnect = true;
                return false;
            },
            async createMany() {
                hasNestedCreateOrConnect = true;
                return false;
            },
        });

        await visitor.visit(this.model, 'create', args);
        return hasNestedCreateOrConnect;
    }

    // Validates the given create payload against Zod schema if any
    private validateCreateInputSchema(model: string, data: any) {
        const schema = this.utils.getZodSchema(model, 'create');
        if (schema) {
            const parseResult = schema.safeParse(data);
            if (!parseResult.success) {
                throw this.utils.deniedByPolicy(
                    model,
                    'create',
                    `input failed validation: ${fromZodError(parseResult.error)}`,
                    CrudFailureReason.DATA_VALIDATION_VIOLATION
                );
            }
        }
    }

    async createMany(args: { data: any; skipDuplicates?: boolean }) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, 'data field is required in query argument');
        }

        this.utils.tryReject(this.model, 'create');

        args = this.utils.clone(args);

        // do static input validation and check if post-create checks are needed
        let needPostCreateCheck = false;
        for (const item of enumerate(args.data)) {
            const inputCheck = this.utils.checkInputGuard(this.model, item, 'create');
            if (inputCheck === false) {
                throw this.utils.deniedByPolicy(this.model, 'create');
            } else if (inputCheck === true) {
                this.validateCreateInputSchema(this.model, item);
            } else if (inputCheck === undefined) {
                // static policy check is not possible, need to do post-create check
                needPostCreateCheck = true;
                break;
            }
        }

        if (!needPostCreateCheck) {
            return this.modelClient.createMany(args);
        } else {
            // create entities in a transaction with post-create checks
            return this.prisma.$transaction(async (tx) => {
                const { result, postWriteChecks } = await this.doCreateMany(this.model, args, tx);
                // post-create check
                await this.runPostWriteChecks(postWriteChecks, tx);
                return result;
            });
        }
    }

    private async doCreateMany(
        model: string,
        args: { data: any; skipDuplicates?: boolean },
        db: Record<string, DbOperations>
    ) {
        // We can't call the native "createMany" because we can't get back what was created
        // for post-create checks. Instead, do a "create" for each item and collect the results.

        let createResult = await Promise.all(
            enumerate(args.data).map(async (item) => {
                if (args.skipDuplicates) {
                    // check unique constraint conflicts
                    // we can't rely on try/catch/ignore constraint violation error: https://github.com/prisma/prisma/issues/20496
                    // TODO: for simple cases we should be able to translate it to an `upsert` with empty `update` payload

                    // for each unique constraint, check if the input item has all fields set, and if so, check if
                    // an entity already exists, and ignore accordingly
                    const uniqueConstraints = this.utils.getUniqueConstraints(model);
                    for (const constraint of Object.values(uniqueConstraints)) {
                        if (constraint.fields.every((f) => item[f] !== undefined)) {
                            const uniqueFilter = constraint.fields.reduce((acc, f) => ({ ...acc, [f]: item[f] }), {});
                            const existing = await this.utils.checkExistence(db, model, uniqueFilter);
                            if (existing) {
                                if (this.shouldLogQuery) {
                                    this.logger.info(`[policy] skipping duplicate ${formatObject(item)}`);
                                }
                                return undefined;
                            }
                        }
                    }
                }

                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`create\` ${model}: ${formatObject(item)}`);
                }
                return await db[model].create({ select: this.utils.makeIdSelection(model), data: item });
            })
        );

        // filter undefined values due to skipDuplicates
        createResult = createResult.filter((p) => !!p);

        return {
            result: { count: createResult.length },
            postWriteChecks: createResult.map((item) => ({
                model,
                operation: 'create' as PolicyOperationKind,
                uniqueFilter: item,
            })),
        };
    }

    //#endregion

    //#region Update & Upsert

    // "update" and "upsert" work against unique entity, so we actively rejects the request if the
    // entity fails policy check
    //
    // "updateMany" works against a set of entities, entities not passing policy check are silently
    // ignored

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

        return await this.prisma.$transaction(async (tx) => {
            // proceed with nested writes and collect post-write checks
            const { result, postWriteChecks } = await this.doUpdate(args, tx);

            // post-write check
            await this.runPostWriteChecks(postWriteChecks, tx);

            // filter the read-back data
            return this.utils.readBack(tx, this.model, 'update', args, result);
        });
    }

    private async doUpdate(args: any, db: Record<string, DbOperations>) {
        args = this.utils.clone(args);

        // collected post-update checks
        const postWriteChecks: PostWriteCheckRecord[] = [];

        // registers a post-update check task
        const _registerPostUpdateCheck = async (model: string, where: any, db: Record<string, DbOperations>) => {
            // both "post-update" rules and Zod schemas require a post-update check
            if (this.utils.hasAuthGuard(model, 'postUpdate') || this.utils.getZodSchema(model)) {
                // select pre-update field values
                let preValue: any;
                const preValueSelect = this.utils.getPreValueSelect(model);
                if (preValueSelect && Object.keys(preValueSelect).length > 0) {
                    preValue = await db[model].findFirst({ where, select: preValueSelect });
                }
                postWriteChecks.push({ model, operation: 'postUpdate', uniqueFilter: where, preValue });
            }
        };

        // We can't let the native "update" to handle nested "create" because we can't get back what
        // was created for doing post-update checks.
        // Instead, handle nested create inside update as an atomic operation that creates an entire
        // subtree (containing nested creates/connects)

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

            // proceed with the create and collect post-create checks
            const { postWriteChecks: checks } = await this.doCreate(model, { data: createData }, db);
            postWriteChecks.push(...checks);
        };

        const _createMany = async (
            model: string,
            args: any,
            context: NestedWriteVisitorContext,
            db: Record<string, DbOperations>
        ) => {
            if (context.field?.backLink) {
                // handles the connection to upstream entity
                const reversedQuery = await this.utils.buildReversedQuery(context);
                for (const item of enumerate(args.data)) {
                    Object.assign(item, reversedQuery);
                }
            }
            // proceed with the create and collect post-create checks
            const { postWriteChecks: checks } = await this.doCreateMany(model, args, db);
            postWriteChecks.push(...checks);
        };

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

        // visit nested writes
        const visitor = new NestedWriteVisitor(this.modelMeta, {
            update: async (model, args, context) => {
                // build a unique query including upstream conditions
                const uniqueFilter = await this.utils.buildReversedQuery(context);

                // handle not-found
                const existing = await this.utils.checkExistence(db, model, uniqueFilter, true);

                // check if the update actually writes to this model
                let thisModelUpdate = false;
                const updatePayload: any = (args as any).data ?? args;
                if (updatePayload) {
                    for (const key of Object.keys(updatePayload)) {
                        const field = resolveField(this.modelMeta, model, key);
                        if (field) {
                            if (!field.isDataModel) {
                                // scalar field, require this model to be updatable
                                thisModelUpdate = true;
                                break;
                            } else if (field.isRelationOwner) {
                                // relation is being updated and this model owns foreign key, require updatable
                                thisModelUpdate = true;
                                break;
                            }
                        }
                    }
                }

                if (thisModelUpdate) {
                    this.utils.tryReject(this.model, 'update');

                    // check pre-update guard
                    await this.utils.checkPolicyForUnique(model, uniqueFilter, 'update', db);

                    // handles the case where id fields are updated
                    const ids = this.utils.clone(existing);
                    for (const key of Object.keys(existing)) {
                        const updateValue = (args as any).data ? (args as any).data[key] : (args as any)[key];
                        if (
                            typeof updateValue === 'string' ||
                            typeof updateValue === 'number' ||
                            typeof updateValue === 'bigint'
                        ) {
                            ids[key] = updateValue;
                        }
                    }

                    // register post-update check
                    await _registerPostUpdateCheck(model, ids, db);
                }
            },

            updateMany: async (model, args, context) => {
                // injects auth guard into where clause
                await this.utils.injectAuthGuard(args, model, 'update');

                // prepare for post-update check
                if (this.utils.hasAuthGuard(model, 'postUpdate') || this.utils.getZodSchema(model)) {
                    let select = this.utils.makeIdSelection(model);
                    const preValueSelect = this.utils.getPreValueSelect(model);
                    if (preValueSelect) {
                        select = { ...select, ...preValueSelect };
                    }
                    const reversedQuery = await this.utils.buildReversedQuery(context);
                    const currentSetQuery = { select, where: reversedQuery };
                    await this.utils.injectAuthGuard(currentSetQuery, model, 'read');

                    if (this.shouldLogQuery) {
                        this.logger.info(`[policy] \`findMany\` ${model}:\n${formatObject(currentSetQuery)}`);
                    }
                    const currentSet = await db[model].findMany(currentSetQuery);

                    postWriteChecks.push(
                        ...currentSet.map((preValue) => ({
                            model,
                            operation: 'postUpdate' as PolicyOperationKind,
                            uniqueFilter: preValue,
                            preValue: preValueSelect ? preValue : undefined,
                        }))
                    );
                }
            },

            create: async (model, args, context) => {
                // process the entire create subtree separately
                await _create(model, args, context, db);

                // remove it from the update payload
                delete context.parent.create;

                // don't visit payload
                return false;
            },

            createMany: async (model, args, context) => {
                // process createMany separately
                await _createMany(model, args, context, db);

                // remove it from the update payload
                delete context.parent.createMany;

                // don't visit payload
                return false;
            },

            upsert: async (model, args, context) => {
                // build a unique query including upstream conditions
                const uniqueFilter = await this.utils.buildReversedQuery(context);

                // branch based on if the update target exists
                const existing = await this.utils.checkExistence(db, model, uniqueFilter);
                if (existing) {
                    // update case

                    // check pre-update guard
                    await this.utils.checkPolicyForUnique(model, uniqueFilter, 'update', db);

                    // register post-update check
                    await _registerPostUpdateCheck(model, uniqueFilter, uniqueFilter);

                    // convert upsert to update
                    context.parent.update = { where: args.where, data: args.update };
                    delete context.parent.upsert;

                    // continue visiting the new payload
                    return context.parent.update;
                } else {
                    // create case

                    // process the entire create subtree separately
                    await _create(model, args.create, context, db);

                    // remove it from the update payload
                    delete context.parent.upsert;

                    // don't visit payload
                    return false;
                }
            },

            connect: async (model, args, context) => _connectDisconnect(model, args, context, db),

            connectOrCreate: async (model, args, context) => {
                // the where condition is already unique, so we can use it to check if the target exists
                const existing = await this.utils.checkExistence(db, model, args.where);
                if (existing) {
                    // connect
                    await _connectDisconnect(model, args.where, context, db);
                } else {
                    // create
                    await _create(model, args.create, context, db);
                }
            },

            disconnect: async (model, args, context) => _connectDisconnect(model, args, context, db),

            set: async (model, args, context) => {
                // find the set of items to be replaced
                const reversedQuery = await this.utils.buildReversedQuery(context);
                const findCurrSetArgs = {
                    select: this.utils.makeIdSelection(model),
                    where: reversedQuery,
                };
                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`findMany\` ${model}:\n${formatObject(findCurrSetArgs)}`);
                }
                const currentSet = await db[model].findMany(findCurrSetArgs);

                // register current set for update (foreign key)
                await Promise.all(currentSet.map((item) => _connectDisconnect(model, item, context, db)));

                // proceed with connecting the new set
                await Promise.all(enumerate(args).map((item) => _connectDisconnect(model, item, context, db)));
            },

            delete: async (model, args, context) => {
                // build a unique query including upstream conditions
                const uniqueFilter = await this.utils.buildReversedQuery(context);

                // handle not-found
                await this.utils.checkExistence(db, model, uniqueFilter, true);

                // check delete guard
                await this.utils.checkPolicyForUnique(model, uniqueFilter, 'delete', db);
            },

            deleteMany: async (model, args, context) => {
                // inject delete guard
                const guard = await this.utils.getAuthGuard(model, 'delete');
                context.parent.deleteMany = this.utils.and(args, guard);
            },
        });

        await visitor.visit(this.model, 'update', args);

        // finally proceed with the update
        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`update\` ${this.model}: ${formatObject(args)}`);
        }
        const result = await db[this.model].update({
            where: args.where,
            data: args.data,
            select: this.utils.makeIdSelection(this.model),
        });

        return { result, postWriteChecks };
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

        if (this.utils.hasAuthGuard(this.model, 'postUpdate') || this.utils.getZodSchema(this.model)) {
            // use a transaction to do post-update checks
            const postWriteChecks: PostWriteCheckRecord[] = [];
            return this.prisma.$transaction(async (tx) => {
                // collect pre-update values
                let select = this.utils.makeIdSelection(this.model);
                const preValueSelect = this.utils.getPreValueSelect(this.model);
                if (preValueSelect) {
                    select = { ...select, ...preValueSelect };
                }
                const currentSetQuery = { select, where: args.where };
                await this.utils.injectAuthGuard(currentSetQuery, this.model, 'read');

                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`findMany\` ${this.model}: ${formatObject(currentSetQuery)}`);
                }
                const currentSet = await tx[this.model].findMany(currentSetQuery);

                postWriteChecks.push(
                    ...currentSet.map((preValue) => ({
                        model: this.model,
                        operation: 'postUpdate' as PolicyOperationKind,
                        uniqueFilter: this.utils.getEntityIds(this.model, preValue),
                        preValue: preValueSelect ? preValue : undefined,
                    }))
                );

                // proceed with the update
                const result = await tx[this.model].updateMany(args);

                // run post-write checks
                await this.runPostWriteChecks(postWriteChecks, tx);

                return result;
            });
        } else {
            // proceed without a transaction
            if (this.shouldLogQuery) {
                this.logger.info(`[policy] \`updateMany\` ${this.model}: ${formatObject(args)}`);
            }
            return this.modelClient.updateMany(args);
        }
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

        // We can call the native "upsert" because we can't tell if an entity was created or updated
        // for doing post-write check accordingly. Instead, decompose it into create or update.

        return await this.prisma.$transaction(async (tx) => {
            const { where, create, update, ...rest } = args;
            const existing = await this.utils.checkExistence(tx, this.model, args.where);

            if (existing) {
                // update case
                const { result, postWriteChecks } = await this.doUpdate({ where, data: update, ...rest }, tx);
                await this.runPostWriteChecks(postWriteChecks, tx);
                return this.utils.readBack(tx, this.model, 'update', args, result);
            } else {
                // create case
                const { result, postWriteChecks } = await this.doCreate(this.model, { data: create, ...rest }, tx);
                await this.runPostWriteChecks(postWriteChecks, tx);
                return this.utils.readBack(tx, this.model, 'create', args, result);
            }
        });
    }

    //#endregion

    //#region Delete

    // "delete" works against a single entity, and is rejected if the entity fails policy check.
    // "deleteMany" works against a set of entities, entities that fail policy check are filtered out.

    async delete(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, 'where field is required in query argument');
        }

        await this.utils.tryReject(this.model, 'delete');

        const { result, error } = await this.prisma.$transaction(async (tx) => {
            // do a read-back before delete
            let read: any;
            let error: Error | undefined;
            try {
                read = await this.utils.readBack(tx, this.model, 'delete', args, args.where);
            } catch (_err) {
                error = _err as Error;
            }

            // check existence
            await this.utils.checkExistence(tx, this.model, args.where, true);

            // inject delete guard
            await this.utils.checkPolicyForUnique(this.model, args.where, 'delete', tx);

            // proceed with the deletion
            if (this.shouldLogQuery) {
                this.logger.info(`[policy] \`delete\` ${this.model}:\n${formatObject(args)}`);
            }
            await tx[this.model].delete(args);

            return { result: read, error };
        });

        if (error) {
            throw error;
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
            this.logger.info(`[policy] \`deleteMany\` ${this.model}:\n${formatObject(args)}`);
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
            this.logger.info(`[policy] \`aggregate\` ${this.model}:\n${formatObject(args)}`);
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
            this.logger.info(`[policy] \`groupBy\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.groupBy(args);
    }

    async count(args: any) {
        // inject policy conditions
        args = args ?? {};
        await this.utils.injectAuthGuard(args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`count\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.count(args);
    }

    //#endregion

    //#region Utils

    private get shouldLogQuery() {
        return !!this.logPrismaQuery && this.logger.enabled('info');
    }

    private async runPostWriteChecks(postWriteChecks: PostWriteCheckRecord[], db: Record<string, DbOperations>) {
        await Promise.all(
            postWriteChecks.map(async ({ model, operation, uniqueFilter, preValue }) =>
                this.utils.checkPolicyForUnique(model, uniqueFilter, operation, db, preValue)
            )
        );
    }

    //#endregion
}
