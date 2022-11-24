/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashSync } from 'bcryptjs';
import deepcopy from 'deepcopy';
import {
    DEFAULT_PASSWORD_SALT_LENGTH,
    GUARD_FIELD_NAME,
    TRANSACTION_FIELD_NAME,
} from '../../constants';
import {
    DbOperations,
    FieldInfo,
    PolicyOperationKind,
    QueryContext,
    ServerErrorCode,
    Service,
} from '../../types';
import { PrismaWriteActionType, RequestHandlerError } from '../types';
import { NestedWriteVisitor } from './nested-write-vistor';

//#region General helpers

/**
 * Creates a conjunction of a list of query conditions.
 */
export function and(...conditions: unknown[]): any {
    const filtered = conditions.filter((c) => !!c);
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
export function or(...conditions: unknown[]): any {
    const filtered = conditions.filter((c) => !!c);
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
export async function queryIds(
    model: string,
    db: Record<string, DbOperations>,
    where: unknown
): Promise<string[]> {
    const r = await db[model].findMany({ select: { id: true }, where });
    return (r as { id: string }[]).map((item) => item.id);
}

//#endregion

//#region Policy enforcement helpers

/**
 * Read model entities w.r.t the given query args. The result list
 * are guaranteed to fully satisfy 'read' policy rules recursively.
 *
 * For to-many relations involved, items not satisfying policy are
 * silently trimmed. For to-one relation, if relation data fails policy
 * an RequestHandlerError is thrown.
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
    service: Service,
    context: QueryContext,
    db: Record<string, DbOperations>
): Promise<unknown[]> {
    const args = deepcopy(queryArgs);
    args.where = and(
        args.where,
        await service.buildQueryGuard(model, 'read', context)
    );

    // recursively inject read guard conditions into the query args
    await injectNestedReadConditions(model, args, service, context);

    service.verbose(
        `Reading with validation for ${model}: ${JSON.stringify(args)}`
    );
    const result = await db[model].findMany(args);

    await Promise.all(
        result.map((item) =>
            postProcessForRead(item, model, args, service, context, db, 'read')
        )
    );

    return result;
}

async function injectNestedReadConditions(
    model: string,
    args: any,
    service: Service,
    context: QueryContext
) {
    const injectTarget = args.select ?? args.include;
    if (!injectTarget) {
        return;
    }

    for (const field of Object.keys(injectTarget)) {
        const fieldInfo = await service.resolveField(model, field);
        if (!fieldInfo || !fieldInfo.isDataModel) {
            // only care about relation fields
            continue;
        }

        if (fieldInfo.isArray) {
            if (typeof injectTarget[field] !== 'object') {
                injectTarget[field] = {};
            }
            // inject extra condition for to-many relation
            injectTarget[field].where = and(
                injectTarget.where,
                await service.buildQueryGuard(fieldInfo.type, 'read', context)
            );
        } else {
            // there's no way of injecting condition for to-one relation, so we
            // make sure 'id' field is selected and check them against query result
            if (
                injectTarget[field]?.select &&
                injectTarget[field]?.select?.id !== true
            ) {
                injectTarget[field].select.id = true;
            }
        }

        // recurse
        await injectNestedReadConditions(
            fieldInfo.type,
            injectTarget[field],
            service,
            context
        );
    }
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
    service: Service,
    context: QueryContext,
    db: Record<string, DbOperations>,
    operation: PolicyOperationKind
) {
    if (!entityData?.id) {
        return;
    }

    for (const field of Object.keys(entityData)) {
        if (await shouldOmit(service, model, field)) {
            delete entityData[field];
        }

        const fieldValue = entityData[field];

        if (typeof fieldValue === 'bigint') {
            // serialize BigInt with typing info
            entityData[field] = {
                type: 'BigInt',
                data: fieldValue.toString(),
            };
        }

        if (fieldValue instanceof Date) {
            // serialize Date with typing info
            entityData[field] = {
                type: 'Date',
                data: fieldValue.toISOString(),
            };
        }

        if (typeof fieldValue === 'object') {
            const fieldInfo = await service.resolveField(model, field);
            if (fieldInfo?.type === 'Decimal') {
                // serialize Decimal with typing info
                entityData[field] = {
                    type: 'Decimal',
                    data: fieldValue.toString(),
                };
            } else if (fieldInfo?.type === 'Bytes') {
                entityData[field] = {
                    type: 'Bytes',
                    data: Array.from(fieldValue as Buffer),
                };
            }
        }
    }

    const injectTarget = args.select ?? args.include;
    if (!injectTarget) {
        return;
    }

    // to-one relation data cannot be trimmed by injected guards, we have to
    // post-check them
    for (const field of Object.keys(injectTarget)) {
        const fieldInfo = await service.resolveField(model, field);
        if (
            !fieldInfo ||
            !fieldInfo.isDataModel ||
            fieldInfo.isArray ||
            !entityData?.[field]?.id
        ) {
            continue;
        }

        service.verbose(
            `Validating read of to-one relation: ${fieldInfo.type}#${entityData[field].id}`
        );

        await checkPolicyForIds(
            fieldInfo.type,
            [entityData[field].id],
            operation,
            service,
            context,
            db
        );

        // recurse
        await postProcessForRead(
            entityData[field],
            fieldInfo.type,
            injectTarget[field],
            service,
            context,
            db,
            operation
        );
    }
}

type SelectionPath = Array<{ field: FieldInfo; where: any }>;

/**
 * Validates that a model entity satisfies 'update' policy rules
 * before conducting an update
 *
 * @param model model under update
 * @param id id of entity under update
 * @param updateArgs Prisma update args
 * @param service the ZenStack service
 * @param context the query context
 * @param transaction the db transaction context
 */
export async function preUpdateCheck(
    model: string,
    id: string,
    updateArgs: any,
    service: Service,
    context: QueryContext,
    transaction: Record<string, DbOperations>
): Promise<void> {
    // check the entity directly under update first
    await checkPolicyForIds(
        model,
        [id],
        'update',
        service,
        context,
        transaction
    );

    // We need to ensure that all nested updates respect policy rules of
    // the corresponding model.
    //
    // Here we use a visitor to collect all necessary
    // checkes. During visiting, for every update we meet agains a relation,
    // we collect its path (starting from the root object). If the relation
    // is a to-many one, it can carry filter condition that we collect as well.
    //
    // After the visiting, we validate that each collected path satisfies
    // corresponding policy rules by making separate queries.

    const visitor = new NestedWriteVisitor<SelectionPath>(service);
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

        if (
            ![
                'update',
                'updateMany',
                'upsert',
                'delete',
                'deleteMany',
            ].includes(action)
        ) {
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
                    condition = or(
                        ...ensureArray(fieldData).map((d) => d.where)
                    );
                    break;
                case 'delete':
                case 'deleteMany':
                    // condition is not wrapped
                    condition = or(...ensureArray(fieldData));
                    break;
            }
        }

        // build up a new segment of path
        const selectionPath = [
            ...state,
            { field: fieldInfo, where: condition },
        ];

        const operation: PolicyOperationKind = [
            'update',
            'updateMany',
            'upsert',
        ].includes(action)
            ? 'update'
            : 'delete';

        // collect an asynchronous check action
        checks.push(
            checkPolicyForSelectionPath(
                model,
                id,
                selectionPath,
                operation,
                transaction,
                service,
                context
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
 * throw a RequestHandlerError.
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
    service: Service,
    context: QueryContext,
    db: Record<string, DbOperations>
) {
    service.verbose(
        `Checking policy for ${model}#[${ids.join(', ')}] for ${operation}`
    );

    // build a query condition with policy injected
    const idCondition = ids.length > 1 ? { id: { in: ids } } : { id: ids[0] };
    const query = {
        where: and(
            idCondition,
            await service.buildQueryGuard(model, operation, context)
        ),
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
        throw new RequestHandlerError(
            ServerErrorCode.DENIED_BY_POLICY,
            `denied by policy: entities failed '${operation}' check, ${model}#[${gap.join(
                ', '
            )}]`
        );
    }
}

/**
 * Given a selection path, check if the entities at the end of path satisfy
 * policy rules. If not, throw an error.
 */
async function checkPolicyForSelectionPath(
    model: string,
    id: string,
    selectionPath: SelectionPath,
    operation: PolicyOperationKind,
    db: Record<string, DbOperations>,
    service: Service,
    context: QueryContext
): Promise<void> {
    const targetField = selectionPath[selectionPath.length - 1].field;
    // build a Prisma query for the path
    const query = buildChainedSelectQuery(id, selectionPath);

    service.verbose(
        `Query for selection path: model ${model}, path ${JSON.stringify(
            selectionPath
        )}, query ${JSON.stringify(query)}`
    );
    const r = await db[model].findUnique(query);

    // collect ids at the end of the path
    const ids: string[] = collectTerminalEntityIds(selectionPath, r);
    service.verbose(`Collected leaf ids: ${JSON.stringify(ids)}`);

    if (ids.length === 0) {
        return;
    }

    // check policies for the collected ids
    await checkPolicyForIds(
        targetField.type,
        ids,
        operation,
        service,
        context,
        db
    );
}

/**
 * Builds a Prisma query for the given selection path
 */
function buildChainedSelectQuery(id: string, selectionPath: SelectionPath) {
    const query = { where: { id }, select: { id: true } };
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

function collectTerminalEntityIds(
    selectionPath: SelectionPath,
    data: any
): string[] {
    let curr = data;
    for (const path of selectionPath) {
        curr = curr[path.field.name];
    }

    if (!curr) {
        throw new RequestHandlerError(
            ServerErrorCode.UNKNOWN,
            'an unexpected error occurred'
        );
    }

    return Array.isArray(curr)
        ? curr.map((item) => item.id as string)
        : [curr.id as string];
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
    operation: PolicyOperationKind,
    transactionId: string,
    service: Service
): Promise<{ createdModels: string[]; updatedModels: string[] }> {
    const updatedModels = new Set<string>();
    const createdModels = new Set<string>();

    if (args.data) {
        args.data[TRANSACTION_FIELD_NAME] = `${transactionId}:${operation}`;
        updatedModels.add(model);
    }

    const visitAction = async (
        fieldInfo: FieldInfo,
        action: PrismaWriteActionType,
        fieldData: any
    ) => {
        if (fieldInfo.isDataModel && fieldData) {
            switch (action) {
                case 'update':
                case 'updateMany':
                    ensureArray(fieldData).forEach((item) => {
                        if (fieldInfo.isArray && item.data) {
                            item.data[
                                TRANSACTION_FIELD_NAME
                            ] = `${transactionId}:update`;
                        } else {
                            item[
                                TRANSACTION_FIELD_NAME
                            ] = `${transactionId}:update`;
                        }
                        updatedModels.add(fieldInfo.type);
                    });
                    break;

                case 'upsert':
                    ensureArray(fieldData).forEach((item) => {
                        item.create[
                            TRANSACTION_FIELD_NAME
                        ] = `${transactionId}:create`;
                        createdModels.add(fieldInfo.type);
                        item.update[
                            TRANSACTION_FIELD_NAME
                        ] = `${transactionId}:update`;
                        updatedModels.add(fieldInfo.type);
                    });
                    break;

                case 'create':
                case 'createMany':
                    ensureArray(fieldData).forEach((item) => {
                        item[
                            TRANSACTION_FIELD_NAME
                        ] = `${transactionId}:create`;
                        createdModels.add(fieldInfo.type);
                    });
                    break;

                case 'connectOrCreate':
                    ensureArray(fieldData).forEach((item) => {
                        item.create[
                            TRANSACTION_FIELD_NAME
                        ] = `${transactionId}:create`;
                        createdModels.add(fieldInfo.type);
                    });
                    break;
            }
        }
        return true;
    };

    const visitor = new NestedWriteVisitor(service);
    await visitor.visit(model, args.data, undefined, undefined, visitAction);

    return {
        createdModels: Array.from(createdModels),
        updatedModels: Array.from(updatedModels),
    };
}

/**
 * Preprocesses the given write args to modify field values (in place) based on
 * attributes like @password
 */
export async function preprocessWritePayload(
    model: string,
    args: any,
    service: Service
) {
    const visitAction = async (
        fieldInfo: FieldInfo,
        _action: PrismaWriteActionType,
        fieldData: any,
        parentData: any
    ) => {
        // process @password field
        const pwdAttr = fieldInfo.attributes?.find(
            (attr) => attr.name === '@password'
        );
        if (pwdAttr && fieldInfo.type === 'String') {
            // hash password value
            let salt: string | number | undefined = pwdAttr.args.find(
                (arg) => arg.name === 'salt'
            )?.value as string;
            if (!salt) {
                salt = pwdAttr.args.find((arg) => arg.name === 'saltLength')
                    ?.value as number;
            }
            if (!salt) {
                salt = DEFAULT_PASSWORD_SALT_LENGTH;
            }
            parentData[fieldInfo.name] = hashSync(fieldData, salt);
        }

        // deserialize Buffer field
        if (fieldInfo.type === 'Bytes' && Array.isArray(fieldData.data)) {
            parentData[fieldInfo.name] = Buffer.from(fieldData.data);
        }

        // deserialize BigInt field
        if (fieldInfo.type === 'BigInt' && typeof fieldData === 'string') {
            parentData[fieldInfo.name] = BigInt(fieldData);
        }

        return true;
    };

    const visitor = new NestedWriteVisitor(service);

    await visitor.visit(model, args.data, undefined, undefined, visitAction);
}

async function shouldOmit(service: Service, model: string, field: string) {
    if ([TRANSACTION_FIELD_NAME, GUARD_FIELD_NAME].includes(field)) {
        return true;
    }
    const fieldInfo = await service.resolveField(model, field);
    return !!(
        fieldInfo && fieldInfo.attributes.find((attr) => attr.name === '@omit')
    );
}

//#endregion
