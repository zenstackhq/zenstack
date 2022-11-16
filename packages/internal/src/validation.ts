import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
export { ValidationError } from 'zod-validation-error';

export function validate(validator: z.ZodType, data: unknown) {
    try {
        validator.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) {
            throw fromZodError(err);
        } else {
            throw err;
        }
    }
}
