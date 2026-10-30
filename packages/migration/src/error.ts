/**
 * Reason code for migration errors.
 */
export enum MigrationErrorReason {
    /**
     * A required database driver package is not installed.
     */
    DRIVER_NOT_FOUND = 'driver-not-found',

    /**
     * The database provider is not supported.
     */
    UNSUPPORTED_PROVIDER = 'unsupported-provider',

    /**
     * A previously-applied migration file was modified (checksum mismatch).
     */
    MIGRATION_MODIFIED = 'migration-modified',

    /**
     * A migration file is malformed or does not export the expected API.
     */
    INVALID_MIGRATION = 'invalid-migration',

    /**
     * The requested operation is not valid in the current migration state.
     */
    INVALID_STATE = 'invalid-state',
}

/**
 * ZenStack migration engine error.
 */
export class MigrationError extends Error {
    constructor(
        public reason: MigrationErrorReason,
        message?: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }

    /**
     * The name of the migration that the error pertains to.
     */
    public migration?: string;
}
