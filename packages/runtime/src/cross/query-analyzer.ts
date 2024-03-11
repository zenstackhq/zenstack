/* eslint-disable @typescript-eslint/no-explicit-any */
import { lowerCaseFirst } from 'lower-case-first';
import type { ModelMeta } from './model-meta';
import { NestedReadVisitor } from './nested-read-visitor';
import { NestedWriteVisitor } from './nested-write-visitor';
import type { PrismaWriteActionType } from './types';
import { getModelInfo } from './utils';

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

        // add models that are cascaded deleted recursively
        const addCascades = (model: string) => {
            const cascades = new Set<string>();
            const visited = new Set<string>();
            collectDeleteCascades(model, modelMeta, cascades, visited);
            cascades.forEach((m) => addModel(m));
        };

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
            delete: (model) => {
                addModel(model);
                addCascades(model);
            },
            deleteMany: (model) => {
                addModel(model);
                addCascades(model);
            },
        });
        await visitor.visit(model, operation, mutationArgs);
    }

    // include delegate base models recursively
    result.forEach((m) => {
        getBaseRecursively(m, modelMeta, result);
    });

    return [...result];
}

function collectDeleteCascades(model: string, modelMeta: ModelMeta, result: Set<string>, visited: Set<string>) {
    if (visited.has(model)) {
        // break circle
        return;
    }
    visited.add(model);

    const cascades = modelMeta.deleteCascade?.[lowerCaseFirst(model)];

    if (!cascades) {
        return;
    }

    cascades.forEach((m) => {
        result.add(m);
        collectDeleteCascades(m, modelMeta, result, visited);
    });
}

function getBaseRecursively(model: string, modelMeta: ModelMeta, result: Set<string>) {
    const bases = getModelInfo(modelMeta, model)?.baseTypes;
    if (bases) {
        bases.forEach((base) => {
            result.add(base);
            getBaseRecursively(base, modelMeta, result);
        });
    }
}
