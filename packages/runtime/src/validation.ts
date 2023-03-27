import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';

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
        throw new ValidationError(fromZodError(err as z.ZodError).message);
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
