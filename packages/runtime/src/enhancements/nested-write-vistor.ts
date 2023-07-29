/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FieldInfo, PrismaWriteActionType, PrismaWriteActions } from '../types';
import { resolveField } from './model-meta';
import { ModelMeta } from './types';
import { enumerate, getModelFields } from './utils';

type NestingPathItem = { field?: FieldInfo; model: string; where: any; unique: boolean };

/**
 * Context for visiting
 */
export type NestedWriteVisitorContext = {
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
    nestingPath: NestingPathItem[];
};

/**
 * NestedWriteVisitor's callback actions
 */
export type NestedWriterVisitorCallback = {
    create?: (model: string, args: any[], context: NestedWriteVisitorContext) => Promise<boolean | void>;

    connectOrCreate?: (
        model: string,
        args: { where: object; create: any },
        context: NestedWriteVisitorContext
    ) => Promise<boolean | void>;

    connect?: (model: string, args: object, context: NestedWriteVisitorContext) => Promise<boolean | void>;

    disconnect?: (model: string, args: object, context: NestedWriteVisitorContext) => Promise<boolean | void>;

    set?: (model: string, args: object, context: NestedWriteVisitorContext) => Promise<boolean | void>;

    update?: (
        model: string,
        args: { where: object; data: any },
        context: NestedWriteVisitorContext
    ) => Promise<boolean | void>;

    updateMany?: (
        model: string,
        args: { where?: object; data: any },
        context: NestedWriteVisitorContext
    ) => Promise<boolean | void>;

    upsert?: (
        model: string,
        args: { where: object; create: any; update: any },
        context: NestedWriteVisitorContext
    ) => Promise<boolean | void>;

    delete?: (model: string, args: object | boolean, context: NestedWriteVisitorContext) => Promise<boolean | void>;

    deleteMany?: (model: string, args: any | object, context: NestedWriteVisitorContext) => Promise<boolean | void>;

    field?: (
        field: FieldInfo,
        action: PrismaWriteActionType,
        data: any,
        context: NestedWriteVisitorContext
    ) => Promise<void>;
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

        await this.doVisit(model, action, topData, undefined, undefined, []);
    }

    private async doVisit(
        model: string,
        action: PrismaWriteActionType,
        data: any,
        parent: any,
        field: FieldInfo | undefined,
        nestingPath: NestingPathItem[]
    ): Promise<void> {
        if (!data) {
            return;
        }

        // const isToOneUpdate = field?.isDataModel && !field.isArray;
        const context = { parent, field, nestingPath: [...nestingPath] };
        const toplevel = field == undefined;

        // visit payload
        switch (action) {
            case 'create':
                context.nestingPath.push({ field, model, where: {}, unique: false });
                for (const item of enumerate(data)) {
                    let callbackResult: any;
                    if (this.callback.create) {
                        callbackResult = await this.callback.create(model, item, context);
                    }
                    if (callbackResult !== false) {
                        await this.visitSubPayload(model, action, item, context.nestingPath);
                    }
                }
                break;

            case 'createMany':
                // skip the 'data' layer so as to keep consistency with 'create'
                if (data.data) {
                    context.nestingPath.push({ field, model, where: {}, unique: false });
                    for (const item of enumerate(data.data)) {
                        let callbackResult: any;
                        if (this.callback.create) {
                            callbackResult = await this.callback.create(model, item, context);
                        }
                        if (callbackResult !== false) {
                            await this.visitSubPayload(model, action, item, context.nestingPath);
                        }
                    }
                }
                break;

            case 'connectOrCreate':
                context.nestingPath.push({ field, model, where: data.where, unique: false });
                for (const item of enumerate(data)) {
                    let callbackResult: any;
                    if (this.callback.connectOrCreate) {
                        callbackResult = await this.callback.connectOrCreate(model, item, context);
                    }
                    if (callbackResult !== false) {
                        await this.visitSubPayload(model, action, item.create, context.nestingPath);
                    }
                }
                break;

            case 'connect':
                if (this.callback.connect) {
                    for (const item of enumerate(data)) {
                        const newContext = {
                            ...context,
                            nestingPath: [...context.nestingPath, { field, model, where: item, unique: true }],
                        };
                        await this.callback.connect(model, item, newContext);
                    }
                }
                break;

            case 'disconnect':
                // disconnect has two forms:
                //   if relation is to-many, the payload is a unique filter object
                //   if relation is to-one, the payload can only be boolean `true`
                if (this.callback.disconnect) {
                    for (const item of enumerate(data)) {
                        const newContext = {
                            ...context,
                            nestingPath: [
                                ...context.nestingPath,
                                { field, model, where: item, unique: typeof item === 'object' },
                            ],
                        };
                        await this.callback.disconnect(model, item, newContext);
                    }
                }
                break;

            case 'set':
                context.nestingPath.push({ field, model, where: {}, unique: false });
                if (this.callback.set) {
                    await this.callback.set(model, data, context);
                }
                break;

            case 'update':
                context.nestingPath.push({ field, model, where: data.where, unique: false });
                for (const item of enumerate(data)) {
                    let callbackResult: any;
                    if (this.callback.update) {
                        callbackResult = await this.callback.update(model, item, context);
                    }
                    const payload = typeof item.data === 'object' ? item.data : item;
                    if (callbackResult !== false) {
                        await this.visitSubPayload(model, action, payload, context.nestingPath);
                    }
                }
                break;

            case 'updateMany':
                context.nestingPath.push({ field, model, where: data.where, unique: false });
                for (const item of enumerate(data)) {
                    let callbackResult: any;
                    if (this.callback.updateMany) {
                        callbackResult = await this.callback.updateMany(model, item, context);
                    }
                    if (callbackResult !== false) {
                        await this.visitSubPayload(model, action, item, context.nestingPath);
                    }
                }
                break;

            case 'upsert': {
                context.nestingPath.push({ field, model, where: data.where, unique: false });
                for (const item of enumerate(data)) {
                    let callbackResult: any;
                    if (this.callback.upsert) {
                        callbackResult = await this.callback.upsert(model, item, context);
                    }
                    if (callbackResult !== false) {
                        await this.visitSubPayload(model, action, item.create, context.nestingPath);
                        await this.visitSubPayload(model, action, item.update, context.nestingPath);
                    }
                }
                break;
            }

            case 'delete': {
                if (this.callback.delete) {
                    for (const item of enumerate(data)) {
                        const newContext = {
                            ...context,
                            nestingPath: [
                                ...context.nestingPath,
                                { field, model, where: toplevel ? item.where : item, unique: false },
                            ],
                        };
                        await this.callback.delete(model, item, newContext);
                    }
                }
                break;
            }

            case 'deleteMany':
                if (this.callback.deleteMany) {
                    for (const item of enumerate(data)) {
                        const newContext = {
                            ...context,
                            nestingPath: [
                                ...context.nestingPath,
                                { field, model, where: toplevel ? item.where : item, unique: false },
                            ],
                        };
                        await this.callback.deleteMany(model, item, newContext);
                    }
                }
                break;

            default: {
                throw new Error(`unhandled action type ${action}`);
            }
        }
    }

    private async visitSubPayload(
        model: string,
        action: PrismaWriteActionType,
        payload: any,
        nestingPath: NestingPathItem[]
    ) {
        for (const field of getModelFields(payload)) {
            const fieldInfo = resolveField(this.modelMeta, model, field);
            if (!fieldInfo) {
                continue;
            }

            if (fieldInfo.isDataModel) {
                // recurse into nested payloads
                for (const [subAction, subData] of Object.entries<any>(payload[field])) {
                    if (this.isPrismaWriteAction(subAction) && subData) {
                        await this.doVisit(fieldInfo.type, subAction, subData, payload[field], fieldInfo, [
                            ...nestingPath,
                        ]);
                    }
                }
            } else {
                // visit plain field
                if (this.callback.field) {
                    await this.callback.field(fieldInfo, action, payload[field], {
                        parent: payload,
                        nestingPath,
                        field: fieldInfo,
                    });
                }
            }
        }
    }
}
