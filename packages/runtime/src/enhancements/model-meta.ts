/* eslint-disable @typescript-eslint/no-var-requires */
import { lowerCaseFirst } from 'lower-case-first';
import { ModelMeta } from './types';
import path from 'path';

/**
 * Load model meta from standard location.
 */
export function getDefaultModelMeta(): ModelMeta {
    try {
        if (process.env.NODE_ENV === 'test') {
            return require(path.join(process.cwd(), 'node_modules', '.zenstack/model-meta'));
        } else {
            return require('.zenstack/model-meta').default;
        }
    } catch {
        throw new Error('Model meta cannot be loaded. Please make sure "zenstack generate" has been run.');
    }
}

/**
 * Resolves a model field to its metadata. Returns undefined if not found.
 */
export function resolveField(modelMeta: ModelMeta, model: string, field: string) {
    return modelMeta.fields[lowerCaseFirst(model)][field];
}
