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
