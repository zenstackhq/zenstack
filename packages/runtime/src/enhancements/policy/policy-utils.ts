/* eslint-disable @typescript-eslint/no-explicit-any */

import { createId } from '@paralleldrive/cuid2';
import deepcopy from 'deepcopy';
import { lowerCaseFirst } from 'lower-case-first';
import pluralize from 'pluralize';
import { fromZodError } from 'zod-validation-error';
import { AUXILIARY_FIELDS, CrudFailureReason, GUARD_FIELD_NAME, TRANSACTION_FIELD_NAME } from '../../constants';
import {
    AuthUser,
    DbClientContract,
    DbOperations,
    FieldInfo,
    PolicyOperationKind,
    PrismaWriteActionType,
} from '../../types';
import { getVersion } from '../../version';
import { resolveField } from '../model-meta';
import { NestedWriteVisitor, VisitorContext } from '../nested-write-vistor';
import { ModelMeta, PolicyDef, PolicyFunc } from '../types';
import {
    enumerate,
    getIdFields,
    getModelFields,
    prismaClientKnownRequestError,
    prismaClientUnknownRequestError,
} from '../utils';
import { Logger } from './logger';

/**
 * Access policy enforcement utilities
 */
export class PolicyUtil {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    private readonly logger: Logger;

    constructor(
        private readonly db: DbClientContract,
        private readonly modelMeta: ModelMeta,
        private readonly policy: PolicyDef,
        private readonly user?: AuthUser
    ) {
        this.logger = new Logger(db);
    }

    /**
     * Creates a conjunction of a list of query conditions.
     */
    and(...conditions: (boolean | object)[]): any {
        if (conditions.includes(false)) {
            // always false
            return { [GUARD_FIELD_NAME]: false };
        }

        const filtered = conditions.filter(
            (c): c is object => typeof c === 'object' && !!c && Object.keys(c).length > 0
        );
        if (filtered.length === 0) {
            return undefined;
        } else if (filtered.length === 1) {
            return filtered[0];
        } else {
            return { AND: filtered };
        }
    }

    /**
     * Creates a disjunction of a list of query conditions.
     */
    or(...conditions: (boolean | object)[]): any {
        if (conditions.includes(true)) {
            // always true
            return { [GUARD_FIELD_NAME]: true };
        }

        const filtered = conditions.filter((c): c is object => typeof c === 'object' && !!c);
        if (filtered.length === 0) {
            return undefined;
        } else if (filtered.length === 1) {
            return filtered[0];
        } else {
            return { OR: filtered };
        }
    }

    /**
     * Creates a negation of a query condition.
     */
    not(condition: object | boolean): any {
        if (typeof condition === 'boolean') {
            return !condition;
        } else {
            return { NOT: condition };
        }
    }

    /**
     * Gets pregenerated authorization guard object for a given model and operation.
     *
     * @returns true if operation is unconditionally allowed, false if unconditionally denied,
     * otherwise returns a guard object
     */
    async getAuthGuard(model: string, operation: PolicyOperationKind, preValue?: any): Promise<boolean | object> {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }

        const provider: PolicyFunc | boolean | undefined = guard[operation];
        if (typeof provider === 'boolean') {
            return provider;
        }

