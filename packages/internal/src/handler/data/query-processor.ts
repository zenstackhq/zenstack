import deepcopy from 'deepcopy';
import { TRANSACTION_FIELD_NAME } from '../../constants';
import {
    PolicyOperationKind,
    QueryContext,
    ServerErrorCode,
    Service,
} from '../../types';
import { RequestHandlerError } from '../types';
import { and } from './guard-utils';

export class QueryProcessor {
    constructor(private readonly service: Service) {}

    async processQueryArgsForWrite(
        model: string,
        args: any,
        operation: PolicyOperationKind,
        context: QueryContext,
        transactionId: string
    ) {
        const preWriteGuard = args ? deepcopy(args) : {};
        delete preWriteGuard.data;
        delete preWriteGuard.include;
        delete preWriteGuard.select;

        if (operation === 'update') {
            preWriteGuard.select = { id: true };
            await this.injectSelectForToOneRelation(
                model,
                preWriteGuard.select,
                args.data,
                operation
            );
        }

        await this.processQueryArgs(
            model,
            preWriteGuard,
            operation,
            context,
            true
        );

        const writeArgs = args ? deepcopy(args) : {};
        delete writeArgs.include;
        delete writeArgs.select;

        const includedModels = new Set<string>([model]);
        await this.collectModelsInNestedWrites(
            model,
            writeArgs.data,
            operation,
            context,
            includedModels,
            transactionId
        );

        return { preWriteGuard, writeArgs, includedModels };
    }

    async injectSelectForToOneRelation(
        model: string,
        select: any,
        updateData: any,
        operation: string
    ) {
        if (!updateData) {
            return;
        }
        for (const [k, v] of Object.entries(updateData)) {
            const fieldInfo = await this.service.resolveField(model, k);
            if (fieldInfo) {
                if (fieldInfo.isArray) {
                    select[k] = { select: { ...select?.[k]?.select } };
                    await this.injectSelectForToOneRelation(
                        fieldInfo.type,
                        select[k].select,
                        (v as any)?.update,
                        operation
                    );
                    if (Object.keys(select[k].select).length === 0) {
                        delete select[k].select;
                    }
                } else {
                    select[k] = {
                        select: { ...select?.[k]?.select, id: true },
                    };
                    await this.injectSelectForToOneRelation(
                        fieldInfo.type,
                        select[k].select,
                        v,
                        operation
                    );
                }
            }
        }
    }

