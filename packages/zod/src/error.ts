/**
 * Error representing failures in Zod schema building.
 */
export class SchemaFactoryError extends Error {
    constructor(message: string) {
        super(message);
    }
}
