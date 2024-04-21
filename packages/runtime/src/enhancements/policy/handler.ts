/* eslint-disable @typescript-eslint/no-explicit-any */

import { lowerCaseFirst } from 'lower-case-first';
import invariant from 'tiny-invariant';
import { upperCaseFirst } from 'upper-case-first';
import { fromZodError } from 'zod-validation-error';
import type { WithPolicyOptions } from '.';
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
import { AuthUser, DbClientContract, DbOperations, PolicyOperationKind } from '../../types';
import { PrismaProxyHandler } from '../proxy';
import type { PolicyDef, ZodSchemas } from '../types';
import { formatObject, prismaClientValidationError } from '../utils';
import { Logger } from './logger';
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
    private readonly utils: PolicyUtil;
    private readonly model: string;

    private readonly DEFAULT_TX_MAXWAIT = 100000;
    private readonly DEFAULT_TX_TIMEOUT = 100000;

    constructor(
        private readonly prisma: DbClient,
        private readonly policy: PolicyDef,
        private readonly modelMeta: ModelMeta,
        private readonly zodSchemas: ZodSchemas | undefined,
        model: string,
        private readonly user: AuthUser | undefined,
        private readonly options: WithPolicyOptions | undefined
    ) {
        this.logger = new Logger(prisma);
        this.utils = new PolicyUtil(
            this.prisma,
            this.options,
            this.modelMeta,
            this.policy,
            this.zodSchemas,
            this.user,
            this.shouldLogQuery
        );
        this.model = lowerCaseFirst(model);
    }

    private get modelClient() {
        return this.prisma[this.model];
    }

    //#region Find

    // find operations behaves as if the entities that don't match access policies don't exist

    findUnique(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, this.options, 'where field is required in query argument');
        }
        return this.findWithFluentCallStubs(args, 'findUnique', false, () => null);
    }

    findUniqueOrThrow(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, this.options, 'where field is required in query argument');
        }
        return this.findWithFluentCallStubs(args, 'findUniqueOrThrow', true, () => {
            throw this.utils.notFound(this.model);
        });
    }

    findFirst(args?: any) {
        return this.findWithFluentCallStubs(args, 'findFirst', false, () => null);
    }

    findFirstOrThrow(args: any) {
        return this.findWithFluentCallStubs(args, 'findFirstOrThrow', true, () => {
            throw this.utils.notFound(this.model);
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
        const _args = this.utils.clone(args);
        if (!this.utils.injectForRead(this.prisma, this.model, _args)) {
            return handleRejection();
        }

        this.utils.injectReadCheckSelect(this.model, _args);

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`${actionName}\` ${this.model}:\n${formatObject(_args)}`);
        }

        return new Promise((resolve, reject) => {
            this.modelClient[actionName](_args).then(
                (value: any) => {
                    this.utils.postProcessForRead(value, this.model, origArgs);
                    resolve(value);
                },
                (err: any) => reject(err)
            );
        });
    }

    // returns a fluent API call function
    private fluentCall(filter: any, fieldInfo: FieldInfo, rootPromise?: Promise<any>) {
        return (args: any) => {
            args = this.utils.clone(args);

            // combine the parent filter with the current one
            const backLinkField = this.requireBackLink(fieldInfo);
            const condition = backLinkField.isArray
                ? { [backLinkField.name]: { some: filter } }
                : { [backLinkField.name]: { is: filter } };
            args.where = this.utils.and(args.where, condition);

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
        const fields = this.utils.getModelFields(model);
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
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, this.options, 'data field is required in query argument');
        }

        this.utils.tryReject(this.prisma, this.model, 'create');

        const origArgs = args;
        args = this.utils.clone(args);

        // static input policy check for top-level create data
        const inputCheck = this.utils.checkInputGuard(this.model, args.data, 'create');
        if (inputCheck === false) {
            throw this.utils.deniedByPolicy(this.model, 'create', undefined, CrudFailureReason.ACCESS_POLICY_VIOLATION);
        }

        const hasNestedCreateOrConnect = await this.hasNestedCreateOrConnect(args);

        const { result, error } = await this.transaction(async (tx) => {
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

        if (error) {
            throw error;
        } else {
            return result;
        }
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
                const validateResult = this.validateCreateInputSchema(model, args);
                if (validateResult !== args) {
                    this.utils.replace(args, validateResult);
                }
                pushIdFields(model, context);
            },

            createMany: async (model, args, context) => {
                enumerate(args.data).forEach((item) => {
                    const r = this.validateCreateInputSchema(model, item);
                    if (r !== item) {
                        this.utils.replace(item, r);
                    }
                });
                pushIdFields(model, context);
            },

            connectOrCreate: async (model, args, context) => {
                if (!args.where) {
                    throw this.utils.validationError(`'where' field is required for connectOrCreate`);
                }

                if (args.create) {
                    args.create = this.validateCreateInputSchema(model, args.create);
                }

                const existing = await this.utils.checkExistence(db, model, args.where);
                if (existing) {
                    // connect case
                    if (context.field?.backLink) {
                        const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                        if (backLinkField?.isRelationOwner) {
                            // the target side of relation owns the relation,
                            // check if it's updatable
                            await this.utils.checkPolicyForUnique(model, args.where, 'update', db, args);
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
                    throw this.utils.validationError(`'connect' field must be an non-empty object`);
                }

                if (context.field?.backLink) {
                    const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                    if (backLinkField?.isRelationOwner) {
                        // check existence
                        await this.utils.checkExistence(db, model, args, true);

                        // the target side of relation owns the relation,
                        // check if it's updatable
                        await this.utils.checkPolicyForUnique(model, args, 'update', db, args);
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
        const ids = this.utils.getEntityIds(model, result);
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
        if (schema && data) {
            const parseResult = schema.safeParse(data);
            if (!parseResult.success) {
                throw this.utils.deniedByPolicy(
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
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, this.options, 'data field is required in query argument');
        }

        this.utils.tryReject(this.prisma, this.model, 'create');

        args = this.utils.clone(args);

        // go through create items, statically check input to determine if post-create
        // check is needed, and also validate zod schema
        let needPostCreateCheck = false;
        for (const item of enumerate(args.data)) {
            const validationResult = this.validateCreateInputSchema(this.model, item);
            if (validationResult !== item) {
                this.utils.replace(item, validationResult);
            }

            const inputCheck = this.utils.checkInputGuard(this.model, item, 'create');
            if (inputCheck === false) {
                // unconditionally deny
                throw this.utils.deniedByPolicy(
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
            return this.transaction(async (tx) => {
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
                    if (await this.hasDuplicatedUniqueConstraint(model, item, undefined, db)) {
                        if (this.shouldLogQuery) {
                            this.logger.info(`[policy] \`createMany\` skipping duplicate ${formatObject(item)}`);
                        }
                        return undefined;
                    }
                }

                if (this.shouldLogQuery) {
                    this.logger.info(`[policy] \`create\` for \`createMany\` ${model}: ${formatObject(item)}`);
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

    private async hasDuplicatedUniqueConstraint(
        model: string,
        createData: any,
        upstreamQuery: any,
        db: Record<string, DbOperations>
    ) {
        // check unique constraint conflicts
        // we can't rely on try/catch/ignore constraint violation error: https://github.com/prisma/prisma/issues/20496
        // TODO: for simple cases we should be able to translate it to an `upsert` with empty `update` payload

        // for each unique constraint, check if the input item has all fields set, and if so, check if
        // an entity already exists, and ignore accordingly

        const uniqueConstraints = this.utils.getUniqueConstraints(model);

        for (const constraint of Object.values(uniqueConstraints)) {
            // the unique filter used to check existence
            const uniqueFilter: any = {};

            // unique constraint fields not covered yet
            const remainingConstraintFields = new Set<string>(constraint.fields);

            // collect constraint fields from the create data
            for (const [k, v] of Object.entries<any>(createData)) {
                if (v === undefined) {
                    continue;
                }

                if (remainingConstraintFields.has(k)) {
                    uniqueFilter[k] = v;
                    remainingConstraintFields.delete(k);
                }
            }

            // collect constraint fields from the upstream query
            if (upstreamQuery) {
                for (const [k, v] of Object.entries<any>(upstreamQuery)) {
                    if (v === undefined) {
                        continue;
                    }

                    if (remainingConstraintFields.has(k)) {
                        uniqueFilter[k] = v;
                        remainingConstraintFields.delete(k);
                        continue;
                    }

                    // check if the upstream query contains a relation field which covers
                    // a foreign key field constraint

                    const fieldInfo = requireField(this.modelMeta, model, k);
                    if (!fieldInfo.isDataModel) {
                        // only care about relation fields
                        continue;
                    }

                    // merge the upstream query into the unique filter
                    uniqueFilter[k] = v;

                    // mark the corresponding foreign key fields as covered
                    const fkMapping = fieldInfo.foreignKeyMapping ?? {};
                    for (const fk of Object.values(fkMapping)) {
                        remainingConstraintFields.delete(fk);
                    }
                }
            }

            if (remainingConstraintFields.size === 0) {
                // all constraint fields set, check existence
                const existing = await this.utils.checkExistence(db, model, uniqueFilter);
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
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, this.options, 'where field is required in query argument');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, this.options, 'data field is required in query argument');
        }

        args = this.utils.clone(args);

        const { result, error } = await this.transaction(async (tx) => {
            // proceed with nested writes and collect post-write checks
            const { result, postWriteChecks } = await this.doUpdate(args, tx);

            // post-write check
            await this.runPostWriteChecks(postWriteChecks, tx);

            // filter the read-back data
            return this.utils.readBack(tx, this.model, 'update', args, result);
        });

        if (error) {
            throw error;
        } else {
            return result;
        }
    }

    private async doUpdate(args: any, db: Record<string, DbOperations>) {
        // collected post-update checks
        const postWriteChecks: PostWriteCheckRecord[] = [];

        // registers a post-update check task
        const _registerPostUpdateCheck = async (
            model: string,
            preUpdateLookupFilter: any,
            postUpdateLookupFilter: any
        ) => {
            // both "post-update" rules and Zod schemas require a post-update check
            if (this.utils.hasAuthGuard(model, 'postUpdate') || this.utils.getZodSchema(model)) {
                // select pre-update field values
                let preValue: any;
                const preValueSelect = this.utils.getPreValueSelect(model);
                if (preValueSelect && Object.keys(preValueSelect).length > 0) {
                    preValue = await db[model].findFirst({ where: preUpdateLookupFilter, select: preValueSelect });
                }
                postWriteChecks.push({
                    model,
                    operation: 'postUpdate',
                    uniqueFilter: postUpdateLookupFilter,
                    preValue,
                });
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
                const unsafe = this.isUnsafeMutate(model, args);

                // handles the connection to upstream entity
                const reversedQuery = this.utils.buildReversedQuery(context, true, unsafe);
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
                            select: this.utils.makeIdSelection(backLinkField.type),
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
            const { postWriteChecks: checks, result } = await this.doCreate(model, { data: createData }, db);
            postWriteChecks.push(...checks);

            return result;
        };

        const _createMany = async (
            model: string,
            args: { data: any; skipDuplicates?: boolean },
            context: NestedWriteVisitorContext
        ) => {
            for (const item of enumerate(args.data)) {
                if (args.skipDuplicates) {
                    // get a reversed query to include fields inherited from upstream mutation,
                    // it'll be merged with the create payload for unique constraint checking
                    const upstreamQuery = this.utils.buildReversedQuery(context);
                    if (await this.hasDuplicatedUniqueConstraint(model, item, upstreamQuery, db)) {
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
                const backLinkField = this.utils.getModelField(model, context.field.backLink);
                if (backLinkField.isRelationOwner) {
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
                    await this.utils.checkPolicyForUnique(model, args, 'update', db, checkArgs);

                    // register post-update check
                    await _registerPostUpdateCheck(model, args, args);
                }
            }
        };

        // visit nested writes
        const visitor = new NestedWriteVisitor(this.modelMeta, {
            update: async (model, args, context) => {
                // build a unique query including upstream conditions
                const uniqueFilter = this.utils.buildReversedQuery(context);

                // handle not-found
                const existing = await this.utils.checkExistence(db, model, uniqueFilter, true);

                // check if the update actually writes to this model
                let thisModelUpdate = false;
                const updatePayload = (args as any).data ?? args;

                const validatedPayload = this.validateUpdateInputSchema(model, updatePayload);
                if (validatedPayload !== updatePayload) {
                    this.utils.replace(updatePayload, validatedPayload);
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
                    this.utils.tryReject(db, this.model, 'update');

                    // check pre-update guard
                    await this.utils.checkPolicyForUnique(model, uniqueFilter, 'update', db, args);

                    // handle the case where id fields are updated
                    const _args: any = args;
                    const updatePayload = _args.data && typeof _args.data === 'object' ? _args.data : _args;
                    const postUpdateIds = this.calculatePostUpdateIds(model, existing, updatePayload);

                    // register post-update check
                    await _registerPostUpdateCheck(model, existing, postUpdateIds);
                }
            },

            updateMany: async (model, args, context) => {
                // prepare for post-update check
                if (this.utils.hasAuthGuard(model, 'postUpdate') || this.utils.getZodSchema(model)) {
                    let select = this.utils.makeIdSelection(model);
                    const preValueSelect = this.utils.getPreValueSelect(model);
                    if (preValueSelect) {
                        select = { ...select, ...preValueSelect };
                    }
                    const reversedQuery = this.utils.buildReversedQuery(context);
                    const currentSetQuery = { select, where: reversedQuery };
                    this.utils.injectAuthGuardAsWhere(db, currentSetQuery, model, 'read');

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

                const updateGuard = this.utils.getAuthGuard(db, model, 'update');
                if (this.utils.isTrue(updateGuard) || this.utils.isFalse(updateGuard)) {
                    // injects simple auth guard into where clause
                    this.utils.injectAuthGuardAsWhere(db, args, model, 'update');
                } else {
                    // we have to process `updateMany` separately because the guard may contain
                    // filters using relation fields which are not allowed in nested `updateMany`
                    const reversedQuery = this.utils.buildReversedQuery(context);
                    const updateWhere = this.utils.and(reversedQuery, updateGuard);
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
                const uniqueFilter = this.utils.buildReversedQuery(context);

                // branch based on if the update target exists
                const existing = await this.utils.checkExistence(db, model, uniqueFilter);
                if (existing) {
                    // update case

                    // check pre-update guard
                    await this.utils.checkPolicyForUnique(model, existing, 'update', db, args);

                    // handle the case where id fields are updated
                    const postUpdateIds = this.calculatePostUpdateIds(model, existing, args.update);

                    // register post-update check
                    await _registerPostUpdateCheck(model, existing, postUpdateIds);

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
                const existing = await this.utils.checkExistence(db, model, args.where);
                if (existing) {
                    // connect
                    await _connectDisconnect(model, args.where, context);
                    return true;
                } else {
                    // create
                    const created = await _create(model, args.create, context);

                    const upperContext = context.nestingPath[context.nestingPath.length - 2];
                    if (upperContext?.where && context.field) {
                        // check if the where clause of the upper context references the id
                        // of the connected entity, if so, we need to update it
                        this.overrideForeignKeyFields(upperContext.model, upperContext.where, context.field, created);
                    }

                    // remove the payload from the parent
                    this.removeFromParent(context.parent, 'connectOrCreate', args);

                    return false;
                }
            },

            disconnect: async (model, args, context) => _connectDisconnect(model, args, context),

            set: async (model, args, context) => {
                // find the set of items to be replaced
                const reversedQuery = this.utils.buildReversedQuery(context);
                const findCurrSetArgs = {
                    select: this.utils.makeIdSelection(model),
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
                const uniqueFilter = this.utils.buildReversedQuery(context);

                // handle not-found
                await this.utils.checkExistence(db, model, uniqueFilter, true);

                // check delete guard
                await this.utils.checkPolicyForUnique(model, uniqueFilter, 'delete', db, args);
            },

            deleteMany: async (model, args, context) => {
                const guard = await this.utils.getAuthGuard(db, model, 'delete');
                if (this.utils.isTrue(guard) || this.utils.isFalse(guard)) {
                    // inject simple auth guard
                    context.parent.deleteMany = this.utils.and(args, guard);
                } else {
                    // we have to process `deleteMany` separately because the guard may contain
                    // filters using relation fields which are not allowed in nested `deleteMany`
                    const reversedQuery = this.utils.buildReversedQuery(context);
                    const deleteWhere = this.utils.and(reversedQuery, guard);
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
            select: this.utils.makeIdSelection(this.model),
        });

        return { result, postWriteChecks };
    }

    // calculate id fields used for post-update check given an update payload
    private calculatePostUpdateIds(_model: string, currentIds: any, updatePayload: any) {
        const result = this.utils.clone(currentIds);
        for (const key of Object.keys(currentIds)) {
            const updateValue = updatePayload[key];
            if (typeof updateValue === 'string' || typeof updateValue === 'number' || typeof updateValue === 'bigint') {
                result[key] = updateValue;
            }
        }
        return result;
    }

    // updates foreign key fields inside `payload` based on relation id fields in `newIds`
    private overrideForeignKeyFields(
        model: string,
        payload: any,
        relation: FieldInfo,
        newIds: Record<string, unknown>
    ) {
        if (!relation.foreignKeyMapping || Object.keys(relation.foreignKeyMapping).length === 0) {
            return;
        }

        // override foreign key values
        for (const [id, fk] of Object.entries(relation.foreignKeyMapping)) {
            if (payload[fk] !== undefined && newIds[id] !== undefined) {
                payload[fk] = newIds[id];
            }
        }

        // deal with compound id fields
        const uniqueConstraints = this.utils.getUniqueConstraints(model);
        for (const [name, constraint] of Object.entries(uniqueConstraints)) {
            if (constraint.fields.length > 1) {
                const target = payload[name];
                if (target) {
                    for (const [id, fk] of Object.entries(relation.foreignKeyMapping)) {
                        if (target[fk] !== undefined && newIds[id] !== undefined) {
                            target[fk] = newIds[id];
                        }
                    }
                }
            }
        }
    }

    // Validates the given update payload against Zod schema if any
    private validateUpdateInputSchema(model: string, data: any) {
        const schema = this.utils.getZodSchema(model, 'update');
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
                throw this.utils.deniedByPolicy(
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

    private isUnsafeMutate(model: string, args: any) {
        if (!args) {
            return false;
        }
        for (const k of Object.keys(args)) {
            const field = resolveField(this.modelMeta, model, k);
            if (this.isAutoIncrementIdField(field) || field?.isForeignKey) {
                return true;
            }
        }
        return false;
    }

    private isAutoIncrementIdField(field: FieldInfo) {
        return field.isId && field.isAutoIncrement;
    }

    async updateMany(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(this.prisma, this.options, 'data field is required in query argument');
        }

        this.utils.tryReject(this.prisma, this.model, 'update');

        args = this.utils.clone(args);
        this.utils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'update');

        args.data = this.validateUpdateInputSchema(this.model, args.data);

        if (this.utils.hasAuthGuard(this.model, 'postUpdate') || this.utils.getZodSchema(this.model)) {
            // use a transaction to do post-update checks
            const postWriteChecks: PostWriteCheckRecord[] = [];
            return this.transaction(async (tx) => {
                // collect pre-update values
                let select = this.utils.makeIdSelection(this.model);
                const preValueSelect = this.utils.getPreValueSelect(this.model);
                if (preValueSelect) {
                    select = { ...select, ...preValueSelect };
                }
                const currentSetQuery = { select, where: args.where };
                this.utils.injectAuthGuardAsWhere(tx, currentSetQuery, this.model, 'read');

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
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, this.options, 'where field is required in query argument');
        }
        if (!args.create) {
            throw prismaClientValidationError(this.prisma, this.options, 'create field is required in query argument');
        }
        if (!args.update) {
            throw prismaClientValidationError(this.prisma, this.options, 'update field is required in query argument');
        }

        this.utils.tryReject(this.prisma, this.model, 'create');
        this.utils.tryReject(this.prisma, this.model, 'update');

        args = this.utils.clone(args);

        // We can call the native "upsert" because we can't tell if an entity was created or updated
        // for doing post-write check accordingly. Instead, decompose it into create or update.

        const { result, error } = await this.transaction(async (tx) => {
            const { where, create, update, ...rest } = args;
            const existing = await this.utils.checkExistence(tx, this.model, where);

            if (existing) {
                // update case
                const { result, postWriteChecks } = await this.doUpdate(
                    {
                        where: this.utils.composeCompoundUniqueField(this.model, existing),
                        data: update,
                        ...rest,
                    },
                    tx
                );
                await this.runPostWriteChecks(postWriteChecks, tx);
                return this.utils.readBack(tx, this.model, 'update', args, result);
            } else {
                // create case
                const { result, postWriteChecks } = await this.doCreate(this.model, { data: create, ...rest }, tx);
                await this.runPostWriteChecks(postWriteChecks, tx);
                return this.utils.readBack(tx, this.model, 'create', args, result);
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
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(this.prisma, this.options, 'where field is required in query argument');
        }

        this.utils.tryReject(this.prisma, this.model, 'delete');

        const { result, error } = await this.transaction(async (tx) => {
            // do a read-back before delete
            const r = await this.utils.readBack(tx, this.model, 'delete', args, args.where);
            const error = r.error;
            const read = r.result;

            // check existence
            await this.utils.checkExistence(tx, this.model, args.where, true);

            // inject delete guard
            await this.utils.checkPolicyForUnique(this.model, args.where, 'delete', tx, args);

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
        this.utils.tryReject(this.prisma, this.model, 'delete');

        // inject policy conditions
        args = args ?? {};
        this.utils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'delete');

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
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }

        args = this.utils.clone(args);

        // inject policy conditions
        this.utils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`aggregate\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.aggregate(args);
    }

    async groupBy(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options, 'query argument is required');
        }

        args = this.utils.clone(args);

        // inject policy conditions
        this.utils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`groupBy\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.groupBy(args);
    }

    async count(args: any) {
        // inject policy conditions
        args = args ? this.utils.clone(args) : {};
        this.utils.injectAuthGuardAsWhere(this.prisma, args, this.model, 'read');

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] \`count\` ${this.model}:\n${formatObject(args)}`);
        }
        return this.modelClient.count(args);
    }

    //#endregion

    //#region Subscribe (Prisma Pulse)

    async subscribe(args: any) {
        const readGuard = this.utils.getAuthGuard(this.prisma, this.model, 'read');
        if (this.utils.isTrue(readGuard)) {
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
                throw prismaClientValidationError(this.prisma, this.options, 'argument must be an object');
            }
            if (Object.keys(args).length === 0) {
                // include all
                args = { create: {}, update: {}, delete: {} };
            } else {
                args = this.utils.clone(args);
            }
        }

        // inject into subscribe conditions

        if (args.create) {
            args.create.after = this.utils.and(args.create.after, readGuard);
        }

        if (args.update) {
            args.update.after = this.utils.and(args.update.after, readGuard);
        }

        if (args.delete) {
            args.delete.before = this.utils.and(args.delete.before, readGuard);
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

    private transaction(action: (tx: Record<string, DbOperations>) => Promise<any>) {
        if (this.prisma['$transaction']) {
            const txOptions: any = { maxWait: this.DEFAULT_TX_MAXWAIT, timeout: this.DEFAULT_TX_TIMEOUT };
            if (this.options?.transactionMaxWait !== undefined) {
                txOptions.maxWait = this.options.transactionMaxWait;
            }
            if (this.options?.transactionTimeout !== undefined) {
                txOptions.timeout = this.options.transactionTimeout;
            }
            if (this.options?.transactionIsolationLevel !== undefined) {
                txOptions.isolationLevel = this.options.transactionIsolationLevel;
            }
            return this.prisma.$transaction((tx) => action(tx), txOptions);
        } else {
            // already in transaction, don't nest
            return action(this.prisma);
        }
    }

    private async runPostWriteChecks(postWriteChecks: PostWriteCheckRecord[], db: Record<string, DbOperations>) {
        await Promise.all(
            postWriteChecks.map(async ({ model, operation, uniqueFilter, preValue }) =>
                this.utils.checkPolicyForUnique(model, uniqueFilter, operation, db, undefined, preValue)
            )
        );
    }

    private makeHandler(model: string) {
        return new PolicyProxyHandler(
            this.prisma,
            this.policy,
            this.modelMeta,
            this.zodSchemas,
            model,
            this.user,
            this.options
        );
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
