/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FieldInfo, ModelMeta } from './model-meta';
import { resolveField } from './model-meta';
import { MaybePromise, PrismaWriteActionType, PrismaWriteActions } from './types';
import { getModelFields } from './utils';

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
 * NestedWriteVisitor's callback actions. A call back function should return true or void to indicate
 * that the visitor should continue traversing its children, or false to stop. It can also return an object
 * to let the visitor traverse it instead of its original children.
 */
export type NestedWriterVisitorCallback = {
    create?: (model: string, data: any, context: NestedWriteVisitorContext) => MaybePromise<boolean | object | void>;

    createMany?: (
        model: string,
        args: { data: any; skipDuplicates?: boolean },
        context: NestedWriteVisitorContext
    ) => MaybePromise<boolean | object | void>;

    connectOrCreate?: (
        model: string,
        args: { where: object; create: any },
        context: NestedWriteVisitorContext
    ) => MaybePromise<boolean | object | void>;

    connect?: (
        model: string,
        args: object,
        context: NestedWriteVisitorContext
    ) => MaybePromise<boolean | object | void>;

    disconnect?: (
        model: string,
        args: object,
        context: NestedWriteVisitorContext
    ) => MaybePromise<boolean | object | void>;

    set?: (model: string, args: object, context: NestedWriteVisitorContext) => MaybePromise<boolean | object | void>;

    update?: (model: string, args: object, context: NestedWriteVisitorContext) => MaybePromise<boolean | object | void>;

    updateMany?: (
        model: string,
        args: { where?: object; data: any },
        context: NestedWriteVisitorContext
    ) => MaybePromise<boolean | object | void>;

    upsert?: (
        model: string,
        args: { where: object; create: any; update: any },
        context: NestedWriteVisitorContext
    ) => MaybePromise<boolean | object | void>;

    delete?: (
        model: string,
        args: object | boolean,
        context: NestedWriteVisitorContext
    ) => MaybePromise<boolean | object | void>;

    deleteMany?: (
        model: string,
        args: any | object,
        context: NestedWriteVisitorContext
    ) => MaybePromise<boolean | object | void>;

    field?: (
        field: FieldInfo,
        action: PrismaWriteActionType,
        data: any,
        context: NestedWriteVisitorContext
    ) => MaybePromise<void>;
};

