/* eslint-disable @typescript-eslint/no-explicit-any */

import { PrismaClientKnownRequestError, PrismaClientUnknownRequestError } from '@prisma/client/runtime';
import { AUXILIARY_FIELDS, TRANSACTION_FIELD_NAME } from '@zenstackhq/sdk';
import { camelCase } from 'change-case';
import cuid from 'cuid';
import deepcopy from 'deepcopy';
import { fromZodError } from 'zod-validation-error';
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
import { enumerate, formatObject, getModelFields } from '../utils';
import { Logger } from './logger';

/**
 * Access policy enforcement utilities
 */
export class PolicyUtil {
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
            // TODO: custom id field
            return { id: { in: [] } };
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
            return { id: { notIn: [] } };
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
        const guard = this.policy.guard[camelCase(model)];
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
        const guard = this.policy.guard[camelCase(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }
        return guard.preValueSelect;
    }

    private async getModelSchema(model: string) {
        return this.policy.schema[camelCase(model)];
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

        this.logger.info(`Reading with validation for ${model}: ${formatObject(args)}`);
        const result: any[] = await this.db[model].findMany(args);

        await Promise.all(result.map((item) => this.postProcessForRead(item, model, args, 'read')));

        return result;
    }

    // flatten unique constraint filters
    async flattenGeneratedUniqueField(model: string, args: any) {
        // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
        const uniqueConstraints = this.modelMeta.uniqueConstraints?.[camelCase(model)];
        let flattened = false;
        if (uniqueConstraints) {
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
            this.logger.info(`Filter flattened: ${JSON.stringify(args)}`);
        }
    }