        if (!provider) {
            throw this.unknownError(`zenstack: unable to load authorization guard for ${model}`);
        }
        return provider({ user: this.user, preValue });
    }

    private async getPreValueSelect(model: string): Promise<object | undefined> {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }
        return guard.preValueSelect;
    }

    private async getModelSchema(model: string) {
        return this.policy.schema[lowerCaseFirst(model)];
    }

    /**
     * Injects model auth guard as where clause.
     */
    async injectAuthGuard(args: any, model: string, operation: PolicyOperationKind) {
        if (args.where) {
            // inject into relation fields:
            //   to-many: some/none/every
            //   to-one: direct-conditions/is/isNot
            await this.injectGuardForFields(model, args.where, operation);
        }

        const guard = await this.getAuthGuard(model, operation);
        args.where = this.and(args.where, guard);
    }

    async injectGuardForFields(model: string, payload: any, operation: PolicyOperationKind) {
        for (const [field, subPayload] of Object.entries<any>(payload)) {
            if (!subPayload) {
                continue;
            }

            const fieldInfo = await resolveField(this.modelMeta, model, field);
            if (!fieldInfo || !fieldInfo.isDataModel) {
                continue;
            }

            if (fieldInfo.isArray) {
                await this.injectGuardForToManyField(fieldInfo, subPayload, operation);
            } else {
                await this.injectGuardForToOneField(fieldInfo, subPayload, operation);
            }
        }
    }

    async injectGuardForToManyField(
        fieldInfo: FieldInfo,
        payload: { some?: any; every?: any; none?: any },
        operation: PolicyOperationKind
    ) {
        const guard = await this.getAuthGuard(fieldInfo.type, operation);
        if (payload.some) {
            await this.injectGuardForFields(fieldInfo.type, payload.some, operation);
            // turn "some" into: { some: { AND: [guard, payload.some] } }
            payload.some = this.and(payload.some, guard);
        }
        if (payload.none) {
            await this.injectGuardForFields(fieldInfo.type, payload.none, operation);
            // turn none into: { none: { AND: [guard, payload.none] } }
            payload.none = this.and(payload.none, guard);
        }
        if (
            payload.every &&
            typeof payload.every === 'object' &&
            // ignore empty every clause
            Object.keys(payload.every).length > 0
        ) {
            await this.injectGuardForFields(fieldInfo.type, payload.every, operation);

            // turn "every" into: { none: { AND: [guard, { NOT: payload.every }] } }
            if (!payload.none) {
                payload.none = {};
            }
            payload.none = this.and(payload.none, guard, this.not(payload.every));
            delete payload.every;
        }
    }

    async injectGuardForToOneField(
        fieldInfo: FieldInfo,
        payload: { is?: any; isNot?: any } & Record<string, any>,
        operation: PolicyOperationKind
    ) {
        const guard = await this.getAuthGuard(fieldInfo.type, operation);
        if (payload.is || payload.isNot) {
            if (payload.is) {
                await this.injectGuardForFields(fieldInfo.type, payload.is, operation);
                // turn "is" into: { is: { AND: [ originalIs, guard ] }
                payload.is = this.and(payload.is, guard);
            }
            if (payload.isNot) {
                await this.injectGuardForFields(fieldInfo.type, payload.isNot, operation);
                // turn "isNot" into: { isNot: { AND: [ originalIsNot, { NOT: guard } ] } }
                payload.isNot = this.and(payload.isNot, this.not(guard));
                delete payload.isNot;
            }
        } else {
            await this.injectGuardForFields(fieldInfo.type, payload, operation);
            // turn direct conditions into: { is: { AND: [ originalConditions, guard ] } }
            const combined = this.and(deepcopy(payload), guard);
            Object.keys(payload).forEach((key) => delete payload[key]);
            payload.is = combined;
        }
    }

    /**
     * Read model entities w.r.t the given query args. The result list
     * are guaranteed to fully satisfy 'read' policy rules recursively.
     *
     * For to-many relations involved, items not satisfying policy are
     * silently trimmed. For to-one relation, if relation data fails policy
     * an error is thrown.
     */
    async readWithCheck(model: string, args: any): Promise<unknown[]> {
        args = this.clone(args);

        if (args.where) {
            // query args will be used with findMany, so we need to
            // translate unique constraint filters into a flat filter
            // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
            await this.flattenGeneratedUniqueField(model, args.where);
        }

        await this.injectAuthGuard(args, model, 'read');

        // recursively inject read guard conditions into the query args
        await this.injectNestedReadConditions(model, args);

        // DEBUG
        // this.logger.info(`Reading with validation for ${model}: ${formatObject(args)}`);

        const result: any[] = await this.db[model].findMany(args);

        await this.postProcessForRead(result, model, args, 'read');

        return result;
    }

    // flatten unique constraint filters
    async flattenGeneratedUniqueField(model: string, args: any) {
        // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
        const uniqueConstraints = this.modelMeta.uniqueConstraints?.[lowerCaseFirst(model)];
        let flattened = false;
        if (uniqueConstraints && Object.keys(uniqueConstraints).length > 0) {
            for (const [field, value] of Object.entries<any>(args)) {
                if (uniqueConstraints[field] && typeof value === 'object') {
                    for (const [f, v] of Object.entries(value)) {
                        args[f] = v;
                    }
                    delete args[field];
                    flattened = true;
                }
            }
        }

        if (flattened) {
            // DEBUG
            // this.logger.info(`Filter flattened: ${JSON.stringify(args)}`);
        }
    }

    private async injectNestedReadConditions(model: string, args: any) {
        const injectTarget = args.select ?? args.include;
        if (!injectTarget) {
            return;
        }

        const idFields = this.getIdFields(model);
        for (const field of getModelFields(injectTarget)) {
            const fieldInfo = resolveField(this.modelMeta, model, field);
            if (!fieldInfo || !fieldInfo.isDataModel) {
                // only care about relation fields
                continue;
            }

            if (fieldInfo.isArray) {
                if (typeof injectTarget[field] !== 'object') {
                    injectTarget[field] = {};
                }
                // inject extra condition for to-many relation

                await this.injectAuthGuard(injectTarget[field], fieldInfo.type, 'read');
            } else {
                // there's no way of injecting condition for to-one relation, so if there's
                // "select" clause we make sure 'id' fields are selected and check them against
                // query result; nothing needs to be done for "include" clause because all
                // fields are already selected
                if (injectTarget[field]?.select) {
                    for (const idField of idFields) {
                        if (injectTarget[field].select[idField.name] !== true) {
                            injectTarget[field].select[idField.name] = true;
                        }
                    }
                }
            }

            // recurse
            await this.injectNestedReadConditions(fieldInfo.type, injectTarget[field]);
        }
    }

    /**
     * Post processing checks for read model entities. Validates to-one relations
     * (which can't be trimmed at query time) and removes fields that should be
     * omitted.
     */
    async postProcessForRead(data: any, model: string, args: any, operation: PolicyOperationKind) {
        for (const entityData of enumerate(data)) {
            if (typeof entityData !== 'object' || !entityData) {
                continue;
            }

            // strip auxiliary fields
            for (const auxField of AUXILIARY_FIELDS) {
                if (auxField in entityData) {
                    delete entityData[auxField];
                }
            }

            const injectTarget = args.select ?? args.include;
            if (!injectTarget) {
                continue;
            }

            // recurse into nested entities
            for (const field of Object.keys(injectTarget)) {
                const fieldData = entityData[field];
                if (typeof fieldData !== 'object' || !fieldData) {
                    continue;
                }

                const fieldInfo = resolveField(this.modelMeta, model, field);
                if (fieldInfo) {
                    if (fieldInfo.isDataModel && !fieldInfo.isArray) {
                        // to-one relation data cannot be trimmed by injected guards, we have to
                        // post-check them
                        const ids = this.getEntityIds(fieldInfo.type, fieldData);

                        if (Object.keys(ids).length !== 0) {
                            // DEBUG
                            // this.logger.info(`Validating read of to-one relation: ${fieldInfo.type}#${formatObject(ids)}`);
                            await this.checkPolicyForFilter(fieldInfo.type, ids, operation, this.db);
                        }
                    }

                    // recurse
                    await this.postProcessForRead(fieldData, fieldInfo.type, injectTarget[field], operation);
                }
            }
        }
    }

    /**
     * Process Prisma write actions.
     */
    async processWrite(
        model: string,
        action: PrismaWriteActionType,
        args: any,
        writeAction: (dbOps: DbOperations, writeArgs: any) => Promise<unknown>
    ) {
        // record model types for which new entities are created
        // so we can post-check if they satisfy 'create' policies
        const createdModels = new Set<string>();

        // record model entities that are updated, together with their
        // values before update, so we can post-check if they satisfy
        //     model => { ids, entity value }
        const updatedModels = new Map<string, Array<{ ids: Record<string, unknown>; value: any }>>();

        function addUpdatedEntity(model: string, ids: Record<string, unknown>, entity: any) {
            let modelEntities = updatedModels.get(model);
            if (!modelEntities) {
                modelEntities = [];
                updatedModels.set(model, modelEntities);
            }
            modelEntities.push({ ids, value: entity });
        }

        const idFields = this.getIdFields(model);
        if (args.select) {
            // make sure id fields are selected, we need it to
            // read back the updated entity
            for (const idField of idFields) {
                if (!args.select[idField.name]) {
                    args.select[idField.name] = true;
                }
            }
        }

        // use a transaction to conduct write, so in case any create or nested create
        // fails access policies, we can roll back the entire operation
        const transactionId = createId();

        // args processor for create
        const processCreate = async (model: string, args: any) => {
            const guard = await this.getAuthGuard(model, 'create');
            const schema = await this.getModelSchema(model);
            if (guard === false) {
                throw this.deniedByPolicy(model, 'create');
            } else if (guard !== true || schema) {
                // mark the create with a transaction tag so we can check them later
                args[TRANSACTION_FIELD_NAME] = `${transactionId}:create`;
                createdModels.add(model);
            }
        };

        // build a reversed query for fetching entities affected by nested updates
        const buildReversedQuery = async (context: VisitorContext) => {
            let result, currQuery: any;
            let currField: FieldInfo | undefined;

            for (let i = context.nestingPath.length - 1; i >= 0; i--) {
                const { field, where, unique } = context.nestingPath[i];

                if (!result) {
                    // first segment (bottom), just use its where clause
                    result = currQuery = { ...where };
                    currField = field;
                } else {
                    if (!currField) {
                        throw this.unknownError(`missing field in nested path`);
                    }
                    if (!currField.backLink) {
                        throw this.unknownError(`field ${currField.type}.${currField.name} doesn't have a backLink`);
                    }
                    currQuery[currField.backLink] = { ...where };
                    currQuery = currQuery[currField.backLink];
                    currField = field;
                }

                if (unique) {
                    // hit a unique filter, no need to traverse further up
                    break;
                }
            }
            return result;
        };

        // args processor for update/upsert
        const processUpdate = async (model: string, where: any, context: VisitorContext) => {
            const preGuard = await this.getAuthGuard(model, 'update');
            if (preGuard === false) {
                throw this.deniedByPolicy(model, 'update');
            } else if (preGuard !== true) {
                if (this.isToOneRelation(context.field)) {
                    // To-one relation field is complicated because there's no way to
                    // filter it during update (args doesn't carry a 'where' clause).
                    //
                    // We need to recursively walk up its hierarcy in the query args
                    // to construct a reversed query to identify the nested entity
                    // under update, and then check if it satisfies policy.
                    //
                    // E.g.:
                    // A - B - C
                    //
                    // update A with:
                    // {
                    //   where: { id: 'aId' },
                    //   data: {
                    //     b: {
                    //       c: { value: 1 }
                    //     }
                    //   }
                    // }
                    //
                    // To check if the update to 'c' field is permitted, we
                    // reverse the query stack into a filter for C model, like:
                    // {
                    //   where: {
                    //     b: { a: { id: 'aId' } }
                    //   }
                    // }
                    // , and with this we can filter out the C entity that's going
                    // to be nestedly updated, and check if it's allowed.
                    //
                    // The same logic applies to nested delete.

                    const subQuery = await buildReversedQuery(context);
                    await this.checkPolicyForFilter(model, subQuery, 'update', this.db);
                } else {
                    if (!where) {
                        throw this.unknownError(`Missing 'where' parameter`);
                    }
                    await this.checkPolicyForFilter(model, where, 'update', this.db);
                }
            }

            await preparePostUpdateCheck(model, context);
        };

        // args processor for updateMany
        const processUpdateMany = async (model: string, args: any, context: VisitorContext) => {
            const guard = await this.getAuthGuard(model, 'update');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'update');
            } else if (guard !== true) {
                // inject policy filter
                await this.injectAuthGuard(args, model, 'update');
            }

            await preparePostUpdateCheck(model, context);
        };

        // for models with post-update rules, we need to read and store
        // entity values before the update for post-update check
        const preparePostUpdateCheck = async (model: string, context: VisitorContext) => {
            const postGuard = await this.getAuthGuard(model, 'postUpdate');
            const schema = await this.getModelSchema(model);

            // post-update check is needed if there's post-update rule or validation schema
            if (postGuard !== true || schema) {
                // fetch preValue selection (analyzed from the post-update rules)
                const preValueSelect = await this.getPreValueSelect(model);
                const filter = await buildReversedQuery(context);

                // query args will be used with findMany, so we need to
                // translate unique constraint filters into a flat filter
                // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
                await this.flattenGeneratedUniqueField(model, filter);

                const idFields = this.getIdFields(model);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const select: any = { ...preValueSelect };
                for (const idField of idFields) {
                    select[idField.name] = true;
                }

                const query = { where: filter, select };
                // DEBUG
                // this.logger.info(`fetching pre-update entities for ${model}: ${formatObject(query)})}`);

                const entities = await this.db[model].findMany(query);
                entities.forEach((entity) => {
                    addUpdatedEntity(model, this.getEntityIds(model, entity), entity);
                });
            }
        };

        // args processor for delete
        const processDelete = async (model: string, args: any, context: VisitorContext) => {
            const guard = await this.getAuthGuard(model, 'delete');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'delete');
            } else if (guard !== true) {
                if (this.isToOneRelation(context.field)) {
                    // see comments in processUpdate
                    const subQuery = await buildReversedQuery(context);
                    await this.checkPolicyForFilter(model, subQuery, 'delete', this.db);
                } else {
                    await this.checkPolicyForFilter(model, args, 'delete', this.db);
                }
            }
        };

        // process relation updates: connect, connectOrCreate, and disconnect
        const processRelationUpdate = async (model: string, args: any, context: VisitorContext) => {
            if (context.field?.backLink) {
                // fetch the backlink field of the model being connected
                const backLinkField = resolveField(this.modelMeta, model, context.field.backLink);
                if (backLinkField.isRelationOwner) {
                    // the target side of relation owns the relation,
                    // mark it as updated
                    await processUpdate(model, args, context);
                }
            }
        };

        // use a visitor to process args before conducting the write action
        const visitor = new NestedWriteVisitor(this.modelMeta, {
            create: async (model, args) => {
                await processCreate(model, args);
            },

            connectOrCreate: async (model, args, context) => {
                if (args.create) {
                    await processCreate(model, args.create);
                }
                if (args.where) {
                    await processRelationUpdate(model, args.where, context);
                }
            },

            connect: async (model, args, context) => {
                await processRelationUpdate(model, args, context);
            },

            disconnect: async (model, args, context) => {
                await processRelationUpdate(model, args, context);
            },

            update: async (model, args, context) => {
                await processUpdate(model, args.where, context);
            },

            updateMany: async (model, args, context) => {
                await processUpdateMany(model, args, context);
            },

            upsert: async (model, args, context) => {
                if (args.create) {
                    await processCreate(model, args.create);
                }

                if (args.update) {
                    await processUpdate(model, args.where, context);
                }
            },

            delete: async (model, args, context) => {
                await processDelete(model, args, context);
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            deleteMany: async (model, args, _context) => {
                const guard = await this.getAuthGuard(model, 'delete');
                if (guard === false) {
                    throw this.deniedByPolicy(model, 'delete');
                } else if (guard !== true) {
                    args.where = this.and(args.where, guard);
                }
            },
        });

        await visitor.visit(model, action, args);

        if (createdModels.size === 0 && updatedModels.size === 0) {
            // no post-check needed, we can proceed with the write without transaction
            return await writeAction(this.db[model], args);
        } else {
            return await this.transaction(this.db, async (tx) => {
                // proceed with the update (with args processed)
                const result = await writeAction(tx[model], args);

                if (createdModels.size > 0) {
                    // do post-check on created entities
                    await Promise.all(
                        [...createdModels].map((model) =>
                            this.checkPolicyForFilter(
                                model,
                                { [TRANSACTION_FIELD_NAME]: `${transactionId}:create` },
                                'create',
                                tx
                            )
                        )
                    );
                }

                if (updatedModels.size > 0) {
                    // do post-check on updated entities
                    await Promise.all(
                        [...updatedModels.entries()]
                            .map(([model, modelEntities]) =>
                                modelEntities.map(async ({ ids, value: preValue }) =>
                                    this.checkPostUpdate(model, ids, tx, preValue)
                                )
                            )
                            .flat()
                    );
                }

                return result;
            });
        }
    }

    private transaction(db: DbClientContract, action: (tx: Record<string, DbOperations>) => Promise<any>) {
        if (db.__zenstack_tx) {
            // already in transaction, don't nest
            return action(db);
        } else {
            return db.$transaction((tx) => action(tx));
        }
    }

    deniedByPolicy(model: string, operation: PolicyOperationKind, extra?: string, reason?: CrudFailureReason) {
        return prismaClientKnownRequestError(
            this.db,
            `denied by policy: ${model} entities failed '${operation}' check${extra ? ', ' + extra : ''}`,
            { clientVersion: getVersion(), code: 'P2004', meta: { reason } }
        );
    }

    notFound(model: string) {
        return prismaClientKnownRequestError(this.db, `entity not found for model ${model}`, {
            clientVersion: getVersion(),
            code: 'P2025',
        });
    }

    unknownError(message: string) {
        return prismaClientUnknownRequestError(this.db, message, {
            clientVersion: getVersion(),
        });
    }

    /**
     * Given a filter, check if applying access policy filtering will result
     * in data being trimmed, and if so, throw an error.
     */
    async checkPolicyForFilter(
        model: string,
        filter: any,
        operation: PolicyOperationKind,
        db: Record<string, DbOperations>
    ) {
        const guard = await this.getAuthGuard(model, operation);
        const schema = (operation === 'create' || operation === 'update') && (await this.getModelSchema(model));

        if (guard === true && !schema) {
            // unconditionally allowed
            return;
        }

        // DEBUG
        // this.logger.info(`Checking policy for ${model}#${JSON.stringify(filter)} for ${operation}`);

        const queryFilter = deepcopy(filter);

        // query args will be used with findMany, so we need to
        // translate unique constraint filters into a flat filter
        // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
        await this.flattenGeneratedUniqueField(model, queryFilter);

        const count = (await db[model].count({ where: queryFilter })) as number;
        if (count === 0) {
            // there's nothing to filter out
            return;
        }

        if (guard === false) {
            // unconditionally denied
            throw this.deniedByPolicy(model, operation, `${count} ${pluralize('entity', count)} failed policy check`);
        }

        // build a query condition with policy injected
        const guardedQuery = { where: this.and(queryFilter, guard) };

        if (schema) {
            // we've got schemas, so have to fetch entities and validate them
            const entities = await db[model].findMany(guardedQuery);
            if (entities.length < count) {
                // DEBUG
                // this.logger.info(`entity ${model} failed policy check for operation ${operation}`);
                throw this.deniedByPolicy(
                    model,
                    operation,
                    `${count - entities.length} ${pluralize('entity', count - entities.length)} failed policy check`
                );
            }

            // TODO: push down schema check to the database
            const schemaCheckErrors = entities.map((entity) => schema.safeParse(entity)).filter((r) => !r.success);
            if (schemaCheckErrors.length > 0) {
                const error = schemaCheckErrors.map((r) => !r.success && fromZodError(r.error).message).join(', ');
                // DEBUG
                // this.logger.info(`entity ${model} failed schema check for operation ${operation}: ${error}`);
                throw this.deniedByPolicy(model, operation, `entities failed schema check: [${error}]`);
            }
        } else {
            // count entities with policy injected and see if any of them are filtered out
            const guardedCount = (await db[model].count(guardedQuery)) as number;
            if (guardedCount < count) {
                // DEBUG
                // this.logger.info(`entity ${model} failed policy check for operation ${operation}`);
                throw this.deniedByPolicy(
                    model,
                    operation,
                    `${count - guardedCount} ${pluralize('entity', count - guardedCount)} failed policy check`
                );
            }
        }
    }

    private async checkPostUpdate(
        model: string,
        ids: Record<string, unknown>,
        db: Record<string, DbOperations>,
        preValue: any
    ) {
        // DEBUG
        // this.logger.info(`Checking post-update policy for ${model}#${ids}, preValue: ${formatObject(preValue)}`);

        const guard = await this.getAuthGuard(model, 'postUpdate', preValue);

        // build a query condition with policy injected
        const guardedQuery = { where: this.and(ids, guard) };

        // query with policy injected
        const entity = await db[model].findFirst(guardedQuery);

        // see if we get fewer items with policy, if so, reject with an throw
        if (!entity) {
            // DEBUG
            // this.logger.info(`entity ${model} failed policy check for operation postUpdate`);
            throw this.deniedByPolicy(model, 'postUpdate');
        }

        // TODO: push down schema check to the database
        const schema = await this.getModelSchema(model);
        if (schema) {
            const schemaCheckResult = schema.safeParse(entity);
            if (!schemaCheckResult.success) {
                const error = fromZodError(schemaCheckResult.error).message;
                // DEBUG
                // this.logger.info(`entity ${model} failed schema check for operation postUpdate: ${error}`);
                throw this.deniedByPolicy(model, 'postUpdate', `entity failed schema check: ${error}`);
            }
        }
    }

    private isToOneRelation(field: FieldInfo | undefined) {
        return !!field && field.isDataModel && !field.isArray;
    }

    /**
     * Clones an object and makes sure it's not empty.
     */
    clone(value: unknown) {
        return value ? deepcopy(value) : {};
    }

    /**
     * Gets "id" field for a given model.
     */
    getIdFields(model: string) {
        return getIdFields(this.modelMeta, model, true);
    }

    /**
     * Gets id field value from an entity.
     */
    getEntityIds(model: string, entityData: any) {
        const idFields = this.getIdFields(model);
        const result: Record<string, unknown> = {};
        for (const idField of idFields) {
            result[idField.name] = entityData[idField.name];
        }
        return result;
    }
}
