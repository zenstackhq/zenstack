/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { FieldInfo, Service } from '../../types';
import { PrismaWriteActions, PrismaWriteActionType } from '../types';

export type NestedWriterVisitorAction<State = unknown> = (
    fieldInfo: FieldInfo,
    action: PrismaWriteActionType,
    fieldData: any,
    parentData: any,
    state: State
) => Promise<State | undefined>;

export class NestedWriteVisitor<State> {
    constructor(private readonly service: Service) {}

    private isPrismaWriteAction(value: string): value is PrismaWriteActionType {
        return PrismaWriteActions.includes(value as PrismaWriteActionType);
    }

    async visit(
        model: string,
        fieldData: any,
        parentData: any,
        state: State,
        action: NestedWriterVisitorAction<State>
    ): Promise<void> {
        if (!fieldData) {
            return;
        }

        for (const [field, payload] of Object.entries<any>(fieldData)) {
            if (!payload) {
                continue;
            }

            const fieldInfo = await this.service.resolveField(model, field);
            if (!fieldInfo) {
                continue;
            }

            if (!fieldInfo.isDataModel) {
                await action(fieldInfo, 'none', payload, fieldData, state);
            } else {
                // deal with nested write of other data model
                for (const [subkey, subPayload] of Object.entries<any>(
                    payload
                )) {
                    if (this.isPrismaWriteAction(subkey) && subPayload) {
                        const newState = await action(
                            fieldInfo,
                            subkey,
                            subPayload,
                            payload,
                            state
                        );
                        if (newState) {
                            // recurse into content
                            await this.visit(
                                fieldInfo.type,
                                subPayload,
                                payload,
                                newState,
                                action
                            );
                        }
                    }
                }
            }
        }
    }
}
