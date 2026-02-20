import type { Dialect, Expression, ExpressionBuilder, KyselyConfig, OperandExpression } from 'kysely';
import type { GetModel, GetModelFields, GetModels, ProcedureDef, ScalarFields, SchemaDef } from '../schema';
import type { FilterPropertyToKind } from './constants';
import type { ClientContract, CRUD_EXT } from './contract';
import type { GetProcedureNames, ProcedureHandlerFunc } from './crud-types';
import type { BaseCrudDialect } from './crud/dialects/base-dialect';
import type { AllCrudOperations } from './crud/operations/base';
import type { AnyPlugin } from './plugin';
import type { ToKyselySchema } from './query-builder';

export type ZModelFunctionContext<Schema extends SchemaDef> = {
    /**
     * ZenStack client instance
     */
    client: ClientContract<Schema>;

    /**
     * Database dialect
     */
    dialect: BaseCrudDialect<Schema>;

    /**
     * The containing model name
     */
    model: GetModels<Schema>;

    /**
     * The alias name that can be used to refer to the containing model
     */
    modelAlias: string;

    /**
     * The CRUD operation being performed
     */
    operation: CRUD_EXT;
};

export type ZModelFunction<Schema extends SchemaDef> = (
    eb: ExpressionBuilder<ToKyselySchema<Schema>, keyof ToKyselySchema<Schema>>,
    args: Expression<any>[],
    context: ZModelFunctionContext<Schema>,
) => Expression<unknown>;

/**
 * Options for slicing ORM client's capabilities by including/excluding certain models, operations,
 * filters, etc.
 */
export type SlicingOptions<Schema extends SchemaDef> = {
    /**
     * Models to include in the client. If not specified, all models are included by default.
     */
    includedModels?: readonly GetModels<Schema>[];

    /**
     * Models to exclude from the client. Exclusion takes precedence over inclusion.
     */
    excludedModels?: readonly GetModels<Schema>[];

    /**
     * Model slicing options.
     */
    models?: {
        /**
         * Model-specific slicing options.
         */
        [Model in GetModels<Schema> as Uncapitalize<Model>]?: ModelSlicingOptions<Schema, Model>;
    } & {
        /**
         * Slicing options that apply to all models. Model-specific options will override these general
         * options if both are specified.
         */
        $all?: ModelSlicingOptions<Schema, GetModels<Schema>>;
    };

    /**
     * Procedures to include in the client. If not specified, all procedures are included by default.
     */
    includedProcedures?: readonly GetProcedureNames<Schema>[];

    /**
     * Procedures to exclude from the client. Exclusion takes precedence over inclusion.
     */
    excludedProcedures?: readonly GetProcedureNames<Schema>[];
};

/**
 * Kinds of filter operations.
 */
export type FilterKind = FilterPropertyToKind[keyof FilterPropertyToKind];

/**
 * Model slicing options.
 */
export type ModelSlicingOptions<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    /**
     * ORM query operations to include for the model. If not specified, all operations are included
     * by default.
     */
    includedOperations?: readonly AllCrudOperations[];

    /**
     * ORM query operations to exclude for the model. Exclusion takes precedence over inclusion.
     */
    excludedOperations?: readonly AllCrudOperations[];

    /**
     * Field-level slicing options.
     */
    fields?: {
        /**
         * Field-specific slicing options.
         */
        [Field in GetModelFields<Schema, Model>]?: FieldSlicingOptions;
    } & {
        /**
         * Field slicing options that apply to all fields. Field-specific options will override these
         * general options if both are specified.
         */
        $all?: FieldSlicingOptions;
    };
};

/**
 * Field slicing options.
 */
type FieldSlicingOptions = {
    /**
     * Filter kinds to include for the field. If not specified, all filter kinds are included by default.
     */
    includedFilterKinds?: readonly FilterKind[];

    /**
     * Filter kinds to exclude for the field. Exclusion takes precedence over inclusion.
     */
    excludedFilterKinds?: readonly FilterKind[];
};

