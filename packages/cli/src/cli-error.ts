/**
 * Error class for CLI execution failures.
 * Extends the built-in Error class to provide structured error handling
 * with optional error codes and context for debugging.
 */
export class CliError extends Error {
    /**
     * Optional error code for programmatic error handling.
     */
    public readonly code?: string;

    constructor(message: string, code?: string) {
        super(message);
        this.name = 'CliError';
        this.code = code;
        Error.captureStackTrace(this, this.constructor);
    }
}
