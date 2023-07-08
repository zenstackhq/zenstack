/* eslint-disable @typescript-eslint/no-var-requires */
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import { ModelMeta } from './types';

/**
 * Load model meta from standard location.
 */
export function getDefaultModelMeta(): ModelMeta {
    try {
        // normal load
        return require('.zenstack/model-meta').default;
    } catch {
        if (process.env.ZENSTACK_TEST === '1') {
            try {
                // special handling for running as tests, try resolving relative to CWD
                return require(path.join(process.cwd(), 'node_modules', '.zenstack', 'model-meta')).default;
            } catch {
                throw new Error('Model meta cannot be loaded. Please make sure "zenstack generate" has been run.');
            }
        }
        throw new Error('Model meta cannot be loaded. Please make sure "zenstack generate" has been run.');
    }
}

/**
 * Resolves a model field to its metadata. Returns undefined if not found.
 */
export function resolveField(modelMeta: ModelMeta, model: string, field: string) {
    return modelMeta.fields[lowerCaseFirst(model)][field];
}

/**
 * Gets all fields of a model.
 */
export function getFields(modelMeta: ModelMeta, model: string) {
    return modelMeta.fields[lowerCaseFirst(model)];
}
