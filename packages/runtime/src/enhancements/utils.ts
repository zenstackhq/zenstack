import { AUXILIARY_FIELDS } from '../constants';

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
    return Object.keys(data).filter((f) => !AUXILIARY_FIELDS.includes(f));
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