    private async injectNestedReadConditions(model: string, args: any) {
        const injectTarget = args.select ?? args.include;
        if (!injectTarget) {
            return;
        }

        const idField = this.getIdField(model);
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
                // there's no way of injecting condition for to-one relation, so we
                // make sure 'id' field is selected and check them against query result
                if (injectTarget[field]?.select && injectTarget[field]?.select?.[idField.name] !== true) {
                    injectTarget[field].select[idField.name] = true;
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
    async postProcessForRead(entityData: any, model: string, args: any, operation: PolicyOperationKind) {
        if (!this.getEntityId(model, entityData)) {
            return;
        }

        // strip auxiliary fields
        for (const auxField of AUXILIARY_FIELDS) {
            if (auxField in entityData) {
                delete entityData[auxField];
            }
        }

        const injectTarget = args.select ?? args.include;
        if (!injectTarget) {
            return;
        }

        // to-one relation data cannot be trimmed by injected guards, we have to
        // post-check them

        for (const field of getModelFields(injectTarget)) {
            const fieldInfo = resolveField(this.modelMeta, model, field);
            if (!fieldInfo || !fieldInfo.isDataModel || fieldInfo.isArray) {
                continue;
            }

            const idField = this.getIdField(fieldInfo.type);
            const relatedEntityId = entityData?.[field]?.[idField.name];

            if (!relatedEntityId) {
                continue;
            }

            this.logger.info(`Validating read of to-one relation: ${fieldInfo.type}#${relatedEntityId}`);

            await this.checkPolicyForFilter(fieldInfo.type, { [idField.name]: relatedEntityId }, operation, this.db);

            // recurse
            await this.postProcessForRead(entityData[field], fieldInfo.type, injectTarget[field], operation);
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
        //     model => id => entity value
        const updatedModels = new Map<string, Map<string, any>>();

        const idField = this.getIdField(model);
        if (args.select && !args.select[idField.name]) {
            // make sure 'id' field is selected, we need it to
            // read back the updated entity
            args.select[idField.name] = true;
        }

        // use a transaction to conduct write, so in case any create or nested create
        // fails access policies, we can roll back the entire operation
        const transactionId = cuid();

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
                const { field, where } = context.nestingPath[i];

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
            }
            return result;
        };

        // args processor for update/upsert
        const processUpdate = async (model: string, args: any, context: VisitorContext) => {
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
                    // non-nested update, check policies directly
                    if (!args.where) {
                        throw this.unknownError(`Missing 'where' in update args`);
                    }
                    await this.checkPolicyForFilter(model, args.where, 'update', this.db);
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
                let modelEntities = updatedModels.get(model);
                if (!modelEntities) {
                    modelEntities = new Map<string, any>();
                    updatedModels.set(model, modelEntities);
                }

                // fetch preValue selection (analyzed from the post-update rules)
                const preValueSelect = await this.getPreValueSelect(model);
                const filter = await buildReversedQuery(context);

                // query args will be used with findMany, so we need to
                // translate unique constraint filters into a flat filter
                // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
                await this.flattenGeneratedUniqueField(model, filter);

                const idField = this.getIdField(model);
                const query = { where: filter, select: { ...preValueSelect, [idField.name]: true } };
                this.logger.info(`fetching pre-update entities for ${model}: ${formatObject(query)})}`);
                const entities = await this.db[model].findMany(query);
                entities.forEach((entity) => modelEntities?.set(this.getEntityId(model, entity), entity));
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

        // use a visitor to process args before conducting the write action
        const visitor = new NestedWriteVisitor(this.modelMeta, {
            create: async (model, args) => {
                for (const oneArgs of enumerate(args)) {
                    await processCreate(model, oneArgs);
                }
            },

            connectOrCreate: async (model, args) => {
                for (const oneArgs of enumerate(args)) {
                    if (oneArgs.create) {
                        await processCreate(model, oneArgs.create);
                    }
                }
            },

            update: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    await processUpdate(model, oneArgs, context);
                }
            },

            updateMany: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    await processUpdateMany(model, oneArgs, context);
                }
            },

            upsert: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    if (oneArgs.create) {
                        await processCreate(model, oneArgs.create);
                    }

                    if (oneArgs.update) {
                        await processUpdate(model, { where: oneArgs.where, data: oneArgs.update }, context);
                    }
                }
            },

            delete: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    await processDelete(model, oneArgs, context);
                }
            },

            deleteMany: async (model, args, context) => {
                const guard = await this.getAuthGuard(model, 'delete');
                if (guard === false) {
                    throw this.deniedByPolicy(model, 'delete');
                } else if (guard !== true) {
                    if (Array.isArray(args)) {
                        context.parent.deleteMany = args.map((oneArgs) => this.and(oneArgs, guard));
                    } else {
                        context.parent.deleteMany = this.and(args, guard);
                    }
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
                                [...modelEntities.entries()].map(async ([id, preValue]) =>
                                    this.checkPostUpdate(model, id, tx, preValue)
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

    deniedByPolicy(model: string, operation: PolicyOperationKind, extra?: string) {
        return new PrismaClientKnownRequestError(
            `denied by policy: ${model} entities failed '${operation}' check${extra ? ', ' + extra : ''}`,
            { clientVersion: getVersion(), code: 'P2004' }
        );
    }

    notFound(model: string) {
        return new PrismaClientKnownRequestError(`entity not found for model ${model}`, {
            clientVersion: getVersion(),
            code: 'P2025',
        });
    }

    unknownError(message: string) {
        return new PrismaClientUnknownRequestError(message, {
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
        this.logger.info(`Checking policy for ${model}#${JSON.stringify(filter)} for ${operation}`);

        const queryFilter = deepcopy(filter);

        // query args will be used with findMany, so we need to
        // translate unique constraint filters into a flat filter
        // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
        await this.flattenGeneratedUniqueField(model, queryFilter);

        const count = (await db[model].count({ where: queryFilter })) as number;
        const guard = await this.getAuthGuard(model, operation);

        // build a query condition with policy injected
        const guardedQuery = { where: this.and(queryFilter, guard) };

        const schema = (operation === 'create' || operation === 'update') && (await this.getModelSchema(model));

        if (schema) {
            // we've got schemas, so have to fetch entities and validate them
            const entities = await db[model].findMany(guardedQuery);
            if (entities.length < count) {
                this.logger.info(`entity ${model} failed policy check for operation ${operation}`);
                throw this.deniedByPolicy(model, operation, `${count - entities.length} entities failed policy check`);
            }

            // TODO: push down schema check to the database
            const schemaCheckErrors = entities.map((entity) => schema.safeParse(entity)).filter((r) => !r.success);
            if (schemaCheckErrors.length > 0) {
                const error = schemaCheckErrors.map((r) => !r.success && fromZodError(r.error).message).join(', ');
                this.logger.info(`entity ${model} failed schema check for operation ${operation}: ${error}`);
                throw this.deniedByPolicy(model, operation, `entities failed schema check: [${error}]`);
            }
        } else {
            // count entities with policy injected and see if any of them are filtered out
            const guardedCount = (await db[model].count(guardedQuery)) as number;
            if (guardedCount < count) {
                this.logger.info(`entity ${model} failed policy check for operation ${operation}`);
                throw this.deniedByPolicy(model, operation, `${count - guardedCount} entities failed policy check`);
            }
        }
    }

    private async checkPostUpdate(model: string, id: any, db: Record<string, DbOperations>, preValue: any) {
        this.logger.info(`Checking post-update policy for ${model}#${id}, preValue: ${formatObject(preValue)}`);

        const guard = await this.getAuthGuard(model, 'postUpdate', preValue);

        // build a query condition with policy injected
        const idField = this.getIdField(model);
        const guardedQuery = { where: this.and({ [idField.name]: id }, guard) };

        // query with policy injected
        const entity = await db[model].findFirst(guardedQuery);

        // see if we get fewer items with policy, if so, reject with an throw
        if (!entity) {
            this.logger.info(`entity ${model} failed policy check for operation postUpdate`);
            throw this.deniedByPolicy(model, 'postUpdate');
        }

        // TODO: push down schema check to the database
        const schema = await this.getModelSchema(model);
        if (schema) {
            const schemaCheckResult = schema.safeParse(entity);
            if (!schemaCheckResult.success) {
                const error = fromZodError(schemaCheckResult.error).message;
                this.logger.info(`entity ${model} failed schema check for operation postUpdate: ${error}`);
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
    getIdField(model: string) {
        const fields = this.modelMeta.fields[camelCase(model)];
        if (!fields) {
            throw this.unknownError(`Unable to load fields for ${model}`);
        }
        const result = Object.values(fields).find((f) => f.isId);
        if (!result) {
            throw this.unknownError(`model ${model} does not have an id field`);
        }
        return result;
    }

    /**
     * Gets id field value from an entity.
     */
    getEntityId(model: string, entityData: any) {
        const idField = this.getIdField(model);
        return entityData[idField.name];
    }
}
