/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { PrismaWriteActions, PrismaWriteActionType, FieldInfo } from '../types';

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
 * @return if a truethy value is returned, recursive visiting will continue and the return
 * value will be used as the new state passed to visiting of the direct child level; otherwise
 * visiting is stopped at this level
 */
export type NestedWriterVisitorCallback<State = unknown> = (
    fieldInfo: FieldInfo,
    action: PrismaWriteActionType,
    fieldData: any,
    parentData: any,
    state: State
) => Promise<State | undefined>;

/**
 * Recursive visitor for nested write (create/update) payload
 */
export class NestedWriteVisitor<State> {
    constructor(private readonly resolveField: (model: string, field: string) => Promise<FieldInfo | undefined>) {}

    private isPrismaWriteAction(value: string): value is PrismaWriteActionType {
        return PrismaWriteActions.includes(value as PrismaWriteActionType);
    }

    /**
     * Start visiting
     *
     * @see NestedWriterVisitorCallback
     */
    async visit(
        model: string,
        fieldData: any,
        parentData: any,
        state: State,
        callback: NestedWriterVisitorCallback<State>
    ): Promise<void> {
        if (!fieldData) {
            return;
        }

        for (const [field, payload] of Object.entries<any>(fieldData)) {
            if (!payload) {
                continue;
            }

            const fieldInfo = await this.resolveField(model, field);
            if (!fieldInfo) {
                continue;
            }

            if (!fieldInfo.isDataModel) {
                // simple field, just call action
                await callback(fieldInfo, 'none', payload, fieldData, state);
            } else {
                // deal with nested write of other model, here payload is a
                // potentially nested structure like:
                //
                //     { update: { field: {...} } }
                //
                for (const [subKey, subPayload] of Object.entries<any>(payload)) {
                    if (this.isPrismaWriteAction(subKey) && subPayload) {
                        const newState = await callback(fieldInfo, subKey, subPayload, payload, state);
                        if (newState) {
                            // recurse into content
                            await this.visit(fieldInfo.type, subPayload, payload, newState, callback);
                        }
                    }
                }
            }
        }
    }
}
