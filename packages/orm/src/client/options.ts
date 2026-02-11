import type { Dialect, Expression, ExpressionBuilder, KyselyConfig } from 'kysely';
import type { GetModel, GetModelFields, GetModels, ProcedureDef, ScalarFields, SchemaDef } from '../schema';
import type { PrependParameter } from '../utils/type-utils';
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
 * fields, or filter kinds.
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
        [Model in GetModels<Schema>]?: ModelSlicingOptions<Schema, Model>;
    } & {
        /**
         * Slicing options that apply to all models. Model-specific options will override these general
         * options if both are specified.
         */
        $all?: ModelSlicingOptions<Schema, GetModels<Schema>>;
    };
};

type FilterKinds = 'Equality' | 'Range' | 'List' | 'Like' | 'Relation';

/**
 * Model slicing options.
 */
type ModelSlicingOptions<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    /**
     * ORM query operations to include for the model. If not specified, all operations are included
     * by default.
     */
    includedOperations?: readonly AllCrudOperations[];

    /**
     * ORM query operations to exclude for the model. Exclusion takes precedence over inclusion.
     */
    excludedOperations?: readonly AllCrudOperations[];

    includedFilterKinds?: readonly FilterKinds[];
    excludedFilterKinds?: readonly FilterKinds[];

    fields?: {
        [Field in GetModelFields<Schema, Model>]?: ModelFieldSlicingOptions<Schema, Model, Field>;
    };
};

type ModelFieldSlicingOptions<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    _Field extends GetModelFields<Schema, Model>,
> = {
    /**
     * Set to `true` to exclude the field from query results by default. Omitted fields can be re-included at
     * query time with an `omit` clause.
     */
    omit?: boolean;

    /**
     * Marks the field as ignored. Contrary to omitted fields, ignored fields are completely unaccessible
     * by the ORM client.
     */
    ignore?: boolean;
};

/**
 * ZenStack client options.
 */
export type ClientOptions<Schema extends SchemaDef> = {
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

    /**
     * Options for slicing ORM client's capabilities by including/excluding certain models, operations, filters, etc.
     */
    slicing?: SlicingOptions<Schema>;

    /**
     * Options for omitting fields in ORM query results.
     *
     * @deprecated Use {@link slicing} options instead.
     */
    omit?: OmitConfig<Schema>;

    /**
     * Whether to allow overriding omit settings at query time. Defaults to `true`. When set to `false`, a
     * query-time `omit` clause that sets the field to `false` (not omitting) will trigger a validation error.
     *
     * @deprecated Use {@link slicing} options instead.
     */
    allowQueryTimeOmitOverride?: boolean;
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
        [Field in keyof Schema['models'][Model]['computedFields']]: PrependParameter<
            ExpressionBuilder<ToKyselySchema<Schema>, Model>,
            Schema['models'][Model]['computedFields'][Field]
        >;
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
 * Subset of client options relevant to query operations.
 */
export type QueryOptions<Schema extends SchemaDef> = Pick<ClientOptions<Schema>, 'omit' | 'slicing'>;

/**
 * Extract QueryOptions from ClientOptions
 */
export type ToQueryOptions<T extends ClientOptions<any>> = Pick<T, 'omit' | 'slicing'>;
