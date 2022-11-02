/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { FieldInfo, PolicyOperationKind, Service } from '../../types';
import { PrismaWriteActions, PrismaWriteActionType } from '../types';

export type NestedWriterVisitorAction<State = unknown> = (
    fieldInfo: FieldInfo,
    action: PrismaWriteActionType,
    writeData: any,
    state: State,
    ops: PolicyOperationKind[]
) => Promise<State | undefined>;

export class NestedWriteVisitor<State> {
    constructor(private readonly service: Service) {}

    private mapActionToOperationKind(
        action: PrismaWriteActionType,
        writeData: any
    ): PolicyOperationKind[] {
        switch (action) {
            case 'create':
            case 'createMany':
                return ['create'];
            case 'connectOrCreate':
                return writeData.create ? ['create'] : [];
            case 'update':
            case 'updateMany':
                return ['update'];
            case 'upsert': {
                const ops: PolicyOperationKind[] = [];
                if (writeData.create) {
                    ops.push('create');
                }
                if (writeData.update) {
                    ops.push('update');
                }
                return ops;
            }
            case 'delete':
            case 'deleteMany':
                return ['delete'];
            default:
                console.warn(`Unsupported Prisma write action: ${action}`);
                return [];
        }
    }

    private isPrismaWriteAction(value: string): value is PrismaWriteActionType {
        return PrismaWriteActions.includes(value as PrismaWriteActionType);
    }

    async visit(
        model: string,
        writeData: any,
        operations: PolicyOperationKind[],
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
                await action(fieldInfo, value, writeData, state, operations);
            } else {
                // deal with nested write of other data model
                for (const [subkey, subWriteData] of Object.entries<any>(
                    value
                )) {
                    if (this.isPrismaWriteAction(subkey) && subWriteData) {
                        const ops = this.mapActionToOperationKind(
                            subkey,
                            subWriteData
                        );
                        if (ops.length > 0) {
                            const newState = await action(
                                fieldInfo,
                                subkey,
                                subWriteData,
                                state,
                                ops
                            );
                            if (newState) {
                                // recurse into content
                                await this.visit(
                                    fieldInfo.type,
                                    subWriteData,
                                    ops,
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
}
