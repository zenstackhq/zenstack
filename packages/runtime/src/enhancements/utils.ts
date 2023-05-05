import { AUXILIARY_FIELDS } from '@zenstackhq/sdk';
import * as util from 'util';
import { ModelMeta } from './types';
import { camelCase } from 'change-case';

/**
 * Wraps a value into array if it's not already one
 */
export function ensureArray<T>(value: T): T[] {
    return Array.isArray(value) ? value : [value];
}

/**
 * Gets field names in a data model entity, filtering out internal fields.
 */
export function getModelFields(data: object) {
    return data ? Object.keys(data).filter((f) => !AUXILIARY_FIELDS.includes(f)) : [];
}

/**
 * Gets id fields for the given model.
 */
export function getIdFields(modelMeta: ModelMeta, model: string) {
    const fields = modelMeta.fields[camelCase(model)];
    if (!fields) {
        throw new Error(`Unable to load fields for ${model}`);
    }
    const result = Object.values(fields).filter((f) => f.isId);
    if (result.length === 0) {
        throw new Error(`model ${model} does not have an id field`);
    }
    return result;
}

/**
 * Array or scalar
 */
export type Enumerable<T> = T | Array<T>;

/**
 * Uniformly enumerates an array or scalar.
 */
export function enumerate<T>(x: Enumerable<T>) {
    if (Array.isArray(x)) {
        return x;
    } else {
        return [x];
    }
}

/**
 * Formats an object for pretty printing.
 */
export function formatObject(value: unknown) {
    return util.formatWithOptions({ depth: 10 }, value);
}
