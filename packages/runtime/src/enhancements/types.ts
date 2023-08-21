/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import type { DbOperations, FieldInfo, PolicyOperationKind, QueryContext } from '../types';
import {
    FIELD_LEVEL_READ_CHECKER_SELECTOR,
    PRE_UPDATE_VALUE_SELECTOR,
    FIELD_LEVEL_READ_CHECKER_PREFIX,
    FIELD_LEVEL_UPDATE_GUARD_PREFIX,
    HAS_FIELD_LEVEL_POLICY_FLAG,
} from '../constants';

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
 * Function for getting policy guard with a given context
 */
export type ReadFieldCheckFunc = (input: any, context: QueryContext) => boolean;

/**
 * Policy definition
 */
export type PolicyDef = {
    // Prisma query guards
    guard: Record<
        string,
        // policy operation guard functions
        Partial<Record<PolicyOperationKind, PolicyFunc | boolean>> &
            // 'create_input' checker function
            Partial<Record<`${PolicyOperationKind}_input`, InputCheckFunc | boolean>> &
            // field-level read checker functions or update guard functions
            Record<`${typeof FIELD_LEVEL_READ_CHECKER_PREFIX}${string}`, ReadFieldCheckFunc> &
            Record<`${typeof FIELD_LEVEL_UPDATE_GUARD_PREFIX}${string}`, PolicyFunc> & {
                // pre-update value selector
                [PRE_UPDATE_VALUE_SELECTOR]?: object;
                // field-level read checker selector
                [FIELD_LEVEL_READ_CHECKER_SELECTOR]?: object;
                // flag that indicates if the model has field-level access control
                [HAS_FIELD_LEVEL_POLICY_FLAG]?: boolean;
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
