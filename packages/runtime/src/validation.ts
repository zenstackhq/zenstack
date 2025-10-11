import { z } from 'zod';
import { getZodErrorMessage } from './local-helpers';

/**
 * Error indicating violations of field-level constraints
 */
export class ValidationError {
    constructor(public readonly message: string) {}
}

/**
 * Validate the given data with the given zod schema (for field-level constraints)
 */
export function validate(validator: z.ZodType, data: unknown) {
    try {
        validator.parse(data);
    } catch (err) {
        throw new ValidationError(getZodErrorMessage(err as z.ZodError));
    }
}

/**
 * Check if the given object has all the given fields, not null or undefined
 * @param obj
 * @param fields
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasAllFields(obj: any, fields: string[]) {
    if (typeof obj !== 'object' || !obj) {
        return false;
    }
    return fields.every((f) => obj[f] !== undefined && obj[f] !== null);
}

/**
 * Check if the given objects have equal values for the given fields. Returns
 * false if either object is nullish or is not an object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function allFieldsEqual(obj1: any, obj2: any, fields: string[]) {
    if (!obj1 || !obj2 || typeof obj1 !== 'object' || typeof obj2 !== 'object') {
        return false;
    }
    return fields.every((f) => obj1[f] === obj2[f]);
}
