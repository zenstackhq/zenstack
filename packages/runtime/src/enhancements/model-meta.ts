import { camelCase } from 'change-case';
import { ModelMeta } from './types';

export function getDefaultModelMeta(): ModelMeta {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('.zenstack/model-meta').default;
    } catch {
        throw new Error('Model meta definition cannot be loaded');
    }
}

export function resolveField(modelMeta: ModelMeta, model: string, field: string) {
    return modelMeta.fields[camelCase(model)][field];
}
