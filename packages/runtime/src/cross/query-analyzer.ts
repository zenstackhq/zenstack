/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ModelMeta } from './model-meta';
import { NestedReadVisitor } from './nested-read-visitor';
import { NestedWriteVisitor } from './nested-write-visitor';
import type { PrismaWriteActionType } from './types';

// find nested reads that match the given models
/**
 * Gets models read (including nested ones) given a query args.
 * @param model
 * @param targetModels
 * @param modelMeta
 * @param args
 * @returns
 */
export function getReadModels(model: string, modelMeta: ModelMeta, args: any) {
    const result = new Set<string>();
    result.add(model);
    const visitor = new NestedReadVisitor(modelMeta, {
        field: (model) => {
            result.add(model);
            return true;
        },
    });
    visitor.visit(model, args);
    return [...result];
}

/**
 * Gets mutated models (including nested ones) given a mutation args.
 */
export async function getMutatedModels(
    model: string,
    operation: PrismaWriteActionType,
    mutationArgs: any,
    modelMeta: ModelMeta
) {
    const result = new Set<string>();
    result.add(model);

    if (mutationArgs) {
        const addModel = (model: string) => void result.add(model);
        const visitor = new NestedWriteVisitor(modelMeta, {
            create: addModel,
            createMany: addModel,
            connectOrCreate: addModel,
            connect: addModel,
            disconnect: addModel,
            set: addModel,
            update: addModel,
            updateMany: addModel,
            upsert: addModel,
            delete: addModel,
            deleteMany: addModel,
        });
        await visitor.visit(model, operation, mutationArgs);
    }

    return [...result];
}
