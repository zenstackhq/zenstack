import type { GetModels, SchemaDef } from '@zenstackhq/schema';
import type { GetProcedureNames } from './crud-types';
import type { AllCrudOperations } from './crud/operations/base';
import type { FilterKind, QueryOptions, SlicingOptions } from './options';

type IsNever<T> = [T] extends [never] ? true : false;

// #region Model slicing

/**
 * Filters models based on slicing configuration.
 */
export type GetSlicedModels<
    Schema extends SchemaDef,
    Options extends QueryOptions<Schema>,
> = Options['slicing'] extends infer S
    ? S extends SlicingOptions<Schema>
        ? S['includedModels'] extends readonly GetModels<Schema>[]
            ? // includedModels is specified, start with only those
              Exclude<
                  Extract<S['includedModels'][number], GetModels<Schema>>,
                  S['excludedModels'] extends readonly GetModels<Schema>[] ? S['excludedModels'][number] : never
              >
            : // includedModels not specified, start with all models
              Exclude<
                  GetModels<Schema>,
                  S['excludedModels'] extends readonly GetModels<Schema>[] ? S['excludedModels'][number] : never
              >
        : // No slicing config, include all models
          GetModels<Schema>
    : GetModels<Schema>;

// #endregion

// #region Operation slicing

/**
 * Filters query operations based on slicing configuration for a specific model.
 */
export type GetSlicedOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
> = Options['slicing'] extends infer Slicing
    ? Slicing extends SlicingOptions<Schema>
        ? GetIncludedOperations<Slicing, Model> extends infer IO
            ? GetExcludedOperations<Slicing, Model> extends infer EO
                ? IO extends '_none_'
                    ? // special case for empty includeOperations array - exclude all operations
                      never
                    : IsNever<IO> extends false
                      ? // includedOperations is specified, use those minus any excludedOperations
                        Exclude<IO, EO>
                      : // includedOperations not specified, use all operations minus any excludedOperations
                        Exclude<AllCrudOperations, EO>
                : AllCrudOperations
            : AllCrudOperations
        : AllCrudOperations
    : AllCrudOperations;

export type GetIncludedOperations<
    Slicing extends SlicingOptions<any>,
    Model extends string,
> = 'models' extends keyof Slicing
    ? Slicing extends { models: infer Config }
        ? Uncapitalize<Model> extends keyof Config
            ? 'includedOperations' extends keyof Config[Uncapitalize<Model>]
                ? // 'includedOperations' is specified for the model
                  Config[Uncapitalize<Model>] extends { includedOperations: readonly [] }
                    ? // special marker for empty array (mute all)
                      '_none_'
                    : // use the specified includedOperations
                      Config[Uncapitalize<Model>] extends { includedOperations: readonly (infer IO)[] }
                      ? IO
                      : never
                : // fallback to $all if 'includedOperations' not specified for the model
                  GetAllIncludedOperations<Slicing>
            : // fallback to $all if model-specific config not found
              GetAllIncludedOperations<Slicing>
        : AllCrudOperations
    : AllCrudOperations;

export type GetAllIncludedOperations<Slicing extends SlicingOptions<any>> = 'models' extends keyof Slicing
    ? Slicing extends { models: infer Config }
        ? '$all' extends keyof Config
            ? Config['$all'] extends { includedOperations: readonly [] }
                ? '_none_'
                : Config['$all'] extends { includedOperations: readonly (infer IO)[] }
                  ? IO
                  : AllCrudOperations
            : AllCrudOperations
        : AllCrudOperations
    : AllCrudOperations;

type GetExcludedOperations<Slicing extends SlicingOptions<any>, Model extends string> = 'models' extends keyof Slicing
    ? Slicing extends { models: infer Config }
        ? Uncapitalize<Model> extends keyof Config
            ? Config[Uncapitalize<Model>] extends { excludedOperations: readonly (infer EO)[] }
                ? EO
                : // fallback to $all if 'excludedOperations' not specified for the model
                  GetAllExcludedOperations<Slicing>
            : // fallback to $all if model-specific config not found
              GetAllExcludedOperations<Slicing>
        : never
    : never;

type GetAllExcludedOperations<Slicing extends SlicingOptions<any>> = 'models' extends keyof Slicing
    ? Slicing extends { models: infer M }
        ? '$all' extends keyof M
            ? M['$all'] extends { excludedOperations: readonly (infer EO)[] }
                ? EO
                : never
            : never
        : never
    : never;

// #endregion

// #region Procedure slicing

/**
 * Filters procedures based on slicing configuration.
 */
export type GetSlicedProcedures<
    Schema extends SchemaDef,
    Options extends QueryOptions<Schema>,
