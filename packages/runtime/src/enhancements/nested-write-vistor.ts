/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FieldInfo, PrismaWriteActionType, PrismaWriteActions } from '../types';
import { resolveField } from './model-meta';
import { ModelMeta } from './types';
import { Enumerable, ensureArray, getModelFields } from './utils';

export type VisitorContext = {
    parent: any;
    field?: FieldInfo;
    updateStack: any[];
};

/**
 * Visitor callback function type
 *
 * @fieldInfo current visiting field
 * @action prisma action for this field, e.g., update, create, etc.
 * @fieldData data attached to the field, a scalar type for simple field
 * and nested structure for model field
 * @parentData parent data of @see fieldData, can be used to replace current field data
 * @state a custom state
 *
 * @return if a truthy value is returned, recursive visiting will continue and the return
 * value will be used as the new state passed to visiting of the direct child level; otherwise
 * visiting is stopped at this level
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

        await this.doVisit(model, action, topData, undefined, undefined, []);
    }

    private async doVisit(
        model: string,
        action: PrismaWriteActionType,
        data: any,
        parent: any,
        field: FieldInfo | undefined,
        updateStack: object[]
    ): Promise<void> {
        if (!data) {
            return;
        }

        const fieldContainers: any[] = [];
        const isToOneUpdate = field?.isDataModel && !field.isArray;
        const context = { parent, field, updateStack };

        switch (action) {
            case 'create':
                if (this.callback.create) {
                    await this.callback.create(model, data, context);
                }
                fieldContainers.push(...ensureArray(data));
                break;

            case 'createMany':
                // skip the 'data' layer so as to keep consistency with 'create'
                if (data.data) {
                    if (this.callback.create) {
                        await this.callback.create(model, data.data, context);
                    }
                    fieldContainers.push(...ensureArray(data.data));
                }
                break;

            case 'connectOrCreate':
                if (this.callback.connectOrCreate) {
                    await this.callback.connectOrCreate(model, data, context);
                }
                fieldContainers.push(...ensureArray(data).map((d) => d.create));
                break;

            case 'update':
                if (this.callback.update) {
                    await this.callback.update(model, data, context);
                }
                updateStack.push(data);
                fieldContainers.push(...ensureArray(data).map((d) => (isToOneUpdate ? d : d.data)));
                break;

            case 'updateMany':
                if (this.callback.updateMany) {
                    await this.callback.updateMany(model, data, context);
                }
                fieldContainers.push(...ensureArray(data));
                break;

            case 'upsert':
                if (this.callback.upsert) {
                    await this.callback.upsert(model, data, context);
                }
                fieldContainers.push(...ensureArray(data).map((d) => d.create));
                fieldContainers.push(...ensureArray(data).map((d) => d.update));
                break;

            case 'delete':
                if (this.callback.delete) {
                    await this.callback.delete(model, data, context);
                }
                break;

            case 'deleteMany':
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
                    for (const [subAction, subData] of Object.entries<any>(fieldContainer[field])) {
                        if (this.isPrismaWriteAction(subAction) && subData) {
                            await this.doVisit(
                                fieldInfo.type,
                                subAction,
                                subData,
                                fieldContainer[field],
                                fieldInfo,
                                updateStack
                            );
                        }
                    }
                } else {
                    if (this.callback.field) {
                        await this.callback.field(fieldInfo, action, fieldContainer[field], {
                            parent: fieldContainer,
                            updateStack,
                            field: fieldInfo,
                        });
                    }
                }
            }
        }
    }
}
