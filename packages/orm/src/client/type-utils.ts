import type { GetModels, SchemaDef } from '@zenstackhq/schema';
import type { AllCrudOperations } from './crud/operations/base';
import type { QueryOptions, SlicingOptions } from './options';

type IsNever<T> = [T] extends [never] ? true : false;

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

/**
 * Filters query operations based on slicing configuration for a specific model.
 */
export type GetSlicedOperations<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
> = Options['slicing'] extends infer S
    ? S extends SlicingOptions<Schema>
        ? GetIncludedOperations<S, Model> extends infer IO
            ? GetExcludedOperations<S, Model> extends infer EO
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

export type GetIncludedOperations<S extends SlicingOptions<any>, Model extends string> = S extends {
    models: infer Config;
}
    ? Model extends keyof Config
        ? 'includedOperations' extends keyof Config[Model]
            ? // 'includedOperations' is specified for the model
              Config[Model] extends { includedOperations: readonly [] }
                ? // special marker for empty array (mute all)
                  '_none_'
                : // use the specified includedOperations
                  Config[Model] extends { includedOperations: readonly (infer IO)[] }
                  ? IO
                  : never
            : // fallback to $all if 'includedOperations' not specified for the model
              GetAllIncludedOperations<S>
        : // fallback to $all if model-specific config not found
          GetAllIncludedOperations<S>
    : never;

export type GetAllIncludedOperations<S extends SlicingOptions<any>> = S extends {
    models: infer Config;
}
    ? '$all' extends keyof Config
        ? Config['$all'] extends { includedOperations: readonly [] }
            ? '_none_'
            : Config['$all'] extends { includedOperations: readonly (infer IO)[] }
              ? IO
              : AllCrudOperations
        : AllCrudOperations
    : AllCrudOperations;

type GetExcludedOperations<S extends SlicingOptions<any>, Model extends string> = S extends {
    models: infer Config;
}
    ? Model extends keyof Config
        ? Config[Model] extends { excludedOperations: readonly (infer EO)[] }
            ? EO
            : // fallback to $all if 'excludedOperations' not specified for the model
              GetAllExcludedOperations<S>
        : // fallback to $all if model-specific config not found
          GetAllExcludedOperations<S>
    : never;

type GetAllExcludedOperations<S extends SlicingOptions<any>> = S extends {
    models: infer M;
}
    ? '$all' extends keyof M
        ? M['$all'] extends { excludedOperations: readonly (infer EO)[] }
            ? EO
            : never
        : never
    : never;
