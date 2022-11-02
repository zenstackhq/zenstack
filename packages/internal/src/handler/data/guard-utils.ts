/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import deepcopy from 'deepcopy';
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

/**
 * Utility for creating a conjunction of two query conditions
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

export function ensureArray<T>(data: T): Array<T> {
    return Array.isArray(data) ? data : [data];
}

type SelectionPath = Array<{ field: FieldInfo; where: any }>;

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

    const visitor = new NestedWriteVisitor<SelectionPath>(service);
    const state: SelectionPath = [];
    const checks: Array<Promise<void>> = [];

    const visitAction = async (
        fieldInfo: FieldInfo,
        action: PrismaWriteActionType,
        writeData: any,
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
            return undefined;
        }

        let condition: any = undefined;
        if (fieldInfo.isArray) {
            switch (action) {
                case 'update':
                case 'updateMany':
                case 'upsert':
                    // condition is wrapped in 'where'
                    condition = or(
                        ...ensureArray(writeData).map((d) => d.where)
                    );
                    break;
                case 'delete':
                case 'deleteMany':
                    // condition is not wrapped
                    condition = or(...ensureArray(writeData));
                    break;
            }
        }

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

        return selectionPath;
    };

    await visitor.visit(model, updateArgs.data, ['update'], state, visitAction);

    await Promise.all(checks);
}

export async function checkPolicyForIds(
    model: string,
    ids: string[],
    operation: PolicyOperationKind,
    service: Service,
    context: QueryContext,
    db: Record<string, DbOperations>
) {
    console.log(
        `Checking policy for ${model}#[${ids.join(', ')}] for ${operation}`
    );
    const idCondition = ids.length > 1 ? { id: { in: ids } } : { id: ids[0] };
    const query = {
        where: and(
            idCondition,
            await service.buildQueryGuard(model, operation, context)
        ),
        select: { id: true },
    };
    const filteredResult = (await db[model].findMany(query)) as Array<{
        id: string;
    }>;

    const filteredIds = filteredResult.map((item) => item.id);
    if (filteredIds.length < ids.length) {
        const gap = ids.filter((id) => !filteredIds.includes(id));
        throw new RequestHandlerError(
            ServerErrorCode.DENIED_BY_POLICY,
            `denied by policy before update: entities failed '${operation}' check, ${model}#[${gap.join(
                ', '
            )}]`
        );
    }
}

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
    const query = buildChainedSelectQuery(id, selectionPath);

    console.log(
        `Query for selection path: model ${model}, path ${JSON.stringify(
            selectionPath
        )}, query ${JSON.stringify(query)}`
    );
    const r = await db[model].findUnique(query);

    const ids: string[] = collectLeafIds(selectionPath, r);
    console.log(`Collected leaf ids: ${JSON.stringify(ids)}`);

    if (ids.length === 0) {
        return;
    }

    // check policies against entities at the end of the selection path
    await checkPolicyForIds(
        targetField.type,
        ids,
        operation,
        service,
        context,
        db
    );
}

function buildChainedSelectQuery(id: string, selectionPath: SelectionPath) {
    const query = { where: { id }, select: { id: true } };
    let curr: any = query.select;
    for (const path of selectionPath) {
        curr[path.field.name] = { select: { id: true } };
        if (path.where) {
            curr[path.field.name].where = path.where;
        }
        curr = curr.select;
    }

    return query;
}

function collectLeafIds(selectionPath: SelectionPath, data: any): string[] {
    let curr = data;
    for (const path of selectionPath) {
        curr = data[path.field.name];
    }
    return Array.isArray(curr)
        ? curr.map((item) => item.id as string)
        : [curr.id as string];
}

export async function readWithCheck(
    model: string,
    readArgs: any,
    service: Service,
    context: QueryContext,
    db: Record<string, DbOperations>
) {
    const args = deepcopy(readArgs);
    args.where = and(
        args.where,
        await service.buildQueryGuard(model, 'read', context)
    );

    await injectNestedReadConditions(model, args, service, context);

    console.log(
        `Reading with validation for ${model}: ${JSON.stringify(args)}`
    );
    const result = await db[model].findMany(args);

    await Promise.all(
        result.map((item) =>
            checkToOneRelation(item, model, args, service, context, db, 'read')
        )
    );

    return result;
}

export async function queryIds(
    model: string,
    db: Record<string, DbOperations>,
    where: unknown
): Promise<string[]> {
    const r = await db[model].findMany({ select: { id: true }, where });
    return (r as { id: string }[]).map((item) => item.id);
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

        await injectNestedReadConditions(
            fieldInfo.type,
            injectTarget[field],
            service,
            context
        );
    }
}

async function checkToOneRelation(
    data: any,
    model: string,
    args: any,
    service: Service,
    context: QueryContext,
    db: Record<string, DbOperations>,
    operation: PolicyOperationKind
) {
    if (!data?.id) {
        return;
    }

    const injectTarget = args.select ?? args.include;
    if (!injectTarget) {
        return;
    }

    for (const field of Object.keys(injectTarget)) {
        const fieldInfo = await service.resolveField(model, field);
        if (
            !fieldInfo ||
            !fieldInfo.isDataModel ||
            fieldInfo.isArray ||
            !data?.[field]?.id
        ) {
            continue;
        }

        console.log(
            `Validating read of to-one relation: ${fieldInfo.type}#${data[field].id}`
        );

        await checkPolicyForIds(
            fieldInfo.type,
            [data[field].id],
            operation,
            service,
            context,
            db
        );

        await checkToOneRelation(
            data[field],
            fieldInfo.type,
            injectTarget[field],
            service,
            context,
            db,
            operation
        );
    }
}
