import { lowerCaseFirst } from 'lower-case-first';
import { ModelMeta } from './types';

/**
 * Load model meta from standard location.
 */
export function getDefaultModelMeta(): ModelMeta {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('.zenstack/model-meta').default;
    } catch {
        throw new Error('Model meta cannot be loaded');
    }
}

/**
 * Resolves a model field to its metadata. Returns undefined if not found.
 */
export function resolveField(modelMeta: ModelMeta, model: string, field: string) {
    return modelMeta.fields[lowerCaseFirst(model)][field];
}
