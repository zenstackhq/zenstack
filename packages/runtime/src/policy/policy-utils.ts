/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashSync } from 'bcryptjs';
import superjson from 'superjson';
import { AUXILIARY_FIELDS, DEFAULT_PASSWORD_SALT_LENGTH, TRANSACTION_FIELD_NAME } from '../constants';
import { AuthUser, DbOperations, FieldInfo, PolicyOperationKind, PrismaWriteActionType } from '../types';
import { NestedWriteVisitor } from './nested-write-vistor';
import { PrismaClientUnknownRequestError, PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { getVersion } from '../version';
import { Logger } from './logger';
import { camelCase } from 'change-case';
import { PolicyDef, PolicyFunc } from '.';

//#region General helpers

/**
 * Creates a conjunction of a list of query conditions.
 */
export function and(...conditions: (boolean | object)[]): any {
    if (conditions.includes(false)) {
        // always false
        return { id: { in: [] } };
    }

    const filtered = conditions.filter((c): c is object => typeof c === 'object' && !!c);
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
export function or(...conditions: (boolean | object)[]): any {
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
 * Wraps a value into array if it's not already one
 */
export function ensureArray<T>(value: T): Array<T> {
    return Array.isArray(value) ? value : [value];
}

/**
 * Given a where condition, queries db and returns IDs of result entities
 */
export async function queryIds(model: string, db: Record<string, DbOperations>, where: unknown): Promise<string[]> {
    const r = await db[model].findMany({ select: { id: true }, where });
    return (r as { id: string }[]).map((item) => item.id);
}

//#endregion

//#region Policy enforcement helpers

export async function getAuthGuard(
    policy: PolicyDef,
    model: string,
    operation: PolicyOperationKind,
    user: AuthUser | undefined
): Promise<boolean | object> {
    const guard = policy.guard[camelCase(model)];
    if (!guard) {
        throw new PrismaClientUnknownRequestError(`zenstack: unable to load authorization guard for ${model}`, {
            clientVersion: getVersion(),
        });
    }

    if (guard.allowAll === true) {
        return true;
    }

    if (guard.denyAll === true) {
        return false;
    }

    const provider: PolicyFunc | undefined = guard[operation];
    if (!provider) {
        throw new PrismaClientUnknownRequestError(
            `zenstack: unable to load authorization query function for ${model}`,
            { clientVersion: getVersion() }
        );
    }
    return provider({ user });
}

async function resolveField(policy: PolicyDef, model: string, field: string) {
    return policy.fieldMapping[camelCase(model)]?.[field];
}

export async function ensureAuthGuard(
    args: any,
    model: string,
    operation: PolicyOperationKind,
    user: AuthUser | undefined,
    policy: PolicyDef
) {
    const guard = await getAuthGuard(policy, model, operation, user);
    return { ...args, where: and(args?.where, guard) };
}

/**
 * Read model entities w.r.t the given query args. The result list
 * are guaranteed to fully satisfy 'read' policy rules recursively.
 *
 * For to-many relations involved, items not satisfying policy are
 * silently trimmed. For to-one relation, if relation data fails policy
 * an CRUDError is thrown.
 *
 * @param model the model to query for
 * @param queryArgs the Prisma query args
 * @param service the ZenStack service
 * @param context the query context
 * @param db the db (or transaction)
 * @returns
 */
export async function readWithCheck(
    model: string,
    queryArgs: any,
    user: AuthUser | undefined,
    db: Record<string, DbOperations>,
    policy: PolicyDef,
    logger: Logger
): Promise<unknown[]> {
    const args = await ensureAuthGuard(queryArgs, model, 'read', user, policy);

    // recursively inject read guard conditions into the query args
    await injectNestedReadConditions(policy, model, args, user);

    logger.info(`Reading with validation for ${model}: ${superjson.stringify(args)}`);
    const result: any[] = await db[model].findMany(args);

    await Promise.all(result.map((item) => postProcessForRead(item, model, args, user, db, policy, 'read', logger)));

    return result;
}

async function injectNestedReadConditions(policy: PolicyDef, model: string, args: any, user: AuthUser | undefined) {
    const injectTarget = args.select ?? args.include;
    if (!injectTarget) {
        return;
    }

    for (const field of getModelFields(injectTarget)) {
        const fieldInfo = await resolveField(policy, model, field);
        if (!fieldInfo || !fieldInfo.isDataModel) {
            // only care about relation fields
            continue;
        }

        if (fieldInfo.isArray) {
            if (typeof injectTarget[field] !== 'object') {
                injectTarget[field] = {};
            }
            // inject extra condition for to-many relation
            const guard = await getAuthGuard(policy, fieldInfo.type, 'read', user);
            injectTarget[field].where = and(injectTarget.where, guard);
        } else {
            // there's no way of injecting condition for to-one relation, so we
            // make sure 'id' field is selected and check them against query result
            if (injectTarget[field]?.select && injectTarget[field]?.select?.id !== true) {
                injectTarget[field].select.id = true;
            }
        }

        // recurse
        await injectNestedReadConditions(policy, fieldInfo.type, injectTarget[field], user);
    }
}

function getModelFields(data: any) {
    return Object.keys(data).filter((f) => !AUXILIARY_FIELDS.includes(f));
}

/**
 * Post processing checks for read model entities.
 * Validates to-one relations (which can't be trimmed
 * at query time) and removes fields that should be
 * omitted.
 */
async function postProcessForRead(
    entityData: any,
    model: string,
    args: any,
    user: AuthUser | undefined,
    db: Record<string, DbOperations>,
    policy: PolicyDef,
    operation: PolicyOperationKind,
    logger: Logger
) {
    if (!entityData?.id) {
        return;
    }

    for (const field of Object.keys(entityData)) {
        if (await shouldOmit(policy, model, field)) {
            delete entityData[field];
        }
    }

    const injectTarget = args.select ?? args.include;
    if (!injectTarget) {
        return;
    }

    // to-one relation data cannot be trimmed by injected guards, we have to
    // post-check them
    for (const field of getModelFields(injectTarget)) {
        const fieldInfo = await resolveField(policy, model, field);
        if (!fieldInfo || !fieldInfo.isDataModel || fieldInfo.isArray || !entityData?.[field]?.id) {
            continue;
        }

        logger.info(`Validating read of to-one relation: ${fieldInfo.type}#${entityData[field].id}`);

        await checkPolicyForIds(fieldInfo.type, [entityData[field].id], operation, user, db, policy, logger);

        // recurse
        await postProcessForRead(
            entityData[field],
            fieldInfo.type,
            injectTarget[field],
            user,
            db,
            policy,
            operation,
            logger
        );
    }
}

type SelectionPath = Array<{ field: FieldInfo; where: any }>;

/**
 * Validates that a model entity satisfies 'update' policy rules
 * before conducting an update
 *
 * @param model model under update
 * @param updateArgs Prisma update args
 * @param service the ZenStack service
 * @param context the query context
 * @param transaction the db transaction context
 */
export async function preUpdateCheck(
    model: string,
    updateArgs: any,
    user: AuthUser | undefined,
    transaction: Record<string, DbOperations>,
    policy: PolicyDef,
    logger: Logger
): Promise<void> {
    // check the entity directly under update first
    await checkPolicyForFilter(model, updateArgs.where, 'update', user, transaction, policy, logger);

    // We need to ensure that all nested updates respect policy rules of
    // the corresponding model.
    //
    // Here we use a visitor to collect all necessary
    // checkes. During visiting, for every update we meet against a relation,
    // we collect its path (starting from the root object). If the relation
    // is a to-many one, it can carry filter condition that we collect as well.
    //
    // After the visiting, we validate that each collected path satisfies
    // corresponding policy rules by making separate queries.

    const visitor = new NestedWriteVisitor<SelectionPath>((model, field) => resolveField(policy, model, field));
    const state: SelectionPath = [];
    const checks: Array<Promise<void>> = [];

    const visitAction = async (
        fieldInfo: FieldInfo,
        action: PrismaWriteActionType,
        fieldData: any,
        _parentData: any,
        state: SelectionPath
    ) => {
        if (!fieldInfo.isDataModel) {
            return state;
        }

        if (!['update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(action)) {
            // no more nested writes inside, stop recursion
            return undefined;
        }

        // for to-many relation, a filter condition can be attached
        let condition: any = undefined;
        if (fieldInfo.isArray) {
            switch (action) {
                case 'update':
                case 'updateMany':
                case 'upsert':
                    // condition is wrapped in 'where'
                    condition = or(...ensureArray(fieldData).map((d) => d.where));
                    break;
                case 'delete':
                case 'deleteMany':
                    // condition is not wrapped
                    condition = or(...ensureArray(fieldData));
                    break;
            }
        }

        // build up a new segment of path
        const selectionPath = [...state, { field: fieldInfo, where: condition }];

        const operation: PolicyOperationKind = ['update', 'updateMany', 'upsert'].includes(action)
            ? 'update'
            : 'delete';

        // collect an asynchronous check action
        checks.push(
            checkPolicyForSelectionPath(
                model,
                updateArgs.where,
                selectionPath,
                operation,
                transaction,
                policy,
                user,
                logger
            )
        );

        // recurse down with the current path as the new state
        return selectionPath;
    };

    await visitor.visit(model, updateArgs.data, undefined, state, visitAction);

    await Promise.all(checks);
}

/**
 * Given a list of ids for a model, check if they all match policy rules, and if not,
 * throw a CRUDError.
 *
 * @param model the model
 * @param ids the entity ids
 * @param operation the operation to check for
 * @param service the ZenStack service
 * @param context the query context
 * @param db the db or transaction
 */
export async function checkPolicyForIds(
    model: string,
    ids: string[],
    operation: PolicyOperationKind,
    user: AuthUser | undefined,
    db: Record<string, DbOperations>,
    policy: PolicyDef,
    logger: Logger
) {
    logger.info(`Checking policy for ${model}#[${ids.join(', ')}] for ${operation}`);

    // build a query condition with policy injected
    const idCondition = ids.length > 1 ? { id: { in: ids } } : { id: ids[0] };
    const guard = await getAuthGuard(policy, model, operation, user);
    const query = {
        where: and(idCondition, guard),
        select: { id: true },
    };

    // query with policy injected
    const filteredResult = (await db[model].findMany(query)) as Array<{
        id: string;
    }>;

    // see if we get fewer items with policy, if so, reject with an throw
    const filteredIds = filteredResult.map((item) => item.id);
    if (filteredIds.length < ids.length) {
        const gap = ids.filter((id) => !filteredIds.includes(id));
        throw deniedByPolicy(model, operation, `#[${gap.join(', ')}]`);
    }
}

export function deniedByPolicy(model: string, operation: PolicyOperationKind, extra?: string) {
    return new PrismaClientKnownRequestError(
        `denied by policy: entities failed '${operation}' check, ${model}${extra ? ', ' + extra : ''}`,
        { clientVersion: getVersion(), code: 'P2004' }
    );
}

export function notFound(model: string) {
    return new PrismaClientKnownRequestError(`entity not found for model ${model}`, {
        clientVersion: getVersion(),
        code: 'P2025',
    });
}

export async function checkPolicyForFilter(
    model: string,
    filter: any,
    operation: PolicyOperationKind,
    user: AuthUser | undefined,
    db: Record<string, DbOperations>,
    policy: PolicyDef,
    logger: Logger
) {
    logger.info(`Checking policy for ${model}#${JSON.stringify(filter)} for ${operation}`);

    const count = await db[model].count({ where: filter });
    const guard = await getAuthGuard(policy, model, operation, user);

    // build a query condition with policy injected
    const guardedQuery = { where: and(filter, guard) };

    // query with policy injected
    const guardedCount = await db[model].count(guardedQuery);

    // see if we get fewer items with policy, if so, reject with an throw
    if (guardedCount < count) {
        throw deniedByPolicy(model, operation, `${count - guardedCount} entities failed policy check`);
    }
}

/**
 * Given a selection path, check if the entities at the end of path satisfy
 * policy rules. If not, throw an error.
 */
async function checkPolicyForSelectionPath(
    model: string,
    rootFilter: any,
    selectionPath: SelectionPath,
    operation: PolicyOperationKind,
    db: Record<string, DbOperations>,
    policy: PolicyDef,
    user: AuthUser | undefined,
    logger: Logger
): Promise<void> {
    const targetField = selectionPath[selectionPath.length - 1].field;
    // build a Prisma query for the path
    const query = buildChainedSelectQuery(rootFilter, selectionPath);

    logger.info(
        `Query for selection path: model ${model}, path ${superjson.stringify(
            selectionPath
        )}, query ${superjson.stringify(query)}`
    );
    const r = await db[model].findUnique(query);

    // collect ids at the end of the path
    const ids: string[] = collectTerminalEntityIds(selectionPath, r);
    logger.info(`Collected leaf ids: ${superjson.stringify(ids)}`);

    if (ids.length === 0) {
        return;
    }

    // check policies for the collected ids
    await checkPolicyForIds(targetField.type, ids, operation, user, db, policy, logger);
}

/**
 * Builds a Prisma query for the given selection path
 */
function buildChainedSelectQuery(rootFilter: any, selectionPath: SelectionPath) {
    const query = { where: rootFilter, select: { id: true } };
    let currSelect: any = query.select;
    for (const path of selectionPath) {
        const nextSelect = { select: { id: true } };
        currSelect[path.field.name] = nextSelect;
        if (path.where) {
            currSelect[path.field.name].where = path.where;
        }
        currSelect = nextSelect.select;
    }
    return query;
}

function collectTerminalEntityIds(selectionPath: SelectionPath, data: any): string[] {
    let curr = data;
    for (const path of selectionPath) {
        curr = curr[path.field.name];
    }

    if (!curr) {
        throw new Error('an unexpected error occurred');
    }

    return Array.isArray(curr) ? curr.map((item) => item.id as string) : [curr.id as string];
}

/**
 * Injects assignment of zenstack_transaction field for all nested
 * update/create in a Prisma update args recursively.
 *
 * @return a tuple containing all model types that are involved in
 * creation or updating, respectively
 */
export async function injectTransactionId(
    model: string,
    args: any,
    operation: 'create' | 'update',
    transactionId: string,
    policy: PolicyDef
): Promise<{ createdModels: string[]; updatedModels: string[] }> {
    const updatedModels = new Set<string>();
    const createdModels = new Set<string>();

    const topGuard = await getAuthGuard(policy, model, operation, undefined);
    if (topGuard === false) {
        throw deniedByPolicy(model, operation);
    } else if (topGuard !== true) {
        args[TRANSACTION_FIELD_NAME] = `${transactionId}:${operation}`;
        if (operation === 'create') {
            createdModels.add(model);
        } else {
            updatedModels.add(model);
        }
    }

    const visitAction = async (fieldInfo: FieldInfo, action: PrismaWriteActionType, fieldData: any) => {
        if (fieldInfo.isDataModel && fieldData) {
            switch (action) {
                case 'update':
                case 'updateMany': {
                    const guard = await getAuthGuard(policy, fieldInfo.type, 'update', undefined);
                    if (guard === false) {
                        // fail fast
                        throw deniedByPolicy(fieldInfo.type, 'update');
                    } else if (guard !== true) {
                        ensureArray(fieldData).forEach((item) => {
                            if (fieldInfo.isArray && item.data) {
                                item.data[TRANSACTION_FIELD_NAME] = `${transactionId}:update`;
                            } else {
                                item[TRANSACTION_FIELD_NAME] = `${transactionId}:update`;
                            }
                            updatedModels.add(fieldInfo.type);
                        });
                    }
                    break;
                }

                case 'upsert': {
                    const createGuard = await getAuthGuard(policy, fieldInfo.type, 'create', undefined);
                    const updateGuard = await getAuthGuard(policy, fieldInfo.type, 'update', undefined);

                    ensureArray(fieldData).forEach((item) => {
                        if (createGuard !== true) {
                            item.create[TRANSACTION_FIELD_NAME] = `${transactionId}:create`;
                            createdModels.add(fieldInfo.type);
                        }

                        if (updateGuard !== true) {
                            item.update[TRANSACTION_FIELD_NAME] = `${transactionId}:update`;
                            updatedModels.add(fieldInfo.type);
                        }
                    });
                    break;
                }

                case 'create':
                case 'createMany': {
                    const guard = await getAuthGuard(policy, fieldInfo.type, 'create', undefined);
                    if (guard === false) {
                        // fail fast
                        throw deniedByPolicy(fieldInfo.type, 'create');
                    } else if (guard !== true) {
                        ensureArray(fieldData).forEach((item) => {
                            item[TRANSACTION_FIELD_NAME] = `${transactionId}:create`;
                            createdModels.add(fieldInfo.type);
                        });
                    }
                    break;
                }

                case 'connectOrCreate': {
                    const guard = await getAuthGuard(policy, fieldInfo.type, 'create', undefined);
                    if (guard !== true) {
                        ensureArray(fieldData).forEach((item) => {
                            item.create[TRANSACTION_FIELD_NAME] = `${transactionId}:create`;
                            createdModels.add(fieldInfo.type);
                        });
                    }
                    break;
                }
            }
        }
        return true;
    };

    const visitor = new NestedWriteVisitor((model, field) => resolveField(policy, model, field));
    await visitor.visit(model, args, undefined, undefined, visitAction);

    return {
        createdModels: Array.from(createdModels),
        updatedModels: Array.from(updatedModels),
    };
}

/**
 * Preprocesses the given write args to modify field values (in place) based on
 * attributes like @password
 */
export async function preprocessWritePayload(policy: PolicyDef, model: string, args: any) {
    const visitAction = async (
        fieldInfo: FieldInfo,
        _action: PrismaWriteActionType,
        fieldData: any,
        parentData: any
    ) => {
        // process @password field
        const pwdAttr = fieldInfo.attributes?.find((attr) => attr.name === '@password');
        if (pwdAttr && fieldInfo.type === 'String') {
            // hash password value
            let salt: string | number | undefined = pwdAttr.args.find((arg) => arg.name === 'salt')?.value as string;
            if (!salt) {
                salt = pwdAttr.args.find((arg) => arg.name === 'saltLength')?.value as number;
            }
            if (!salt) {
                salt = DEFAULT_PASSWORD_SALT_LENGTH;
            }
            parentData[fieldInfo.name] = hashSync(fieldData, salt);
        }
        return true;
    };

    const visitor = new NestedWriteVisitor((model, field) => resolveField(policy, model, field));

    await visitor.visit(model, args, undefined, undefined, visitAction);
}

async function shouldOmit(policy: PolicyDef, model: string, field: string) {
    if (AUXILIARY_FIELDS.includes(field)) {
        return true;
    }
    const fieldInfo = await resolveField(policy, model, field);
    return !!(fieldInfo && fieldInfo.attributes.find((attr) => attr.name === '@omit'));
}

//#endregion
