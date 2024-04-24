import { lowerCaseFirst } from 'lower-case-first';
import { requireField, type ModelInfo, type ModelMeta } from '.';

/**
 * Gets field names in a data model entity, filtering out internal fields.
 */
export function getModelFields(data: object) {
    return data ? Object.keys(data) : [];
}

/**
 * Array or scalar
 */
export type Enumerable<T> = T | Array<T>;

/**
 * Uniformly enumerates an array or scalar.
 */
export function enumerate<T>(x: Enumerable<T>) {
    if (x === null || x === undefined) {
        return [];
    } else if (Array.isArray(x)) {
        return x;
    } else {
        return [x];
    }
}

/**
 * Zip two arrays or scalars.
 */
export function zip<T1, T2>(x: Enumerable<T1>, y: Enumerable<T2>): Array<[T1, T2]> {
    if (Array.isArray(x)) {
        if (!Array.isArray(y)) {
            throw new Error('x and y should be both array or both scalar');
        }
        if (x.length !== y.length) {
            throw new Error('x and y should have the same length');
        }
        return x.map((_, i) => [x[i], y[i]] as [T1, T2]);
    } else {
        if (Array.isArray(y)) {
            throw new Error('x and y should be both array or both scalar');
        }
        return [[x, y]];
    }
}

export function getIdFields(modelMeta: ModelMeta, model: string, throwIfNotFound = false) {
    const uniqueConstraints = modelMeta.models[lowerCaseFirst(model)]?.uniqueConstraints ?? {};

    const entries = Object.values(uniqueConstraints);
    if (entries.length === 0) {
        if (throwIfNotFound) {
            throw new Error(`Model ${model} does not have any id field`);
        }
        return [];
    }

    return entries[0].fields.map((f) => requireField(modelMeta, model, f));
}

export function getModelInfo<Throw extends boolean = false>(
    modelMeta: ModelMeta,
    model: string,
    throwIfNotFound: Throw = false as Throw
): Throw extends true ? ModelInfo : ModelInfo | undefined {
    const info = modelMeta.models[lowerCaseFirst(model)];
    if (!info && throwIfNotFound) {
        throw new Error(`Unable to load info for ${model}`);
    }
    return info;
}

export function isDelegateModel(modelMeta: ModelMeta, model: string) {
    return !!getModelInfo(modelMeta, model)?.attributes?.some((attr) => attr.name === '@@delegate');
}
