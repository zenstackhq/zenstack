/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import type { CrudContract, PermissionCheckerContext, QueryContext } from '../types';

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

/**
 * Function for checking an entity's data for permission
 */
export type EntityCheckerFunc = (input: any, context: QueryContext) => boolean;

/**
 * Function for checking if an operation is possibly allowed.
 */
export type PermissionCheckerFunc = (context: PermissionCheckerContext) => PermissionCheckerConstraint;

/**
 * Supported checker constraint checking value types.
 */
export type ConstraintValueTypes = 'boolean' | 'number' | 'string';

/**
 * Free variable constraint
 */
export type VariableConstraint = { kind: 'variable'; name: string; type: ConstraintValueTypes };

/**
 * Constant value constraint
 */
export type ValueConstraint = {
    kind: 'value';
    value: number | boolean | string;
    type: ConstraintValueTypes;
};

/**
 * Terms for comparison constraints
 */
export type ComparisonTerm = VariableConstraint | ValueConstraint;

/**
 * Comparison constraint
 */
export type ComparisonConstraint = {
    kind: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
    left: ComparisonTerm;
    right: ComparisonTerm;
};

/**
 * Logical constraint
 */
export type LogicalConstraint = {
    kind: 'and' | 'or' | 'not';
    children: PermissionCheckerConstraint[];
};

/**
 * Operation allowability checking constraint
 */
export type PermissionCheckerConstraint =
    | ValueConstraint
    | VariableConstraint
    | ComparisonConstraint
    | LogicalConstraint;

/**
 * Policy definition
 */
export type PolicyDef = {
    // policy definitions for each model
    policy: Record<ModelName, ModelPolicyDef>;

    // tracks which models have data validation rules
    validation: Record<string, { hasValidation: boolean }>;

    // a { select: ... } object for fetching `auth()` fields needed for policy evaluation
    authSelector?: object;
};

type ModelName = string;
type FieldName = string;

/**
 * Policy definition for a model
 */
export type ModelPolicyDef = {
    /**
     * Model-level CRUD policies
     */
    modelLevel: ModelCrudDef;

    /**
     * Field-level CRUD policies
     */
    fieldLevel?: FieldCrudDef;
};

/**
 * CRUD policy definitions for a model
 */
export type ModelCrudDef = {
    read: ModelReadDef;
    create: ModelCreateDef;
    update: ModelUpdateDef;
    delete: ModelDeleteDef;
    postUpdate: ModelPostUpdateDef;
};

/**
 * Information for checking entity data outside of Prisma
 */
export type EntityChecker = {
    /**
     * Checker function
     */
    func: EntityCheckerFunc;

    /**
     * Selector for fetching entity data
     */
    selector?: object;
};

/**
 * Common policy definition for a CRUD operation
 */
type ModelCrudCommon = {
    /**
     * Prisma query guard or a constant condition
     */
    guard: PolicyFunc | boolean;

    /**
     * Additional checker function for checking policies outside of Prisma
     */
    /**
     * Additional checker function for checking policies outside of Prisma
     */
    entityChecker?: EntityChecker;

    /**
     * Permission checker function or a constant condition
     */
    permissionChecker?: PermissionCheckerFunc | boolean;
};

/**
 * Policy definition for reading a model
 */
type ModelReadDef = ModelCrudCommon;

/**
 * Policy definition for creating a model
 */
type ModelCreateDef = ModelCrudCommon & {
    /**
     * Create input validation function. Only generated when a create
     * can be approved or denied based on input values.
     */
    inputChecker?: EntityCheckerFunc | boolean;
};

/**
 * Policy definition for updating a model
 */
type ModelUpdateDef = ModelCrudCommon;

/**
 * Policy definition for deleting a model
 */
type ModelDeleteDef = ModelCrudCommon;

/**
 * Policy definition for post-update checking a model
 */
type ModelPostUpdateDef = Exclude<ModelCrudCommon, 'permissionChecker'> & {
    preUpdateSelector?: object;
};

/**
 * CRUD policy definitions for a field
 */
type FieldCrudDef = {
    /**
     * Field-level read policy
     */
    read: Record<FieldName, FieldReadDef>;

    /**
     * Field-level update policy
     */
    update: Record<FieldName, FieldUpdateDef>;
};

type FieldReadDef = {
    /**
     * Field-level Prisma query guard
     */
    guard?: PolicyFunc;

    /**
     * Entity checker
     */
    entityChecker?: EntityChecker;

    /**
     * Field-level read override Prisma query guard
     */
    overrideGuard?: PolicyFunc;

    /**
     * Entity checker for override policies
     */
    overrideEntityChecker?: EntityChecker;
};

type FieldUpdateDef = {
    /**
     * Field-level update Prisma query guard
     */
    guard?: PolicyFunc;

    /**
     * Additional entity checker
     */
    entityChecker?: EntityChecker;

    /**
     * Field-level update override Prisma query guard
     */
    overrideGuard?: PolicyFunc;

    /**
     * Additional entity checker for override policies
     */
    overrideEntityChecker?: EntityChecker;
};

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
