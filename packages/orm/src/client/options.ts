import type {
    FieldIsArray,
    GetModelField,
    GetModelFields,
    GetModelFieldType,
    GetModels,
    ModelFieldIsOptional,
    ProcedureDef,
    ScalarFields,
    SchemaDef,
} from '@zenstackhq/schema';
import type { Dialect, Expression, ExpressionBuilder, KyselyConfig, OperandExpression } from 'kysely';
import type { FilterPropertyToKind } from './constants';
import type { ClientContract, CRUD_EXT } from './contract';
import type { ComputedFieldArgs, FieldHasComputedArgs, GetProcedureNames, ProcedureHandlerFunc } from './crud-types';
import type { BaseCrudDialect } from './crud/dialects/base-dialect';
import type { AllCrudOperations } from './crud/operations/base';
import type { AnyPlugin } from './plugin';
import type { ToKyselySchema } from './query-builder';
import type { WrapType } from '../utils/type-utils';

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
     * Type-checking options for query arguments.
     */
    typing?: {
        /**
         * Recursively rejects unknown properties in query arguments. This is opt-in because the
         * additional precision requires more work from the TypeScript checker.
         */
        exactQueryArgs?: boolean;
    };

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
 * Projects a (typically inferred) client options type down to only the members that influence
 * ORM typing - the {@link QueryOptions} fields (`typing`, `omit`, `allowQueryTimeOmitOverride`, `slicing`).
 *
 * The full options object inferred at `new ZenStackClient(...)` carries heavy function types for
 * `computedFields` and `procedures`. Those are never read by the model/operation types, but if the
 * raw options type is fanned out across every model's `ModelOperations` instantiation (30+ for a
 * typical schema) it inflates type checking dramatically. Projecting to the query-relevant subset
 * before the fan-out keeps the per-model types cheap while preserving full options on `$options`.
 */
export type QueryRelevantOptions<Schema extends SchemaDef, Options> = Pick<
    Options,
    Extract<keyof Options, keyof QueryOptions<Schema>>
>;

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
     * Logging configuration. Extends Kysely's log config with a `'warning'` level
     * for ZenStack-specific diagnostics (e.g., slow query warnings).
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
     * Whether to enable query args validation. Defaults to `true`.
     *
     * **USE WITH CAUTION**, as setting it to `false` will allow malformed input to pass through, causing
     * incorrect SQL generation or runtime errors. If you use validation attributes like `@email`, `@regex`,
     * etc., in ZModel, they will be ignored too.
     */
    validateInput?: boolean;

    /**
     * Whether to use compact alias names (e.g., "$$t1", "$$t2") when transforming ORM queries to SQL.
     * Defaults to `true`.
     *
     * When set to `false`, original aliases are kept unless temporary aliases become too long for
     * safe SQL identifier handling, in which case compact aliases are used as a fallback.
     */
    useCompactAliasNames?: boolean;

    /**
     * Whether to skip validation for whether all computed fields are properly defined.
     */
    skipValidationForComputedFields?: boolean;

    /**
     * Diagnostics related options.
     */
    diagnostics?: {
        /**
         * Threshold in milliseconds for determining slow queries. If not specified, no query will be considered slow.
         */
        slowQueryThresholdMs?: number;

        /**
         * Maximum number of slow query records to keep in memory. Defaults to `100`. When the number is exceeded, the
         * entry with the lowest duration will be removed. Set to `Infinity` to keep unlimited records.
         */
        slowQueryMaxRecords?: number;
    };
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
    [Model in GetModels<Schema> as Uncapitalize<Model>]?: {
        [Field in GetModelFields<Schema, Model> as Field extends ScalarFields<Schema, Model> ? Field : never]?: boolean;
    };
};

/**
 * Context object passed to computed field implementations.
 */
export type ComputedFieldContext<Schema extends SchemaDef> = {
    /**
     * The alias name that can be used to refer to the containing model
     */
    modelAlias: string;

    /**
     * The ZenStack client executing the query. Useful for reading per-client state,
     * e.g. the auth context set via `$setAuth`.
     */
    client: ClientContract<Schema>;
};

/**
 * The computed fields a model declares itself, keyed by name. A computed field inherited from a
 * delegate base is excluded: it's configured once, on the base model.
 */
type OwnComputedFields<Schema extends SchemaDef, Model extends GetModels<Schema>> = keyof {
    [Field in GetModelFields<Schema, Model> as GetModelField<Schema, Model, Field> extends { computed: true }
        ? GetModelField<Schema, Model, Field> extends { originModel: string }
            ? never
            : Field
        : never]: Field;
};

/**
 * Implementations of the schema's computed fields, keyed by (uncapitalized) model name and then
 * by field name. Everything is derived from the field definitions: which fields need an
 * implementation, the query-time `args` of a parameterized field (from its `params` metadata,
 * the same source the query input types use), and the value type the expression must produce.
 */
export type ComputedFieldsOptions<Schema extends SchemaDef> = {
    [Model in GetModels<Schema> as [OwnComputedFields<Schema, Model>] extends [never] ? never : Uncapitalize<Model>]: {
        [Field in OwnComputedFields<Schema, Model>]: (
            // inject a first parameter for expression builder
            p: ExpressionBuilder<ToKyselySchema<Schema>, Model>,
            // runtime-provided context
            context: ComputedFieldContext<Schema>,
            // query-time args of a parameterized field
            ...args: ComputedFieldImplArgs<Schema, Model, Field>
        ) => OperandExpression<ComputedFieldResultType<Schema, Model, Field>>;
    };
};

/**
 * The trailing parameter list of a computed field implementation: `[args]` for a parameterized
 * field, empty otherwise.
 */
type ComputedFieldImplArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = FieldHasComputedArgs<Schema, Model, Field> extends true ? [args: ComputedFieldArgs<Schema, Model, Field>] : [];

/**
 * The value type a computed field's expression must produce, from the field's declared type.
 * Scalars map to their JS types (`Decimal` is accepted as `number`); `DateTime`, `Json`,
 * `Bytes`, enums and type defs are `unknown`, since their database-level representation differs
 * from the ORM result type. An optional field also accepts `null`, a list field an array.
 */
type ComputedFieldResultType<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = WrapType<
    ComputedFieldBaseType<GetModelFieldType<Schema, Model, Field>>,
    ModelFieldIsOptional<Schema, Model, Field>,
    FieldIsArray<Schema, Model, Field>
>;

type ComputedFieldBaseType<T> = T extends 'String'
    ? string
    : T extends 'Boolean'
      ? boolean
      : T extends 'Int' | 'Float' | 'Decimal'
        ? number
        : T extends 'BigInt'
          ? bigint
          : unknown;

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
