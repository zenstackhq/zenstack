/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { FieldInfo, Service } from '../../types';
import { PrismaWriteActions, PrismaWriteActionType } from '../types';

export type NestedWriterVisitorAction<State = unknown> = (
    fieldInfo: FieldInfo,
    action: PrismaWriteActionType,
    writeData: any,
    state: State
) => Promise<State | undefined>;

export class NestedWriteVisitor<State> {
    constructor(private readonly service: Service) {}

    private isPrismaWriteAction(value: string): value is PrismaWriteActionType {
        return PrismaWriteActions.includes(value as PrismaWriteActionType);
    }

    async visit(
        model: string,
        writeData: any,
        state: State,
        action: NestedWriterVisitorAction<State>
    ): Promise<void> {
        if (!writeData) {
            return;
        }

        for (const [field, value] of Object.entries<any>(writeData)) {
            if (!value) {
                continue;
            }

            const fieldInfo = await this.service.resolveField(model, field);
            if (!fieldInfo) {
                continue;
            }

            if (!fieldInfo.isDataModel) {
                await action(fieldInfo, value, writeData, state);
            } else {
                // deal with nested write of other data model
                for (const [subkey, subWriteData] of Object.entries<any>(
                    value
                )) {
                    if (this.isPrismaWriteAction(subkey) && subWriteData) {
                        const newState = await action(
                            fieldInfo,
                            subkey,
                            subWriteData,
                            state
                        );
                        if (newState) {
                            // recurse into content
                            await this.visit(
                                fieldInfo.type,
                                subWriteData,
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
