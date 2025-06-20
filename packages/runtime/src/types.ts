/* eslint-disable @typescript-eslint/no-explicit-any */

import type { z } from 'zod';
import { FieldInfo } from './cross';

export type PrismaPromise<T> = Promise<T> & Record<string, (args?: any) => PrismaPromise<any>>;

/**
 * Weakly-typed database access methods
 */
export interface DbOperations {
    findMany(args?: unknown): Promise<any[]>;
    findFirst(args?: unknown): PrismaPromise<any>;
    findFirstOrThrow(args?: unknown): PrismaPromise<any>;
    findUnique(args: unknown): PrismaPromise<any>;
    findUniqueOrThrow(args: unknown): PrismaPromise<any>;
    create(args: unknown): Promise<any>;
    createMany(args: unknown): Promise<{ count: number }>;
    createManyAndReturn(args: unknown): Promise<unknown[]>;
    update(args: unknown): Promise<any>;
    updateMany(args: unknown): Promise<{ count: number }>;
    updateManyAndReturn(args: unknown): Promise<unknown[]>;
    upsert(args: unknown): Promise<any>;
    delete(args: unknown): Promise<any>;
    deleteMany(args?: unknown): Promise<{ count: number }>;
    aggregate(args: unknown): Promise<any>;
    groupBy(args: unknown): Promise<any>;
    count(args?: unknown): Promise<any>;
    subscribe(args?: unknown): Promise<any>;
    stream(args?: unknown): Promise<any>;
    check(args: unknown): Promise<boolean>;
    fields: Record<string, any>;
}

/**
 * Kinds of access policy
 */
export type PolicyKind = 'allow' | 'deny';

export type PolicyCrudKind = 'read' | 'create' | 'update' | 'delete';

/**
 * Kinds of operations controlled by access policies
 */
export type PolicyOperationKind = PolicyCrudKind | 'postUpdate';

/**
 * Current login user info
 */
export type AuthUser = Record<string, unknown>;

/**
 * Context for database query
 */
export type QueryContext = {
    /**
     * Current login user (provided by @see RequestHandlerOptions)
     */
    user?: AuthUser;

    /**
     * Pre-update value of the entity
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preValue?: any;
};

/**
 * Context for checking operation allowability.
 */
export type PermissionCheckerContext = {
    /**
     * Current user
     */
    user?: AuthUser;

    /**
     * Extra field value filters.
     */
    fieldValues?: Record<string, string | number | boolean>;
};

/**
 * Prisma contract for CRUD operations.
 */
export type CrudContract = Record<string, DbOperations>;

/**
 * Prisma contract for database client.
 */
export type DbClientContract = CrudContract & {
    $transaction: <T>(action: (tx: CrudContract) => Promise<T>, options?: unknown) => Promise<T>;
};

/**
 * Transaction isolation levels: https://www.prisma.io/docs/orm/prisma-client/queries/transactions#transaction-isolation-level
 */
export type TransactionIsolationLevel =
    | 'ReadUncommitted'
    | 'ReadCommitted'
    | 'RepeatableRead'
    | 'Snapshot'
    | 'Serializable';

/**
 * Options for enhancing a PrismaClient.
 */
export type EnhancementOptions = {
    /**
     * The kinds of enhancements to apply. By default all enhancements are applied.
     */
    kinds?: EnhancementKind[];

    /**
     * Whether to log Prisma query
     */
    logPrismaQuery?: boolean;

    /**
     * Hook for transforming errors before they are thrown to the caller.
     */
    errorTransformer?: ErrorTransformer;

    /**
     * The `maxWait` option passed to `prisma.$transaction()` call for transactions initiated by ZenStack.
     */
    transactionMaxWait?: number;

    /**
     * The `timeout` option passed to `prisma.$transaction()` call for transactions initiated by ZenStack.
     */
    transactionTimeout?: number;

    /**
     * The `isolationLevel` option passed to `prisma.$transaction()` call for transactions initiated by ZenStack.
     */
    transactionIsolationLevel?: TransactionIsolationLevel;

    /**
     * The encryption options for using the `encrypted` enhancement.
     */
    encryption?: SimpleEncryption | CustomEncryption;

    /**
     * Options for data validation.
     */
    validation?: ValidationOptions;
};

/**
 * Context for creating enhanced `PrismaClient`
 */
export type EnhancementContext<User extends AuthUser = AuthUser> = {
    user?: User;
};

/**
 * Kinds of enhancements to `PrismaClient`
 */
export type EnhancementKind = 'password' | 'omit' | 'policy' | 'validation' | 'delegate' | 'encryption';

/**
 * Function for transforming errors.
 */
export type ErrorTransformer = (error: unknown) => unknown;

/**
 * Zod schemas for validation
 */
export type ZodSchemas = {
    /**
     * Zod schema for each model
     */
    models: Record<string, z.ZodSchema>;

    /**
     * Zod schema for Prisma input types for each model
     */
    input?: Record<string, Record<string, z.ZodSchema>>;
};

/**
 * Simple encryption settings for processing fields marked with `@encrypted`.
 */
export type SimpleEncryption = {
    /**
     * The encryption key.
     */
    encryptionKey: Uint8Array;

    /**
     * Optional list of all decryption keys that were previously used to encrypt the data
     * , for supporting key rotation. The `encryptionKey` field value is automatically
     * included for decryption.
     *
     * When the encrypted data is persisted, a metadata object containing the digest of the
     * encryption key is stored alongside the data. This digest is used to quickly determine
     * the correct decryption key to use when reading the data.
     */
    decryptionKeys?: Uint8Array[];
};

/**
 * Custom encryption settings for processing fields marked with `@encrypted`.
 */
export type CustomEncryption = {
    /**
     * Encryption function.
     */
    encrypt: (model: string, field: FieldInfo, plain: string) => Promise<string>;

    /**
     * Decryption function
     */
    decrypt: (model: string, field: FieldInfo, cipher: string) => Promise<string>;
};

/**
 * Options for data validation.
 */
export type ValidationOptions = {
    /**
     * Whether to validate "update" operations based only on the input data. By default, ZenStack
     * validates the entity after a update operation completes (inside a transaction), and rejects
     * the operation if validation fails. This implies the entire entity needs to satisfy the
     * validation rules, even for fields that are not part of the update input data.
     *
     * You can use this option to toggle the behavior to only validate the input data.
     *
     * Default is `false`.
     */
    inputOnlyValidationForUpdate?: boolean;
};
