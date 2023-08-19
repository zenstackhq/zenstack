/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import {
    FIELD_LEVEL_POLICY_GUARD_SELECTOR,
    HAS_FIELD_LEVEL_POLICY_FLAG,
    PRE_UPDATE_VALUE_SELECTOR,
} from '../constants';
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
        {
            allowAll?: boolean;
            denyAll?: boolean;
        } & Partial<Record<PolicyOperationKind, PolicyFunc>> & {
                create_input: InputCheckFunc;
            } & {
                [PRE_UPDATE_VALUE_SELECTOR]?: object;
                [FIELD_LEVEL_POLICY_GUARD_SELECTOR]?: object;
            } & Record<string, ReadFieldCheckFunc | PolicyFunc> & {
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