/**
 * Recursive visitor for nested write (create/update) payload.
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
        nestingPath: NestingPathItem[]
    ): Promise<void> {
        if (!data) {
            return;
        }

        const toplevel = field == undefined;

        const context = { parent, field, nestingPath: [...nestingPath] };
        const pushNewContext = (field: FieldInfo | undefined, model: string, where: any, unique = false) => {
            return { ...context, nestingPath: [...context.nestingPath, { field, model, where, unique }] };
        };

        // visit payload
        switch (action) {
            case 'create':
                for (const item of this.enumerateReverse(data)) {
                    const newContext = pushNewContext(field, model, {});
                    let callbackResult: any;
                    if (this.callback.create) {
                        callbackResult = await this.callback.create(model, item, newContext);
                    }
                    if (callbackResult !== false) {
                        const subPayload = typeof callbackResult === 'object' ? callbackResult : item;
                        await this.visitSubPayload(model, action, subPayload, newContext.nestingPath);
                    }
                }
                break;

            case 'createMany':
            case 'createManyAndReturn':
                if (data) {
                    const newContext = pushNewContext(field, model, {});
                    let callbackResult: any;
                    if (this.callback.createMany) {
                        callbackResult = await this.callback.createMany(model, data, newContext);
                    }
                    if (callbackResult !== false) {
                        const subPayload = typeof callbackResult === 'object' ? callbackResult : data.data;
                        await this.visitSubPayload(model, action, subPayload, newContext.nestingPath);
                    }
                }
                break;

            case 'connectOrCreate':
                for (const item of this.enumerateReverse(data)) {
                    const newContext = pushNewContext(field, model, item.where);
                    let callbackResult: any;
                    if (this.callback.connectOrCreate) {
                        callbackResult = await this.callback.connectOrCreate(model, item, newContext);
                    }
                    if (callbackResult !== false) {
                        const subPayload = typeof callbackResult === 'object' ? callbackResult : item.create;
                        await this.visitSubPayload(model, action, subPayload, newContext.nestingPath);
                    }
                }
                break;

            case 'connect':
                if (this.callback.connect) {
                    for (const item of this.enumerateReverse(data)) {
                        const newContext = pushNewContext(field, model, item, true);
                        await this.callback.connect(model, item, newContext);
                    }
                }
                break;

            case 'disconnect':
                // disconnect has two forms:
                //   if relation is to-many, the payload is a unique filter object
                //   if relation is to-one, the payload can only be boolean `true`
                if (this.callback.disconnect) {
                    for (const item of this.enumerateReverse(data)) {
                        const newContext = pushNewContext(field, model, item, typeof item === 'object');
                        await this.callback.disconnect(model, item, newContext);
                    }
                }
                break;

            case 'set':
                if (this.callback.set) {
                    for (const item of this.enumerateReverse(data)) {
                        const newContext = pushNewContext(field, model, item, true);
                        await this.callback.set(model, item, newContext);
                    }
                }
                break;

            case 'update':
                for (const item of this.enumerateReverse(data)) {
                    const newContext = pushNewContext(field, model, item.where);
                    let callbackResult: any;
                    if (this.callback.update) {
                        callbackResult = await this.callback.update(model, item, newContext);
                    }
                    if (callbackResult !== false) {
                        const subPayload =
                            typeof callbackResult === 'object'
                                ? callbackResult
                                : typeof item.data === 'object'
                                ? item.data
                                : item;
                        await this.visitSubPayload(model, action, subPayload, newContext.nestingPath);
                    }
                }
                break;

            case 'updateMany':
                for (const item of this.enumerateReverse(data)) {
                    const newContext = pushNewContext(field, model, item.where);
                    let callbackResult: any;
                    if (this.callback.updateMany) {
                        callbackResult = await this.callback.updateMany(model, item, newContext);
                    }
                    if (callbackResult !== false) {
                        const subPayload = typeof callbackResult === 'object' ? callbackResult : item;
                        await this.visitSubPayload(model, action, subPayload, newContext.nestingPath);
                    }
                }
                break;

            case 'upsert': {
                for (const item of this.enumerateReverse(data)) {
                    const newContext = pushNewContext(field, model, item.where);
                    let callbackResult: any;
                    if (this.callback.upsert) {
                        callbackResult = await this.callback.upsert(model, item, newContext);
                    }
                    if (callbackResult !== false) {
                        if (typeof callbackResult === 'object') {
                            await this.visitSubPayload(model, action, callbackResult, newContext.nestingPath);
                        } else {
                            await this.visitSubPayload(model, action, item.create, newContext.nestingPath);
                            await this.visitSubPayload(model, action, item.update, newContext.nestingPath);
                        }
                    }
                }
                break;
            }

            case 'delete': {
                if (this.callback.delete) {
                    for (const item of this.enumerateReverse(data)) {
                        const newContext = pushNewContext(field, model, toplevel ? item.where : item);
                        await this.callback.delete(model, item, newContext);
                    }
                }
                break;
            }

            case 'deleteMany':
                if (this.callback.deleteMany) {
                    for (const item of this.enumerateReverse(data)) {
                        const newContext = pushNewContext(field, model, toplevel ? item.where : item);
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
                if (payload[field]) {
                    // recurse into nested payloads
                    for (const [subAction, subData] of Object.entries<any>(payload[field])) {
                        if (this.isPrismaWriteAction(subAction) && subData) {
                            await this.doVisit(fieldInfo.type, subAction, subData, payload[field], fieldInfo, [
                                ...nestingPath,
                            ]);
                        }
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

    // enumerate a (possible) array in reverse order, so that the enumeration
    // callback can safely delete the current item
    private *enumerateReverse(data: any) {
        if (Array.isArray(data)) {
            for (let i = data.length - 1; i >= 0; i--) {
                yield data[i];
            }
        } else {
            yield data;
        }
    }
}
