import { isPlainObject } from 'is-plain-object';

/**
 * Clones the given object. Only arrays and plain objects are cloned. Other values are returned as is.
 */
export function clone<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((v) => clone(v)) as T;
    }

    if (typeof value === 'object') {
        if (!value || !isPlainObject(value)) {
            return value;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = {};
        for (const key of Object.keys(value)) {
            result[key] = clone(value[key as keyof T]);
        }
        return result;
    }

    return value;
}