    private async collectModelsInNestedWrites(
        model: string,
        data: any,
        operation: PolicyOperationKind,
        context: QueryContext,
        includedModels: Set<string>,
        transactionId: string
    ) {
        if (!data) {
            return;
        }

        const arr = Array.isArray(data) ? data : [data];

        for (const item of arr) {
            item[TRANSACTION_FIELD_NAME] = transactionId + ':' + operation;

            for (const [k, v] of Object.entries<any>(item)) {
                if (!v) {
                    continue;
                }
                const fieldInfo = await this.service.resolveField(model, k);
                if (fieldInfo) {
                    includedModels.add(fieldInfo.type);

                    for (const [op, payload] of Array.from(
                        Object.entries<any>(v)
                    )) {
                        if (!payload) {
                            continue;
                        }
                        switch (op) {
                            case 'create':
                                await this.collectModelsInNestedWrites(
                                    fieldInfo.type,
                                    payload,
                                    'create',
                                    context,
                                    includedModels,
                                    transactionId
                                );
                                break;

                            case 'connectOrCreate':
                                if (payload.create) {
                                    await this.collectModelsInNestedWrites(
                                        fieldInfo.type,
                                        payload.create,
                                        'create',
                                        context,
                                        includedModels,
                                        transactionId
                                    );
                                }
                                break;

                            case 'upsert':
                                if (payload.update) {
                                    await this.collectModelsInNestedWrites(
                                        fieldInfo.type,
                                        payload.update,
                                        'update',
                                        context,
                                        includedModels,
                                        transactionId
                                    );
                                }
                                if (payload.update) {
                                    await this.collectModelsInNestedWrites(
                                        fieldInfo.type,
                                        payload.create,
                                        'create',
                                        context,
                                        includedModels,
                                        transactionId
                                    );
                                }
                                break;

                            case 'createMany':
                                if (
                                    payload.data &&
                                    typeof payload.data[Symbol.iterator] ===
                                        'function'
                                ) {
                                    for (const item of payload.data) {
                                        await this.collectModelsInNestedWrites(
                                            fieldInfo.type,
                                            item,
                                            'create',
                                            context,
                                            includedModels,
                                            transactionId
                                        );
                                    }
                                    break;
                                }
                                break;

                            case 'update':
                                if (fieldInfo.isArray) {
                                    const guard =
                                        await this.service.buildQueryGuard(
                                            fieldInfo.type,
                                            'update',
                                            context
                                        );

                                    if (
                                        guard &&
                                        Object.keys(guard).length > 0
                                    ) {
                                        payload.where = and(
                                            payload.where,
                                            guard
                                        );
                                        v.updateMany = payload;
                                        delete v.update;
                                    }

                                    // to-many updates, data is in 'data' field
                                    await this.collectModelsInNestedWrites(
                                        fieldInfo.type,
                                        payload.data,
                                        'update',
                                        context,
                                        includedModels,
                                        transactionId
                                    );
                                } else {
                                    // to-one update, payload is data
                                    await this.collectModelsInNestedWrites(
                                        fieldInfo.type,
                                        payload,
                                        'update',
                                        context,
                                        includedModels,
                                        transactionId
                                    );
                                }
                                break;

                            case 'updateMany': {
                                const guard =
                                    await this.service.buildQueryGuard(
                                        fieldInfo.type,
                                        'update',
                                        context
                                    );

                                if (guard && Object.keys(guard).length > 0) {
                                    payload.where = and(payload.where, guard);
                                    v.updateMany = payload;
                                }
                                await this.collectModelsInNestedWrites(
                                    fieldInfo.type,
                                    payload,
                                    'update',
                                    context,
                                    includedModels,
                                    transactionId
                                );
                                break;
                            }

                            case 'delete':
                            case 'deleteMany': {
                                if (fieldInfo.isArray) {
                                    v.update = {
                                        where: payload,
                                        data: {
                                            [TRANSACTION_FIELD_NAME]:
                                                transactionId + ':delete',
                                        },
                                    };
                                } else {
                                    v.update = {
                                        [TRANSACTION_FIELD_NAME]:
                                            transactionId + ':delete',
                                    };
                                }
                                delete v[op];
                                break;
                            }

                            case 'connect':
                                // noop
                                break;

                            default:
                                throw new RequestHandlerError(
                                    ServerErrorCode.INVALID_REQUEST_PARAMS,
                                    `Unsupported nested operation '${op}'`
                                );
                        }
                    }
                }
            }
        }
    }

    async processQueryArgs(
        model: string,
        args: any,
        operation: PolicyOperationKind,
        context: QueryContext,
        injectWhere: boolean = true
    ) {
        const r = args ? deepcopy(args) : {};

        if (injectWhere) {
            const guard = await this.service.buildQueryGuard(
                model,
                operation,
                context
            );
            if (guard) {
                if (!r.where) {
                    r.where = guard;
                } else {
                    r.where = {
                        AND: [guard, r.where],
                    };
                }
            }
        }

        if (r.include || r.select) {
            if (r.include && r.select) {
                throw new RequestHandlerError(
                    ServerErrorCode.INVALID_REQUEST_PARAMS,
                    'Passing both "include" and "select" at the same level of query is not supported'
                );
            }

            // "include" and "select" are mutually exclusive
            const selector = r.include ? 'include' : 'select';
            for (const [field, value] of Object.entries(r[selector])) {
                const fieldInfo = await this.service.resolveField(model, field);
                if (fieldInfo) {
                    if (fieldInfo.isArray) {
                        // note that Prisma only allows to attach filter for "to-many" relation
                        // query, so we need to handle "to-one" filter separately in post-processing
                        const fieldGuard = await this.processQueryArgs(
                            fieldInfo.type,
                            value === true ? {} : value,
                            operation,
                            context
                        );
                        r[selector][field] = fieldGuard;
                    } else {
                        // make sure "id" field is included so that we can do post-process filtering
                        if (selector === 'select') {
                            r[selector].id = true;
                        }
                    }
                }
            }
        }

        return r;
    }

