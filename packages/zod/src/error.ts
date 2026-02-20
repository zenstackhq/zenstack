/**
 * Error representing failures in Zod schema building.
 */
export class ZodSchemaError extends Error {
    constructor(message: string) {
        super(message);
    }
}
