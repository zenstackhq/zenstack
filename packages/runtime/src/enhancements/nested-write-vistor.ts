/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FieldInfo, PrismaWriteActionType, PrismaWriteActions } from '../types';
import { resolveField } from './model-meta';
import { ModelMeta } from './types';
import { Enumerable, ensureArray, getModelFields } from './utils';

/**
 * Context for visiting
 */
export type VisitorContext = {
    /**
     * Parent data, can be used to replace fields
     */
    parent: any;

    /**
     * Current field, undefined if toplevel
     */
    field?: FieldInfo;

    /**
     * A top-down path of all nested update conditions and corresponding field till now
     */
    nestingPath: { field?: FieldInfo; where: any }[];
};

/**
 * NestedWriteVisitor's callback actions
 */
export type NestedWriterVisitorCallback = {
    create?: (model: string, args: any[], context: VisitorContext) => Promise<void>;

    connectOrCreate?: (
        model: string,
        args: Enumerable<{ where: object; create: any }>,
        context: VisitorContext
    ) => Promise<void>;

    update?: (model: string, args: Enumerable<{ where: object; data: any }>, context: VisitorContext) => Promise<void>;

    updateMany?: (
        model: string,
        args: Enumerable<{ where?: object; data: any }>,
        context: VisitorContext
    ) => Promise<void>;

    upsert?: (
        model: string,
        args: Enumerable<{ where: object; create: any; update: any }>,
        context: VisitorContext
    ) => Promise<void>;

    delete?: (model: string, args: Enumerable<object> | boolean, context: VisitorContext) => Promise<void>;

    deleteMany?: (model: string, args: Enumerable<object>, context: VisitorContext) => Promise<void>;

    field?: (field: FieldInfo, action: PrismaWriteActionType, data: any, context: VisitorContext) => Promise<void>;
};

/**
 * Recursive visitor for nested write (create/update) payload
 */
export class NestedWriteVisitor {
    constructor(private readonly modelMeta: ModelMeta, private readonly callback: NestedWriterVisitorCallback) {}

    private isPrismaWriteAction(value: string): value is PrismaWriteActionType {
        return PrismaWriteActions.includes(value as PrismaWriteActionType);
    }

    /**
     * Start visiting
     *
     * @see NestedWriterVisitorCallback
     */
    async visit(model: string, action: PrismaWriteActionType, args: any): Promise<void> {
        if (!args) {
            return;
        }

        let topData = args;
        // const topWhere = { ...topData.where };

        switch (action) {
            // create has its data wrapped in 'data' field
            case 'create':
                topData = topData.data;
                break;

            case 'delete':
            case 'deleteMany':
                topData = topData.where;
                break;
        }

        // const initialPath = [
        //     {
        //         field: undefined,
        //         where: topWhere,
        //     },
        // ];

        await this.doVisit(model, action, topData, undefined, undefined, []);
    }

    private async doVisit(
        model: string,
        action: PrismaWriteActionType,
        data: any,
        parent: any,
        field: FieldInfo | undefined,
        nestingPath: { field?: FieldInfo; where: any }[]
    ): Promise<void> {
        if (!data) {
            return;
        }

        const fieldContainers: any[] = [];
        const isToOneUpdate = field?.isDataModel && !field.isArray;
        const context = { parent, field, nestingPath: [...nestingPath] };

        // visit payload
        switch (action) {
            case 'create':
                context.nestingPath.push({ field, where: {} });
                if (this.callback.create) {
                    await this.callback.create(model, data, context);
                }
                fieldContainers.push(...ensureArray(data));
                break;

            case 'createMany':
                // skip the 'data' layer so as to keep consistency with 'create'
                if (data.data) {
                    context.nestingPath.push({ field, where: {} });
                    if (this.callback.create) {
                        await this.callback.create(model, data.data, context);
                    }
                    fieldContainers.push(...ensureArray(data.data));
                }
                break;

            case 'connectOrCreate':
                context.nestingPath.push({ field, where: data.where });
                if (this.callback.connectOrCreate) {
                    await this.callback.connectOrCreate(model, data, context);
                }
                fieldContainers.push(...ensureArray(data).map((d) => d.create));
                break;

            case 'update':
                context.nestingPath.push({ field, where: data.where });
                if (this.callback.update) {
                    await this.callback.update(model, data, context);
                }
                fieldContainers.push(...ensureArray(data).map((d) => (isToOneUpdate ? d : d.data)));
                break;

            case 'updateMany':
                context.nestingPath.push({ field, where: data.where });
                if (this.callback.updateMany) {
                    await this.callback.updateMany(model, data, context);
                }
                fieldContainers.push(...ensureArray(data));
                break;

            case 'upsert':
                context.nestingPath.push({ field, where: data.where });
                if (this.callback.upsert) {
                    await this.callback.upsert(model, data, context);
                }
                fieldContainers.push(...ensureArray(data).map((d) => d.create));
                fieldContainers.push(...ensureArray(data).map((d) => d.update));
                break;

            case 'delete':
                context.nestingPath.push({ field, where: data.where });
                if (this.callback.delete) {
                    await this.callback.delete(model, data, context);
                }
                break;

            case 'deleteMany':
                context.nestingPath.push({ field, where: data.where });
                if (this.callback.deleteMany) {
                    await this.callback.deleteMany(model, data, context);
                }
                break;

            default: {
                throw new Error(`unhandled action type ${action}`);
            }
        }

        for (const fieldContainer of fieldContainers) {
            for (const field of getModelFields(fieldContainer)) {
                const fieldInfo = resolveField(this.modelMeta, model, field);
                if (!fieldInfo) {
                    continue;
                }

                if (fieldInfo.isDataModel) {
                    // recurse into nested payloads
                    for (const [subAction, subData] of Object.entries<any>(fieldContainer[field])) {
                        if (this.isPrismaWriteAction(subAction) && subData) {
                            await this.doVisit(fieldInfo.type, subAction, subData, fieldContainer[field], fieldInfo, [
                                ...context.nestingPath,
                            ]);
                        }
                    }
                } else {
                    // visit plain field
                    if (this.callback.field) {
                        await this.callback.field(fieldInfo, action, fieldContainer[field], {
                            parent: fieldContainer,
                            nestingPath: [...context.nestingPath],
                            field: fieldInfo,
                        });
                    }
                }
            }
        }
    }
}
