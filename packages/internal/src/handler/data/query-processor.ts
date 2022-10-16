import deepcopy from 'deepcopy';
import { PolicyOperationKind, QueryContext, Service } from '../../types';

export class QueryProcessor {
    constructor(private readonly service: Service) {}

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
                throw Error(
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
            !!fieldValue &&
            !Array.isArray(fieldValue) &&
            typeof fieldValue === 'object' &&
            typeof fieldValue.id == 'string'
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

                const processedArgs = this.processQueryArgs(
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
    ) {
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
            }

            await this.sanitizeData(fieldInfo.type, fieldValue, validatedIds);
        }
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
        await this.sanitizeData(model, data, validatedIds);
    }
}
