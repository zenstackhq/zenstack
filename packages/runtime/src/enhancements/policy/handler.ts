/* eslint-disable @typescript-eslint/no-explicit-any */

import { lowerCaseFirst } from 'lower-case-first';
import invariant from 'tiny-invariant';
import { upperCaseFirst } from 'upper-case-first';
import { fromZodError } from 'zod-validation-error';
import { CrudFailureReason } from '../../constants';
import {
    ModelDataVisitor,
    NestedWriteVisitor,
    NestedWriteVisitorContext,
    enumerate,
    getIdFields,
    requireField,
    resolveField,
    type FieldInfo,
    type ModelMeta,
} from '../../cross';
import { PolicyOperationKind, type CrudContract, type DbClientContract } from '../../types';
import type { EnhancementContext, InternalEnhancementOptions } from '../create-enhancement';
import { Logger } from '../logger';
import { PrismaProxyHandler } from '../proxy';
import { QueryUtils } from '../query-utils';
import { formatObject, isUnsafeMutate, prismaClientValidationError } from '../utils';
import { PolicyUtil } from './policy-utils';
import { createDeferredPromise } from './promise';

// a record for post-write policy check
type PostWriteCheckRecord = {
    model: string;
    operation: PolicyOperationKind;
    uniqueFilter: any;
    preValue?: any;
};

type FindOperations = 'findUnique' | 'findUniqueOrThrow' | 'findFirst' | 'findFirstOrThrow' | 'findMany';

/**
 * Prisma proxy handler for injecting access policy check.
 */
export class PolicyProxyHandler<DbClient extends DbClientContract> implements PrismaProxyHandler {
    private readonly logger: Logger;
    private readonly policyUtils: PolicyUtil;
    private readonly model: string;
    private readonly modelMeta: ModelMeta;
    private readonly prismaModule: any;
    private readonly queryUtils: QueryUtils;

    constructor(
        private readonly prisma: DbClient,
        model: string,
        private readonly options: InternalEnhancementOptions,
        private readonly context?: EnhancementContext
    ) {
        this.logger = new Logger(prisma);
        this.model = lowerCaseFirst(model);

        ({ modelMeta: this.modelMeta, prismaModule: this.prismaModule } = options);

        this.policyUtils = new PolicyUtil(prisma, options, context, this.shouldLogQuery);
        this.queryUtils = new QueryUtils(prisma, options);
    }

    private get modelClient() {
        return this.prisma[this.model];
    }

    //#region Find

    // find operations behaves as if the entities that don't match access policies don't exist

