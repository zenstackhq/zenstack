/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import type { DbOperations, FieldInfo, PolicyOperationKind, QueryContext } from '../types';

/**
 * Metadata for a model-level unique constraint
 * e.g.: @@unique([a, b])
 */
export type UniqueConstraint = { name: string; fields: string[] };

/**
 * ZModel data model metadata
 */
export type ModelMeta = {
    fields: Record<string, Record<string, FieldInfo>>;
    uniqueConstraints: Record<string, Record<string, UniqueConstraint>>;
};

/**
 * Function for getting policy guard with a given context
 */
export type PolicyFunc = (context: QueryContext, db: Record<string, DbOperations>) => object;

/**
 * Function for getting policy guard with a given context
 */
export type InputCheckFunc = (args: any, context: QueryContext) => boolean;

/**
 * Policy definition
 */
export type PolicyDef = {
    // Prisma query guards
    guard: Record<
        string,
        {
            allowAll?: boolean;
            denyAll?: boolean;
        } & Partial<Record<PolicyOperationKind, PolicyFunc>> & {
                create_input: InputCheckFunc;
            } & {
                preValueSelect?: object;
            }
    >;
    validation: Record<string, { hasValidation: boolean }>;
};

/**
 * Zod schemas for validation
 */
export type ZodSchemas = {
    models: Record<string, z.ZodSchema>;
    input: Record<string, Record<string, z.ZodSchema>>;
};
