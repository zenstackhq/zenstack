import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';

export class ValidationError {
    constructor(public readonly message: string) {}
}

export function validate(validator: z.ZodType, data: unknown) {
    try {
        validator.parse(data);
    } catch (err) {
        throw new ValidationError(fromZodError(err as z.ZodError).message);
    }
}
