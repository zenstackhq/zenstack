/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import {
    FIELD_LEVEL_OVERRIDE_READ_GUARD_PREFIX,
    FIELD_LEVEL_OVERRIDE_UPDATE_GUARD_PREFIX,
    FIELD_LEVEL_READ_CHECKER_PREFIX,
    FIELD_LEVEL_READ_CHECKER_SELECTOR,
    FIELD_LEVEL_UPDATE_GUARD_PREFIX,
    HAS_FIELD_LEVEL_POLICY_FLAG,
    PRE_UPDATE_VALUE_SELECTOR,
} from '../constants';
import type { CheckerContext, CrudContract, PolicyCrudKind, PolicyOperationKind, QueryContext } from '../types';

/**
 * Common options for PrismaClient enhancements
 */
export interface CommonEnhancementOptions {
    /**
     * Path for loading CLI-generated code
     */
    loadPath?: string;

    /**
     * The `Prisma` module generated together with `PrismaClient`. You only need to
     * pass it when you specified a custom `PrismaClient` output path. The module can
     * be loaded like: `import { Prisma } from '<your PrismaClient output path>';`.
     */
    prismaModule?: any;
}

/**
 * Function for getting policy guard with a given context
 */
export type PolicyFunc = (context: QueryContext, db: CrudContract) => object;

export type CheckerFunc = (context: CheckerContext) => CheckerConstraint;

export type ConstraintValueTypes = 'boolean' | 'number' | 'string';

export type VariableConstraint = { kind: 'variable'; name: string; type: ConstraintValueTypes };

export type ValueConstraint = {
    kind: 'value';
    value: number | boolean | string;
    type: ConstraintValueTypes;
};

export type ComparisonTerm = VariableConstraint | ValueConstraint;

export type ComparisonConstraint = {
    kind: 'eq' | 'gt' | 'gte' | 'lt' | 'lte';
    left: ComparisonTerm;
    right: ComparisonTerm;
};

export type LogicalConstraint = {
    kind: 'and' | 'or' | 'not';
    children: CheckerConstraint[];
};

export type CheckerConstraint = ValueConstraint | VariableConstraint | ComparisonConstraint | LogicalConstraint;

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
            Record<
                | `${typeof FIELD_LEVEL_OVERRIDE_READ_GUARD_PREFIX}${string}`
                | `${typeof FIELD_LEVEL_UPDATE_GUARD_PREFIX}${string}`
                | `${typeof FIELD_LEVEL_OVERRIDE_UPDATE_GUARD_PREFIX}${string}`,
                PolicyFunc
            > & {
                // pre-update value selector
                [PRE_UPDATE_VALUE_SELECTOR]?: object;
                // field-level read checker selector
                [FIELD_LEVEL_READ_CHECKER_SELECTOR]?: object;
                // flag that indicates if the model has field-level access control
                [HAS_FIELD_LEVEL_POLICY_FLAG]?: boolean;
            }
    >;

    checker: Record<string, Record<PolicyCrudKind, CheckerFunc | boolean>>;

    // tracks which models have data validation rules
    validation: Record<string, { hasValidation: boolean }>;

    // a { select: ... } object for fetching `auth()` fields needed for policy evaluation
    authSelector?: object;
};

/**
 * Zod schemas for validation
 */
export type ZodSchemas = {
    models: Record<string, z.ZodSchema>;
    input?: Record<string, Record<string, z.ZodSchema>>;
};