> = Options['slicing'] extends infer S
    ? S extends SlicingOptions<Schema>
        ? S['includedProcedures'] extends readonly (infer IncludedProc)[]
            ? // includedProcedures is specified, start with only those
              Exclude<
                  Extract<IncludedProc, GetProcedureNames<Schema>>,
                  S['excludedProcedures'] extends readonly (infer ExcludedProc)[]
                      ? Extract<ExcludedProc, GetProcedureNames<Schema>>
                      : never
              >
            : // includedProcedures not specified, start with all procedures
              Exclude<
                  GetProcedureNames<Schema>,
                  S['excludedProcedures'] extends readonly (infer ExcludedProc)[]
                      ? Extract<ExcludedProc, GetProcedureNames<Schema>>
                      : never
              >
        : // No slicing config, include all procedures
          GetProcedureNames<Schema>
    : GetProcedureNames<Schema>;

// #endregion

// #region Filter slicing

/**
 * Filters filter kinds for a specific field, considering field-level slicing configuration with $all fallback.
 */
export type GetSlicedFilterKindsForField<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends string,
    Options extends QueryOptions<Schema>,
> = Options extends { slicing: infer S }
    ? S extends SlicingOptions<Schema>
        ? GetFieldIncludedFilterKinds<S, Model, Field> extends infer IFK
            ? GetFieldExcludedFilterKinds<S, Model, Field> extends infer EFK
                ? '_none_' extends IFK
                    ? // Empty includedFilterKinds array - exclude all
                      never
                    : IsNever<IFK> extends true
                      ? // No field-level includedFilterKinds specified
                        IsNever<EFK> extends true
                          ? // No field-level exclusions either - allow all
                            FilterKind
                          : // Field-level exclusions exist - exclude them from all filter kinds
                            Exclude<FilterKind, EFK>
                      : // Field-level includedFilterKinds specified - use those and apply exclusions
                        Exclude<IFK, EFK>
                : FilterKind
            : FilterKind
        : FilterKind
    : FilterKind;

// Helper type to extract includedFilterKinds from a model config (handles both specific model and $all)
type GetIncludedFilterKindsFromModelConfig<ModelConfig, Field extends string> = ModelConfig extends {
    includedFilterKinds: readonly [];
}
    ? '_none_'
    : 'fields' extends keyof ModelConfig
      ? ModelConfig['fields'] extends infer FieldsConfig
          ? // Check if specific field config exists
            Field extends keyof FieldsConfig
              ? 'includedFilterKinds' extends keyof FieldsConfig[Field]
                  ? // Field-specific includedFilterKinds
                    FieldsConfig[Field] extends { includedFilterKinds: readonly [] }
                      ? '_none_'
                      : FieldsConfig[Field] extends { includedFilterKinds: readonly (infer IFK)[] }
                        ? IFK
                        : never
                  : // No field-specific includedFilterKinds, try $all
                    GetAllFieldsIncludedFilterKinds<FieldsConfig>
              : // No field-specific config, try $all
                GetAllFieldsIncludedFilterKinds<FieldsConfig>
          : never
      : never;

type GetFieldIncludedFilterKinds<
    S extends SlicingOptions<any>,
    Model extends string,
    Field extends string,
> = S extends {
    models?: infer Config;
}
    ? Uncapitalize<Model> extends keyof Config
        ? GetIncludedFilterKindsFromModelConfig<Config[Uncapitalize<Model>], Field>
        : // Model not in config, fallback to $all
          '$all' extends keyof Config
          ? GetIncludedFilterKindsFromModelConfig<Config['$all'], Field>
          : never
    : never;

type GetAllFieldsIncludedFilterKinds<FieldsConfig> = '$all' extends keyof FieldsConfig
    ? FieldsConfig['$all'] extends { includedFilterKinds: readonly [] }
        ? '_none_'
        : FieldsConfig['$all'] extends { includedFilterKinds: readonly (infer IFK)[] }
          ? IFK
          : never
    : never;

// Helper type to extract excludedFilterKinds from a model config (handles both specific model and $all)
type GetExcludedFilterKindsFromModelConfig<ModelConfig, Field extends string> = 'fields' extends keyof ModelConfig
    ? ModelConfig['fields'] extends infer FieldsConfig
        ? // Check if specific field config exists
          Field extends keyof FieldsConfig
            ? FieldsConfig[Field] extends { excludedFilterKinds: readonly (infer EFK)[] }
                ? EFK
                : // No field-specific excludedFilterKinds, try $all
                  GetAllFieldsExcludedFilterKinds<FieldsConfig>
            : // No field-specific config, try $all
              GetAllFieldsExcludedFilterKinds<FieldsConfig>
        : never
    : never;

type GetFieldExcludedFilterKinds<
    S extends SlicingOptions<any>,
    Model extends string,
    Field extends string,
> = S extends {
    models?: infer Config;
}
    ? Uncapitalize<Model> extends keyof Config
        ? GetExcludedFilterKindsFromModelConfig<Config[Uncapitalize<Model>], Field>
        : // Model not in config, fallback to $all
          '$all' extends keyof Config
          ? GetExcludedFilterKindsFromModelConfig<Config['$all'], Field>
          : never
    : never;

type GetAllFieldsExcludedFilterKinds<FieldsConfig> = '$all' extends keyof FieldsConfig
    ? FieldsConfig['$all'] extends { excludedFilterKinds: readonly (infer EFK)[] }
        ? EFK
        : never
    : never;

// #endregion
