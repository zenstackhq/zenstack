import { z } from 'zod';
import { FieldInfo, PolicyOperationKind, QueryContext } from '../types';

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
export type PolicyFunc = (context: QueryContext) => object;

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
                preValueSelect?: object;
            }
    >;
};

/**
 * Zod schemas for validation
 */
export type ZodSchemas = Record<string, z.ZodSchema>;