    findUnique(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'where field is required in query argument'
            );
        }
        return this.findWithFluentCallStubs(args, 'findUnique', false, () => null);
    }

    findUniqueOrThrow(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'where field is required in query argument'
            );
        }
        return this.findWithFluentCallStubs(args, 'findUniqueOrThrow', true, () => {
            throw this.policyUtils.notFound(this.model);
        });
    }

    findFirst(args?: any) {
        return this.findWithFluentCallStubs(args, 'findFirst', false, () => null);
    }

    findFirstOrThrow(args: any) {
        return this.findWithFluentCallStubs(args, 'findFirstOrThrow', true, () => {
            throw this.policyUtils.notFound(this.model);
        });
    }

    findMany(args?: any) {
        return createDeferredPromise<unknown[]>(() => this.doFind(args, 'findMany', () => []));
    }

    // returns a promise for the given find operation, together with function stubs for fluent API calls
    private findWithFluentCallStubs(
        args: any,
        actionName: FindOperations,
        resolveRoot: boolean,
        handleRejection: () => any
    ) {
        // create a deferred promise so it's only evaluated when awaited or .then() is called
        const result = createDeferredPromise(() => this.doFind(args, actionName, handleRejection));
        this.addFluentFunctions(result, this.model, args?.where, resolveRoot ? result : undefined);
        return result;
    }

    private doFind(args: any, actionName: FindOperations, handleRejection: () => any) {
        const origArgs = args;
        const _args = this.policyUtils.clone(args);
        if (!this.policyUtils.injectForRead(this.prisma, this.model, _args)) {
            if (this.shouldLogQuery) {
                this.logger.info(`[policy] \`${actionName}\` ${this.model}: unconditionally denied`);
            }
            return handleRejection();
        }

        this.policyUtils.injectReadCheckSelect(this.model, _args);

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`${actionName}\` ${this.model}:\n${formatObject(_args)}`);
        }

        return new Promise((resolve, reject) => {
            this.modelClient[actionName](_args).then(
                (value: any) => {
                    this.policyUtils.postProcessForRead(value, this.model, origArgs);
                    resolve(value);
                },
                (err: any) => reject(err)
            );
        });
    }

    // returns a fluent API call function
    private fluentCall(filter: any, fieldInfo: FieldInfo, rootPromise?: Promise<any>) {
        return (args: any) => {
            args = this.policyUtils.clone(args);

            // combine the parent filter with the current one
            const backLinkField = this.requireBackLink(fieldInfo);
            const condition = backLinkField.isArray
                ? { [backLinkField.name]: { some: filter } }
                : { [backLinkField.name]: { is: filter } };
            args.where = this.policyUtils.and(args.where, condition);

            const promise = createDeferredPromise(() => {
                // Promise for fetching
                const fetchFluent = (resolve: (value: unknown) => void, reject: (reason?: any) => void) => {
                    const handler = this.makeHandler(fieldInfo.type);
                    if (fieldInfo.isArray) {
                        // fluent call stops here
                        handler.findMany(args).then(
                            (value: any) => resolve(value),
                            (err: any) => reject(err)
                        );
                    } else {
                        handler.findFirst(args).then(
                            (value) => resolve(value),
                            (err) => reject(err)
                        );
                    }
                };

                return new Promise((resolve, reject) => {
                    if (rootPromise) {
                        // if a root promise exists, resolve it before fluent API call,
                        // so that fluent calls start with `findUniqueOrThrow` and `findFirstOrThrow`
                        // can throw error properly if the root promise is rejected
                        rootPromise.then(
                            () => fetchFluent(resolve, reject),
                            (err) => reject(err)
                        );
                    } else {
                        fetchFluent(resolve, reject);
                    }
                });
            });

            if (!fieldInfo.isArray) {
                // prepare for a chained fluent API call
                this.addFluentFunctions(promise, fieldInfo.type, args.where, rootPromise);
            }

            return promise;
        };
    }

    // add fluent API functions to the given promise
    private addFluentFunctions(promise: any, model: string, filter: any, rootPromise?: Promise<unknown>) {
        const fields = this.policyUtils.getModelFields(model);
        if (fields) {
            for (const [field, fieldInfo] of Object.entries(fields)) {
                if (fieldInfo.isDataModel) {
                    promise[field] = this.fluentCall(filter, fieldInfo, rootPromise);
                }
            }
        }
    }

    //#endregion

    //#region Create

    async create(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'data field is required in query argument'
            );
        }

        this.policyUtils.tryReject(this.prisma, this.model, 'create');

        const origArgs = args;
        args = this.policyUtils.clone(args);

        // static input policy check for top-level create data
        const inputCheck = this.policyUtils.checkInputGuard(this.model, args.data, 'create');
        if (inputCheck === false) {
            throw this.policyUtils.deniedByPolicy(
                this.model,
                'create',
                undefined,
                CrudFailureReason.ACCESS_POLICY_VIOLATION
            );
        }

        const hasNestedCreateOrConnect = await this.hasNestedCreateOrConnect(args);

        const { result, error } = await this.queryUtils.transaction(this.prisma, async (tx) => {
            if (
                // MUST check true here since inputCheck can be undefined (meaning static input check not possible)
                inputCheck === true &&
                // simple create: no nested create/connect
                !hasNestedCreateOrConnect
            ) {
                // there's no nested write and we've passed input check, proceed with the create directly

                // validate zod schema if any
                args.data = this.validateCreateInputSchema(this.model, args.data);

                // make a create args only containing data and ID selection
                const createArgs: any = { data: args.data, select: this.policyUtils.makeIdSelection(this.model) };

                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`create\` ${this.model}: ${formatObject(createArgs)}`);
                }
                const result = await tx[this.model].create(createArgs);

                // filter the read-back data
                return this.policyUtils.readBack(tx, this.model, 'create', args, result);
            } else {
                // proceed with a complex create and collect post-write checks
                const { result, postWriteChecks } = await this.doCreate(this.model, args, tx);

                // execute post-write checks
                await this.runPostWriteChecks(postWriteChecks, tx);

                // filter the read-back data
                return this.policyUtils.readBack(tx, this.model, 'create', origArgs, result);
            }
        });

        if (error) {
            throw error;
        } else {
            return result;
        }
    }

    // create with nested write
    private async doCreate(model: string, args: any, db: CrudContract) {
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
                const validateResult = this.validateCreateInputSchema(model, args);
                if (validateResult !== args) {
                    this.policyUtils.replace(args, validateResult);
                }
                pushIdFields(model, context);
            },

            createMany: async (model, args, context) => {
                enumerate(args.data).forEach((item) => {
                    const r = this.validateCreateInputSchema(model, item);
                    if (r !== item) {
                        this.policyUtils.replace(item, r);
                    }
                });
                pushIdFields(model, context);
            },

            connectOrCreate: async (model, args, context) => {
                if (!args.where) {
                    throw this.policyUtils.validationError(`'where' field is required for connectOrCreate`);
                }

                if (args.create) {
                    args.create = this.validateCreateInputSchema(model, args.create);
                }

                const existing = await this.policyUtils.checkExistence(db, model, args.where);
                if (existing) {
                    // connect case
                    if (context.field?.backLink) {
                        const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                        if (backLinkField?.isRelationOwner) {
                            // the target side of relation owns the relation,
                            // check if it's updatable
                            await this.policyUtils.checkPolicyForUnique(model, args.where, 'update', db, args);
                        }
                    }

                    this.mergeToParent(context.parent, 'connect', args.where);
                    // record the key of connected entities so we can avoid validating them later
                    connectedEntities.add(getEntityKey(model, existing));
                } else {
                    // create case
                    pushIdFields(model, context);

                    // create a new "create" clause at the parent level
                    this.mergeToParent(context.parent, 'create', args.create);
                }

                // remove the connectOrCreate clause
                this.removeFromParent(context.parent, 'connectOrCreate', args);

                // return false to prevent visiting the nested payload
                return false;
            },

            connect: async (model, args, context) => {
                if (!args || typeof args !== 'object' || Object.keys(args).length === 0) {
                    throw this.policyUtils.validationError(`'connect' field must be an non-empty object`);
                }

                if (context.field?.backLink) {
                    const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                    if (backLinkField?.isRelationOwner) {
                        // check existence
                        await this.policyUtils.checkExistence(db, model, args, true);

                        // the target side of relation owns the relation,
                        // check if it's updatable
                        await this.policyUtils.checkPolicyForUnique(model, args, 'update', db, args);
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
        const ids = this.policyUtils.getEntityIds(this.model, result);
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
        const schema = this.policyUtils.getZodSchema(model, 'create');
        if (schema && data) {
            const parseResult = schema.safeParse(data);
            if (!parseResult.success) {
                throw this.policyUtils.deniedByPolicy(
                    model,
                    'create',
                    `input failed validation: ${fromZodError(parseResult.error)}`,
                    CrudFailureReason.DATA_VALIDATION_VIOLATION,
                    parseResult.error
                );
            }
            return parseResult.data;
        } else {
            return data;
        }
    }

    async createMany(args: { data: any; skipDuplicates?: boolean }) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'data field is required in query argument'
            );
        }

        this.policyUtils.tryReject(this.prisma, this.model, 'create');

        args = this.policyUtils.clone(args);

        // go through create items, statically check input to determine if post-create
        // check is needed, and also validate zod schema
        let needPostCreateCheck = false;
        for (const item of enumerate(args.data)) {
            const validationResult = this.validateCreateInputSchema(this.model, item);
            if (validationResult !== item) {
                this.policyUtils.replace(item, validationResult);
            }

            const inputCheck = this.policyUtils.checkInputGuard(this.model, item, 'create');
            if (inputCheck === false) {
                // unconditionally deny
                throw this.policyUtils.deniedByPolicy(
                    this.model,
                    'create',
                    undefined,
                    CrudFailureReason.ACCESS_POLICY_VIOLATION
                );
            } else if (inputCheck === true) {
                // unconditionally allow
            } else if (inputCheck === undefined) {
                // static policy check is not possible, need to do post-create check
                needPostCreateCheck = true;
            }
        }

        if (!needPostCreateCheck) {
            return this.modelClient.createMany(args);
        } else {
            // create entities in a transaction with post-create checks
            return this.queryUtils.transaction(this.prisma, async (tx) => {
                const { result, postWriteChecks } = await this.doCreateMany(this.model, args, tx);
                // post-create check
                await this.runPostWriteChecks(postWriteChecks, tx);
                return result;
            });
        }
    }

    private async doCreateMany(model: string, args: { data: any; skipDuplicates?: boolean }, db: CrudContract) {
        // We can't call the native "createMany" because we can't get back what was created
        // for post-create checks. Instead, do a "create" for each item and collect the results.

        let createResult = await Promise.all(
            enumerate(args.data).map(async (item) => {
                if (args.skipDuplicates) {
                    if (await this.hasDuplicatedUniqueConstraint(model, item, db)) {
                        if (this.shouldLogQuery) {
                            this.logger.info(`[policy] \`createMany\` skipping duplicate ${formatObject(item)}`);
                        }
                        return undefined;
                    }
                }

                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`create\` for \`createMany\` ${model}: ${formatObject(item)}`);
                }
                return await db[model].create({ select: this.policyUtils.makeIdSelection(model), data: item });
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

    private async hasDuplicatedUniqueConstraint(model: string, createData: any, db: CrudContract) {
        // check unique constraint conflicts
        // we can't rely on try/catch/ignore constraint violation error: https://github.com/prisma/prisma/issues/20496
        // TODO: for simple cases we should be able to translate it to an `upsert` with empty `update` payload

        // for each unique constraint, check if the input item has all fields set, and if so, check if
        // an entity already exists, and ignore accordingly
        const uniqueConstraints = this.policyUtils.getUniqueConstraints(model);
        for (const constraint of Object.values(uniqueConstraints)) {
            if (constraint.fields.every((f) => createData[f] !== undefined)) {
                const uniqueFilter = constraint.fields.reduce((acc, f) => ({ ...acc, [f]: createData[f] }), {});
                const existing = await this.policyUtils.checkExistence(db, model, uniqueFilter);
                if (existing) {
                    return true;
                }
            }
        }
        return false;
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
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'where field is required in query argument'
            );
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'data field is required in query argument'
            );
        }

        args = this.policyUtils.clone(args);

        const { result, error } = await this.queryUtils.transaction(this.prisma, async (tx) => {
            // proceed with nested writes and collect post-write checks
            const { result, postWriteChecks } = await this.doUpdate(args, tx);

            // post-write check
            await this.runPostWriteChecks(postWriteChecks, tx);

            // filter the read-back data
            return this.policyUtils.readBack(tx, this.model, 'update', args, result);
        });

        if (error) {
            throw error;
        } else {
            return result;
        }
    }

    private async doUpdate(args: any, db: CrudContract) {
        // collected post-update checks
        const postWriteChecks: PostWriteCheckRecord[] = [];

        // registers a post-update check task
        const _registerPostUpdateCheck = async (model: string, uniqueFilter: any) => {
            // both "post-update" rules and Zod schemas require a post-update check
            if (this.policyUtils.hasAuthGuard(model, 'postUpdate') || this.policyUtils.getZodSchema(model)) {
                // select pre-update field values
                let preValue: any;
                const preValueSelect = this.policyUtils.getPreValueSelect(model);
                if (preValueSelect && Object.keys(preValueSelect).length > 0) {
                    preValue = await db[model].findFirst({ where: uniqueFilter, select: preValueSelect });
                }
                postWriteChecks.push({ model, operation: 'postUpdate', uniqueFilter, preValue });
            }
        };

        // We can't let the native "update" to handle nested "create" because we can't get back what
        // was created for doing post-update checks.
        // Instead, handle nested create inside update as an atomic operation that creates an entire
        // subtree (containing nested creates/connects)

        const _create = async (model: string, args: any, context: NestedWriteVisitorContext) => {
            let createData = args;
            if (context.field?.backLink) {
                // Check if the create payload contains any "unsafe" assignment:
                // assign id or foreign key fields.
                //
                // The reason why we need to do that is Prisma's mutations payload
                // structure has two mutually exclusive forms for safe and unsafe
                // operations. E.g.:
                //     - safe: { data: { user: { connect: { id: 1 }} } }
                //     - unsafe: { data: { userId: 1 } }
                const unsafe = isUnsafeMutate(model, args, this.modelMeta);

                // handles the connection to upstream entity
                const reversedQuery = this.policyUtils.buildReversedQuery(context, true, unsafe);
                if ((!unsafe || context.field.isRelationOwner) && reversedQuery[context.field.backLink]) {
                    // if mutation is safe, or current field owns the relation (so the other side has no fk),
                    // and the reverse query contains the back link, then we can build a "connect" with it
                    createData = {
                        ...createData,
                        [context.field.backLink]: {
                            connect: reversedQuery[context.field.backLink],
                        },
                    };
                } else {
                    // otherwise, the reverse query should be translated to foreign key setting
                    // and merged to the create data

                    const backLinkField = this.requireBackLink(context.field);
                    invariant(backLinkField.foreignKeyMapping);

                    // try to extract foreign key values from the reverse query
                    let fkValues = Object.values(backLinkField.foreignKeyMapping).reduce<any>((obj, fk) => {
                        obj[fk] = reversedQuery[fk];
                        return obj;
                    }, {});

                    if (Object.values(fkValues).every((v) => v !== undefined)) {
                        // all foreign key values are available, merge them to the create data
                        createData = {
                            ...createData,
                            ...fkValues,
                        };
                    } else {
                        // some foreign key values are missing, need to look up the upstream entity,
                        // this can happen when the upstream entity doesn't have a unique where clause,
                        // for example when it's nested inside a one-to-one update
                        const upstreamQuery = {
                            where: reversedQuery[backLinkField.name],
                            select: this.policyUtils.makeIdSelection(backLinkField.type),
                        };

                        // fetch the upstream entity
                        if (this.logger.enabled('info')) {
                            this.logger.info(
                                `[policy] \`findUniqueOrThrow\` ${model}: looking up upstream entity of ${
                                    backLinkField.type
                                }, ${formatObject(upstreamQuery)}`
                            );
                        }
                        const upstreamEntity = await this.prisma[backLinkField.type].findUniqueOrThrow(upstreamQuery);

                        // map ids to foreign keys
                        fkValues = Object.entries(backLinkField.foreignKeyMapping).reduce<any>((obj, [id, fk]) => {
                            obj[fk] = upstreamEntity[id];
                            return obj;
                        }, {});

                        // merge them to the create data
                        createData = { ...createData, ...fkValues };
                    }
                }
            }

            // proceed with the create and collect post-create checks
            const { postWriteChecks: checks } = await this.doCreate(model, { data: createData }, db);
            postWriteChecks.push(...checks);
        };

        const _createMany = async (
            model: string,
            args: { data: any; skipDuplicates?: boolean },
            context: NestedWriteVisitorContext
        ) => {
            for (const item of enumerate(args.data)) {
                if (args.skipDuplicates) {
                    if (await this.hasDuplicatedUniqueConstraint(model, item, db)) {
                        if (this.shouldLogQuery) {
                            this.logger.info(`[policy] \`createMany\` skipping duplicate ${formatObject(item)}`);
                        }
                        continue;
                    }
                }
                await _create(model, item, context);
            }
        };

        const _connectDisconnect = async (model: string, args: any, context: NestedWriteVisitorContext) => {
            if (context.field?.backLink) {
                const backLinkField = this.policyUtils.getModelField(model, context.field.backLink);
                if (backLinkField?.isRelationOwner) {
                    // update happens on the related model, require updatable,
                    // translate args to foreign keys so field-level policies can be checked
                    const checkArgs: any = {};
                    if (args && typeof args === 'object' && backLinkField.foreignKeyMapping) {
                        for (const key of Object.keys(args)) {
                            const fk = backLinkField.foreignKeyMapping[key];
                            if (fk) {
                                checkArgs[fk] = args[key];
                            }
                        }
                    }
                    await this.policyUtils.checkPolicyForUnique(model, args, 'update', db, checkArgs);

                    // register post-update check
                    await _registerPostUpdateCheck(model, args);
                }
            }
        };

        // visit nested writes
        const visitor = new NestedWriteVisitor(this.modelMeta, {
            update: async (model, args, context) => {
                // build a unique query including upstream conditions
                const uniqueFilter = this.policyUtils.buildReversedQuery(context);

                // handle not-found
                const existing = await this.policyUtils.checkExistence(db, model, uniqueFilter, true);

                // check if the update actually writes to this model
                let thisModelUpdate = false;
                const updatePayload = (args as any).data ?? args;

                const validatedPayload = this.validateUpdateInputSchema(model, updatePayload);
                if (validatedPayload !== updatePayload) {
                    this.policyUtils.replace(updatePayload, validatedPayload);
                }

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
                    this.policyUtils.tryReject(db, this.model, 'update');

                    // check pre-update guard
                    await this.policyUtils.checkPolicyForUnique(model, uniqueFilter, 'update', db, args);

                    // handles the case where id fields are updated
                    const ids = this.policyUtils.clone(existing);
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
                    await _registerPostUpdateCheck(model, ids);
                }
            },

            updateMany: async (model, args, context) => {
                // prepare for post-update check
                if (this.policyUtils.hasAuthGuard(model, 'postUpdate') || this.policyUtils.getZodSchema(model)) {
                    let select = this.policyUtils.makeIdSelection(model);
                    const preValueSelect = this.policyUtils.getPreValueSelect(model);
                    if (preValueSelect) {
                        select = { ...select, ...preValueSelect };
                    }
                    const reversedQuery = this.policyUtils.buildReversedQuery(context);
                    const currentSetQuery = { select, where: reversedQuery };
                    this.policyUtils.injectAuthGuardAsWhere(db, currentSetQuery, model, 'read');

                    if (this.shouldLogQuery) {
                        this.logger.info(
                            `[policy] \`findMany\` for post update check ${model}:\n${formatObject(currentSetQuery)}`
                        );
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

                args.data = this.validateUpdateInputSchema(model, args.data);

                const updateGuard = this.policyUtils.getAuthGuard(db, model, 'update');
                if (this.policyUtils.isTrue(updateGuard) || this.policyUtils.isFalse(updateGuard)) {
                    // injects simple auth guard into where clause
                    this.policyUtils.injectAuthGuardAsWhere(db, args, model, 'update');
                } else {
                    // we have to process `updateMany` separately because the guard may contain
                    // filters using relation fields which are not allowed in nested `updateMany`
                    const reversedQuery = this.policyUtils.buildReversedQuery(context);
                    const updateWhere = this.policyUtils.and(reversedQuery, updateGuard);
                    if (this.shouldLogQuery) {
                        this.logger.info(
                            `[policy] \`updateMany\` ${model}:\n${formatObject({
                                where: updateWhere,
                                data: args.data,
                            })}`
                        );
                    }
                    await db[model].updateMany({ where: updateWhere, data: args.data });
                    delete context.parent.updateMany;
                }
            },

            create: async (model, args, context) => {
                // process the entire create subtree separately
                await _create(model, args, context);

                // remove it from the update payload
                this.removeFromParent(context.parent, 'create', args);

                // don't visit payload
                return false;
            },

            createMany: async (model, args, context) => {
                // process createMany separately
                await _createMany(model, args, context);

                // remove it from the update payload
                delete context.parent.createMany;

                // don't visit payload
                return false;
            },

            upsert: async (model, args, context) => {
                // build a unique query including upstream conditions
                const uniqueFilter = this.policyUtils.buildReversedQuery(context);

                // branch based on if the update target exists
                const existing = await this.policyUtils.checkExistence(db, model, uniqueFilter);
                if (existing) {
                    // update case

                    // check pre-update guard
                    await this.policyUtils.checkPolicyForUnique(model, uniqueFilter, 'update', db, args);

                    // register post-update check
                    await _registerPostUpdateCheck(model, uniqueFilter);

                    // convert upsert to update
                    const convertedUpdate = {
                        where: args.where,
                        data: this.validateUpdateInputSchema(model, args.update),
                    };
                    this.mergeToParent(context.parent, 'update', convertedUpdate);
                    this.removeFromParent(context.parent, 'upsert', args);

                    // continue visiting the new payload
                    return convertedUpdate;
                } else {
                    // create case

                    // process the entire create subtree separately
                    await _create(model, args.create, context);

                    // remove it from the update payload
                    this.removeFromParent(context.parent, 'upsert', args);

                    // don't visit payload
                    return false;
                }
            },

            connect: async (model, args, context) => _connectDisconnect(model, args, context),

            connectOrCreate: async (model, args, context) => {
                // the where condition is already unique, so we can use it to check if the target exists
                const existing = await this.policyUtils.checkExistence(db, model, args.where);
                if (existing) {
                    // connect
                    await _connectDisconnect(model, args.where, context);
                } else {
                    // create
                    await _create(model, args.create, context);
                }
            },

            disconnect: async (model, args, context) => _connectDisconnect(model, args, context),

            set: async (model, args, context) => {
                // find the set of items to be replaced
                const reversedQuery = this.policyUtils.buildReversedQuery(context);
                const findCurrSetArgs = {
                    select: this.policyUtils.makeIdSelection(model),
                    where: reversedQuery,
                };
                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`findMany\` ${model}:\n${formatObject(findCurrSetArgs)}`);
                }
                const currentSet = await db[model].findMany(findCurrSetArgs);

                // register current set for update (foreign key)
                await Promise.all(currentSet.map((item) => _connectDisconnect(model, item, context)));

                // proceed with connecting the new set
                await Promise.all(enumerate(args).map((item) => _connectDisconnect(model, item, context)));
            },

            delete: async (model, args, context) => {
                // build a unique query including upstream conditions
                const uniqueFilter = this.policyUtils.buildReversedQuery(context);

                // handle not-found
                await this.policyUtils.checkExistence(db, model, uniqueFilter, true);

                // check delete guard
                await this.policyUtils.checkPolicyForUnique(model, uniqueFilter, 'delete', db, args);
            },

            deleteMany: async (model, args, context) => {
                const guard = await this.policyUtils.getAuthGuard(db, model, 'delete');
                if (this.policyUtils.isTrue(guard) || this.policyUtils.isFalse(guard)) {
                    // inject simple auth guard
                    context.parent.deleteMany = this.policyUtils.and(args, guard);
                } else {
                    // we have to process `deleteMany` separately because the guard may contain
                    // filters using relation fields which are not allowed in nested `deleteMany`
                    const reversedQuery = this.policyUtils.buildReversedQuery(context);
                    const deleteWhere = this.policyUtils.and(reversedQuery, guard);
                    if (this.shouldLogQuery) {
                        this.logger.info(`[policy] \`deleteMany\` ${model}:\n${formatObject({ where: deleteWhere })}`);
                    }
                    await db[model].deleteMany({ where: deleteWhere });
                    delete context.parent.deleteMany;
                }
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
            select: this.policyUtils.makeIdSelection(this.model),
        });

        return { result, postWriteChecks };
    }

    // Validates the given update payload against Zod schema if any
    private validateUpdateInputSchema(model: string, data: any) {
        const schema = this.policyUtils.getZodSchema(model, 'update');
        if (schema && data) {
            // update payload can contain non-literal fields, like:
            //   { x: { increment: 1 } }
            // we should only validate literal fields

            const literalData = Object.entries(data).reduce<any>(
                (acc, [k, v]) => ({ ...acc, ...(typeof v !== 'object' ? { [k]: v } : {}) }),
                {}
            );

            const parseResult = schema.safeParse(literalData);
            if (!parseResult.success) {
                throw this.policyUtils.deniedByPolicy(
                    model,
                    'update',
                    `input failed validation: ${fromZodError(parseResult.error)}`,
                    CrudFailureReason.DATA_VALIDATION_VIOLATION,
                    parseResult.error
                );
            }

            // schema may have transformed field values, use it to overwrite the original data
            return { ...data, ...parseResult.data };
        } else {
            return data;
        }
    }

    async updateMany(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'data field is required in query argument'
            );
        }

        this.policyUtils.tryReject(this.prisma, this.model, 'update');

        args = this.policyUtils.clone(args);
        this.policyUtils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'update');

        args.data = this.validateUpdateInputSchema(this.model, args.data);

        if (this.policyUtils.hasAuthGuard(this.model, 'postUpdate') || this.policyUtils.getZodSchema(this.model)) {
            // use a transaction to do post-update checks
            const postWriteChecks: PostWriteCheckRecord[] = [];
            return this.queryUtils.transaction(this.prisma, async (tx) => {
                // collect pre-update values
                let select = this.policyUtils.makeIdSelection(this.model);
                const preValueSelect = this.policyUtils.getPreValueSelect(this.model);
                if (preValueSelect) {
                    select = { ...select, ...preValueSelect };
                }
                const currentSetQuery = { select, where: args.where };
                this.policyUtils.injectAuthGuardAsWhere(tx, currentSetQuery, this.model, 'read');

                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`findMany\` ${this.model}: ${formatObject(currentSetQuery)}`);
                }
                const currentSet = await tx[this.model].findMany(currentSetQuery);

                postWriteChecks.push(
                    ...currentSet.map((preValue) => ({
                        model: this.model,
                        operation: 'postUpdate' as PolicyOperationKind,
                        uniqueFilter: this.policyUtils.getEntityIds(this.model, preValue),
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
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'where field is required in query argument'
            );
        }
        if (!args.create) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'create field is required in query argument'
            );
        }
        if (!args.update) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'update field is required in query argument'
            );
        }

        this.policyUtils.tryReject(this.prisma, this.model, 'create');
        this.policyUtils.tryReject(this.prisma, this.model, 'update');

        args = this.policyUtils.clone(args);

        // We can call the native "upsert" because we can't tell if an entity was created or updated
        // for doing post-write check accordingly. Instead, decompose it into create or update.

        const { result, error } = await this.queryUtils.transaction(this.prisma, async (tx) => {
            const { where, create, update, ...rest } = args;
            const existing = await this.policyUtils.checkExistence(tx, this.model, args.where);

            if (existing) {
                // update case
                const { result, postWriteChecks } = await this.doUpdate({ where, data: update, ...rest }, tx);
                await this.runPostWriteChecks(postWriteChecks, tx);
                return this.policyUtils.readBack(tx, this.model, 'update', args, result);
            } else {
                // create case
                const { result, postWriteChecks } = await this.doCreate(this.model, { data: create, ...rest }, tx);
                await this.runPostWriteChecks(postWriteChecks, tx);
                return this.policyUtils.readBack(tx, this.model, 'create', args, result);
            }
        });

        if (error) {
            throw error;
        } else {
            return result;
        }
    }

    //#endregion

    //#region Delete

    // "delete" works against a single entity, and is rejected if the entity fails policy check.
    // "deleteMany" works against a set of entities, entities that fail policy check are filtered out.

    async delete(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(
                this.prisma,
                this.prismaModule,
                'where field is required in query argument'
            );
        }

        this.policyUtils.tryReject(this.prisma, this.model, 'delete');

        const { result, error } = await this.queryUtils.transaction(this.prisma, async (tx) => {
            // do a read-back before delete
            const r = await this.policyUtils.readBack(tx, this.model, 'delete', args, args.where);
            const error = r.error;
            const read = r.result;

            // check existence
            await this.policyUtils.checkExistence(tx, this.model, args.where, true);

            // inject delete guard
            await this.policyUtils.checkPolicyForUnique(this.model, args.where, 'delete', tx, args);

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
        this.policyUtils.tryReject(this.prisma, this.model, 'delete');

        // inject policy conditions
        args = args ?? {};
        this.policyUtils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'delete');

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
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }

        args = this.policyUtils.clone(args);

        // inject policy conditions
        this.policyUtils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`aggregate\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.aggregate(args);
    }

    async groupBy(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.prismaModule, 'query argument is required');
        }

        args = this.policyUtils.clone(args);

        // inject policy conditions
        this.policyUtils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`groupBy\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.groupBy(args);
    }

    async count(args: any) {
        // inject policy conditions
        args = args ? this.policyUtils.clone(args) : {};
        this.policyUtils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`count\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.count(args);
    }

    //#endregion

    //#region Subscribe (Prisma Pulse)

    async subscribe(args: any) {
        const readGuard = this.policyUtils.getAuthGuard(this.prisma, this.model, 'read');
        if (this.policyUtils.isTrue(readGuard)) {
            // no need to inject
            if (this.shouldLogQuery) {
                this.logger.info(`[policy] \`subscribe\` ${this.model}:\n${formatObject(args)}`);
            }
            return this.modelClient.subscribe(args);
        }

        if (!args) {
            // include all
            args = { create: {}, update: {}, delete: {} };
        } else {
            if (typeof args !== 'object') {
                throw prismaClientValidationError(this.prisma, this.prismaModule, 'argument must be an object');
            }
            if (Object.keys(args).length === 0) {
                // include all
                args = { create: {}, update: {}, delete: {} };
            } else {
                args = this.policyUtils.clone(args);
            }
        }

        // inject into subscribe conditions

        if (args.create) {
            args.create.after = this.policyUtils.and(args.create.after, readGuard);
        }

        if (args.update) {
            args.update.after = this.policyUtils.and(args.update.after, readGuard);
        }

        if (args.delete) {
            args.delete.before = this.policyUtils.and(args.delete.before, readGuard);
        }

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`subscribe\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.subscribe(args);
    }

    //#endregion

    //#region Utils

    private get shouldLogQuery() {
        return !!this.options?.logPrismaQuery && this.logger.enabled('info');
    }

    private async runPostWriteChecks(postWriteChecks: PostWriteCheckRecord[], db: CrudContract) {
        await Promise.all(
            postWriteChecks.map(async ({ model, operation, uniqueFilter, preValue }) =>
                this.policyUtils.checkPolicyForUnique(model, uniqueFilter, operation, db, undefined, preValue)
            )
        );
    }

    private makeHandler(model: string) {
        return new PolicyProxyHandler(this.prisma, model, this.options, this.context);
    }

    private requireBackLink(fieldInfo: FieldInfo) {
        invariant(fieldInfo.backLink, `back link not found for field ${fieldInfo.name}`);
        return requireField(this.modelMeta, fieldInfo.type, fieldInfo.backLink);
    }

    private mergeToParent(parent: any, key: string, value: any) {
        if (parent[key]) {
            if (Array.isArray(parent[key])) {
                parent[key].push(value);
            } else {
                parent[key] = [parent[key], value];
            }
        } else {
            parent[key] = value;
        }
    }

    private removeFromParent(parent: any, key: string, data: any) {
        if (parent[key] === data) {
            delete parent[key];
        } else if (Array.isArray(parent[key])) {
            const idx = parent[key].indexOf(data);
            if (idx >= 0) {
                parent[key].splice(idx, 1);
                if (parent[key].length === 0) {
                    delete parent[key];
                }
            }
        }
    }

    //#endregion
}