/**
 * Partial ORM client options that defines customizable behaviors.
 */
export type QueryOptions<Schema extends SchemaDef> = {
    /**
     * Options for omitting fields in ORM query results.
     */
    omit?: OmitConfig<Schema>;

    /**
     * Whether to allow overriding omit settings at query time. Defaults to `true`. When set to `false`, a
     * query-time `omit` clause that sets the field to `false` (not omitting) will trigger a validation error.
     */
    allowQueryTimeOmitOverride?: boolean;

    /**
     * Options for slicing ORM client's capabilities by including/excluding certain models, operations, filters, etc.
     */
    slicing?: SlicingOptions<Schema>;
};

/**
 * ZenStack client options.
 */
export type ClientOptions<Schema extends SchemaDef> = QueryOptions<Schema> & {
    /**
     * Kysely dialect.
     */
    dialect: Dialect;

    /**
     * Custom function definitions.
     *
     * @private
     */
    functions?: Record<string, ZModelFunction<Schema>>;

    /**
     * Plugins.
     */
    plugins?: AnyPlugin[];

    /**
     * Logging configuration.
     */
    log?: KyselyConfig['log'];

    /**
     * Whether to automatically fix timezone for `DateTime` fields returned by node-pg. Defaults
     * to `true`.
     *
     * Node-pg has a terrible quirk that it interprets the date value as local timezone (as a
     * `Date` object) although for `DateTime` field the data in DB is stored in UTC.
     * @see https://github.com/brianc/node-postgres/issues/429
     */
    fixPostgresTimezone?: boolean;

    /**
     * Whether to enable input validations expressed with attributes like `@email`, `@regex`,
     * `@@validate`, etc. Defaults to `true`.
     */
    validateInput?: boolean;
} & (HasComputedFields<Schema> extends true
        ? {
              /**
               * Computed field definitions.
               */
              computedFields: ComputedFieldsOptions<Schema>;
          }
        : {}) &
    (HasProcedures<Schema> extends true
        ? {
              /**
               * Custom procedure definitions.
               */
              procedures: ProceduresOptions<Schema>;
          }
        : {});

/**
 * Config for omitting fields in ORM query results.
 */
export type OmitConfig<Schema extends SchemaDef> = {
    [Model in GetModels<Schema>]?: {
        [Field in GetModelFields<Schema, Model> as Field extends ScalarFields<Schema, Model> ? Field : never]?: boolean;
    };
};

export type ComputedFieldsOptions<Schema extends SchemaDef> = {
    [Model in GetModels<Schema> as 'computedFields' extends keyof GetModel<Schema, Model> ? Model : never]: {
        [Field in keyof Schema['models'][Model]['computedFields']]: Schema['models'][Model]['computedFields'][Field] extends infer Func
            ? Func extends (...args: any[]) => infer R
                ? (
                      // inject a first parameter for expression builder
                      p: ExpressionBuilder<ToKyselySchema<Schema>, Model>,
                      ...args: Parameters<Func>
                  ) => OperandExpression<R> // wrap the return type with Kysely `OperandExpression`
                : never
            : never;
    };
};

export type HasComputedFields<Schema extends SchemaDef> =
    string extends GetModels<Schema> ? false : keyof ComputedFieldsOptions<Schema> extends never ? false : true;

export type ProceduresOptions<Schema extends SchemaDef> = Schema extends {
    procedures: Record<string, ProcedureDef>;
}
    ? {
          [Key in GetProcedureNames<Schema>]: ProcedureHandlerFunc<Schema, Key>;
      }
    : {};

export type HasProcedures<Schema extends SchemaDef> = Schema extends {
    procedures: Record<string, ProcedureDef>;
}
    ? true
    : false;

/**
 * Extracts QueryOptions from an object with '$options' property.
 */
export type GetQueryOptions<T extends { $options: any }> = T['$options'];