    private async getToOneFieldInfo(
        model: string,
        fieldName: string,
        fieldValue: any
    ) {
        if (
            !fieldValue ||
            Array.isArray(fieldValue) ||
            typeof fieldValue !== 'object'
        ) {
            return null;
        }

        const fieldInfo = await this.service.resolveField(model, fieldName);
        if (!fieldInfo || fieldInfo.isArray) {
            return null;
        }

        return fieldInfo;
    }

    private async collectRelationFields(
        model: string,
        data: any,
        map: Map<string, string[]>
    ) {
        for (const [fieldName, fieldValue] of Object.entries(data)) {
            const val: any = fieldValue;
            const fieldInfo = await this.getToOneFieldInfo(
                model,
                fieldName,
                fieldValue
            );
            if (!fieldInfo) {
                continue;
            }

            if (!map.has(fieldInfo.type)) {
                map.set(fieldInfo.type, []);
            }
            map.get(fieldInfo.type)!.push(val.id);

            // recurse into field value
            this.collectRelationFields(fieldInfo.type, val, map);
        }
    }

    private async checkIdsAgainstPolicy(
        relationFieldMap: Map<string, string[]>,
        operation: PolicyOperationKind,
        context: QueryContext
    ) {
        const promises = Array.from(relationFieldMap.entries()).map(
            async ([model, ids]) => {
                const args = {
                    select: { id: true },
                    where: {
                        id: { in: ids },
                    },
                };

                const processedArgs = await this.processQueryArgs(
                    model,
                    args,
                    operation,
                    context,
                    true
                );

                const checkedIds: Array<{ id: string }> = await this.service.db[
                    model
                ].findMany(processedArgs);
                return [model, checkedIds.map((r) => r.id)] as [
                    string,
                    string[]
                ];
            }
        );
        return new Map<string, string[]>(await Promise.all(promises));
    }

    private async sanitizeData(
        model: string,
        data: any,
        validatedIds: Map<string, string[]>
    ): Promise<boolean> {
        let deleted = false;
        for (const [fieldName, fieldValue] of Object.entries(data)) {
            const fieldInfo = await this.getToOneFieldInfo(
                model,
                fieldName,
                fieldValue
            );
            if (!fieldInfo) {
                continue;
            }
            const fv = fieldValue as { id: string };
            const valIds = validatedIds.get(fieldInfo.type);

            if (!valIds || !valIds.includes(fv.id)) {
                console.log(
                    `Deleting field ${fieldName} from ${model}#${data.id}, because field value #${fv.id} failed policy check`
                );
                delete data[fieldName];
                deleted = true;
            }

            const r = await this.sanitizeData(
                fieldInfo.type,
                fieldValue,
                validatedIds
            );
            deleted = deleted || r;
        }

        return deleted;
    }

    async postProcess(
        model: string,
        data: any,
        operation: PolicyOperationKind,
        context: QueryContext
    ) {
        const relationFieldMap = new Map<string, string[]>();
        await this.collectRelationFields(model, data, relationFieldMap);
        const validatedIds = await this.checkIdsAgainstPolicy(
            relationFieldMap,
            operation,
            context
        );
        return this.sanitizeData(model, data, validatedIds);
    }
}
