import type { ExpressionBuilder, OperandExpression, SqlBool } from 'kysely';
import type { DbNull, JsonNull, JsonNullValues, JsonValue } from '../common-types';
import type {
    BuiltinType,
    FieldDef,
    FieldHasDefault,
    FieldIsArray,
    FieldIsDelegateDiscriminator,
    FieldIsDelegateRelation,
    FieldIsRelation,
    FieldType,
    ForeignKeyFields,
    GetEnum,
    GetEnums,
    GetModel,
    GetModelField,
    GetModelFields,
    GetModelFieldType,
    GetModels,
    GetTypeDefField,
    GetTypeDefFields,
    GetTypeDefFieldType,
    GetTypeDefs,
    ModelFieldIsOptional,
    NonRelationFields,
    ProcedureDef,
    RelationFields,
    RelationFieldType,
    RelationInfo,
    ScalarFields,
    SchemaDef,
    TypeDefFieldIsArray,
    TypeDefFieldIsOptional,
    UpdatedAtInfo,
} from '../schema';
import type {
    AtLeast,
    MapBaseType,
    MaybePromise,
    NonEmptyArray,
    NullableIf,
    Optional,
    OrArray,
    OrUndefinedIf,
    PartialIf,
    Simplify,
    TypeMap,
    ValueOfPotentialTuple,
    WrapType,
    XOR,
} from '../utils/type-utils';
import type { ClientContract } from './contract';
import type {
    CoreCreateOperations,
    CoreCrudOperations,
    CoreDeleteOperations,
    CoreReadOperations,
    CoreUpdateOperations,
} from './crud/operations/base';
import type { FilterKind, QueryOptions } from './options';
import type { ExtQueryArgsBase } from './plugin';
import type { ToKyselySchema } from './query-builder';
import type { GetSlicedFilterKindsForField, GetSlicedModels } from './type-utils';

//#region Query results

export type DefaultModelResult<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Omit = undefined,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    Optional = false,
    Array = false,
> = WrapType<
    {
        [Key in NonRelationFields<Schema, Model> as ShouldOmitField<Schema, Model, Options, Key, Omit> extends true
            ? never
            : Key]: MapModelFieldType<Schema, Model, Key>;
    },
    // TODO: revisit how to efficiently implement discriminated sub model types
    // IsDelegateModel<Schema, Model> extends true
    //     ? // delegate model's selection result is a union of all sub-models
    //       DelegateUnionResult<Schema, Model, Options, GetSubModels<Schema, Model>, Omit>
    //     : {
    //           [Key in NonRelationFields<Schema, Model> as ShouldOmitField<
    //               Schema,
    //               Model,
    //               Options,
    //               Key,
    //               Omit
    //           > extends true
    //               ? never
    //               : Key]: MapModelFieldType<Schema, Model, Key>;
    //       },
    Optional,
    Array
>;

// precedence: query-level omit > options-level omit > schema-level omit
type ShouldOmitField<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    Field extends GetModelFields<Schema, Model>,
    Omit,
> =
    QueryLevelOmit<Schema, Model, Field, Omit> extends boolean
        ? QueryLevelOmit<Schema, Model, Field, Omit>
        : OptionsLevelOmit<Schema, Model, Field, Options> extends boolean
          ? OptionsLevelOmit<Schema, Model, Field, Options>
          : SchemaLevelOmit<Schema, Model, Field>;

type QueryLevelOmit<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    Omit,
> = Field extends keyof Omit ? (Omit[Field] extends boolean ? Omit[Field] : undefined) : undefined;

type OptionsLevelOmit<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = Model extends keyof Options['omit']
    ? Field extends keyof Options['omit'][Model]
        ? Options['omit'][Model][Field] extends boolean
            ? Options['omit'][Model][Field]
            : undefined
        : undefined
    : undefined;

type SchemaLevelOmit<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = GetModelField<Schema, Model, Field>['omit'] extends true ? true : false;

// type DelegateUnionResult<
//     Schema extends SchemaDef,
//     Model extends GetModels<Schema>,
//     Options extends QueryOptions<Schema>,
//     SubModel extends GetModels<Schema>,
//     Omit = undefined,
// > = SubModel extends string // typescript union distribution
//     ? DefaultModelResult<Schema, SubModel, Options, Omit> & { [K in GetModelDiscriminator<Schema, Model>]: SubModel } // fixate discriminated field
//     : never;

type ModelSelectResult<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Select,
    Omit,
    Options extends QueryOptions<Schema>,
> = {
    [Key in keyof Select as Select[Key] extends false | undefined
        ? // not selected
          never
        : Key extends '_count'
          ? // select "_count"
            Select[Key] extends SelectCount<Schema, Model, Options>
              ? Key
              : never
          : Key extends keyof Omit
            ? Omit[Key] extends true
                ? //   omit
                  never
                : Key
            : Key]: Key extends '_count'
        ? // select "_count" result
          SelectCountResult<Schema, Model, Select[Key]>
        : Key extends NonRelationFields<Schema, Model>
          ? // scalar field result
            MapModelFieldType<Schema, Model, Key>
          : Key extends RelationFields<Schema, Model>
            ? // relation field result (recurse)
              ModelResult<
                  Schema,
                  RelationFieldType<Schema, Model, Key>,
                  Select[Key],
                  Options,
                  ModelFieldIsOptional<Schema, Model, Key>,
                  FieldIsArray<Schema, Model, Key>
              >
            : never;
};

type SelectCountResult<Schema extends SchemaDef, Model extends GetModels<Schema>, C> = C extends true
    ? {
          // count all to-many relation fields
          [Key in RelationFields<Schema, Model> as FieldIsArray<Schema, Model, Key> extends true ? Key : never]: number;
      }
    : C extends { select: infer S }
      ? { [Key in keyof S]: number }
      : never;

export type ModelResult<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Args = {},
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    Optional = false,
    Array = false,
> = WrapType<
    Args extends {
        select: infer S extends object;
        omit?: infer O extends object;
    } & Record<string, unknown>
        ? ModelSelectResult<Schema, Model, S, O, Options>
        : Args extends {
                include: infer I extends object;
                omit?: infer O extends object;
            } & Record<string, unknown>
          ? // select all non-omitted scalar fields
            DefaultModelResult<Schema, Model, O, Options, false, false> & {
                // recurse for "include" relations
                [Key in keyof I & RelationFields<Schema, Model> as I[Key] extends false | undefined
                    ? never
                    : Key]: ModelResult<
                    Schema,
                    RelationFieldType<Schema, Model, Key>,
                    I[Key],
                    Options,
                    ModelFieldIsOptional<Schema, Model, Key>,
                    FieldIsArray<Schema, Model, Key>
                >;
            } & ('_count' extends keyof I
                    ? I['_count'] extends false | undefined
                        ? {}
                        : { _count: SelectCountResult<Schema, Model, I['_count']> }
                    : {})
          : Args extends { omit: infer O } & Record<string, unknown>
            ? DefaultModelResult<Schema, Model, O, Options, false, false>
            : DefaultModelResult<Schema, Model, undefined, Options, false, false>,
    Optional,
    Array
>;

export type SimplifiedResult<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Args = {},
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    Optional = false,
    Array = false,
> = Simplify<ModelResult<Schema, Model, Args, Options, Optional, Array>>;

export type SimplifiedPlainResult<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Args = {},
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
> = Simplify<ModelResult<Schema, Model, Args, Options, false, false>>;

export type TypeDefResult<
    Schema extends SchemaDef,
    TypeDef extends GetTypeDefs<Schema>,
    Partial extends boolean = false,
> = PartialIf<
    Optional<
        {
            [Key in GetTypeDefFields<Schema, TypeDef>]: MapFieldDefType<
                Schema,
                GetTypeDefField<Schema, TypeDef, Key>,
                Partial
            >;
        },
        // optionality
        Partial extends true
            ? never
            : keyof {
                  [Key in GetTypeDefFields<Schema, TypeDef> as TypeDefFieldIsOptional<Schema, TypeDef, Key> extends true
                      ? Key
                      : never]: true;
              }
    >,
    Partial
> &
    Record<string, unknown>;

export type BatchResult = { count: number };

//#endregion

//#region Common structures

export type WhereInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ScalarOnly extends boolean = false,
    WithAggregations extends boolean = false,
> = {
    [Key in GetModelFields<Schema, Model> as ScalarOnly extends true
        ? Key extends RelationFields<Schema, Model>
            ? never
            : Key
        : Key]?: FieldFilter<Schema, Model, Key, Options, WithAggregations>;
} & {
    $expr?: (eb: ExpressionBuilder<ToKyselySchema<Schema>, Model>) => OperandExpression<SqlBool>;
} & {
    AND?: OrArray<WhereInput<Schema, Model, Options, ScalarOnly>>;
    OR?: WhereInput<Schema, Model, Options, ScalarOnly>[];
    NOT?: OrArray<WhereInput<Schema, Model, Options, ScalarOnly>>;
};

type FieldFilter<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind = GetSlicedFilterKindsForField<Schema, Model, Field, Options>,
> =
    Field extends RelationFields<Schema, Model>
        ? // relation
          RelationFilter<Schema, Model, Field, Options, AllowedKinds>
        : FieldIsArray<Schema, Model, Field> extends true
          ? // array
            ArrayFilter<Schema, GetModelFieldType<Schema, Model, Field>, AllowedKinds>
          : GetModelFieldType<Schema, Model, Field> extends GetEnums<Schema>
            ? // enum
              EnumFilter<
                  Schema,
                  GetModelFieldType<Schema, Model, Field>,
                  ModelFieldIsOptional<Schema, Model, Field>,
                  WithAggregations,
                  AllowedKinds
              >
            : GetModelFieldType<Schema, Model, Field> extends GetTypeDefs<Schema>
              ? // typedef
                TypedJsonFilter<
                    Schema,
                    GetModelFieldType<Schema, Model, Field>,
                    FieldIsArray<Schema, Model, Field>,
                    ModelFieldIsOptional<Schema, Model, Field>,
                    AllowedKinds
                >
              : // primitive
                PrimitiveFilter<
                    GetModelFieldType<Schema, Model, Field>,
                    ModelFieldIsOptional<Schema, Model, Field>,
                    WithAggregations,
                    AllowedKinds
                >;

type EnumFilter<
    Schema extends SchemaDef,
    T extends GetEnums<Schema>,
    Nullable extends boolean,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind,
> =
    | ('Equality' extends AllowedKinds ? NullableIf<keyof GetEnum<Schema, T>, Nullable> : never)
    | (('Equality' extends AllowedKinds
          ? {
                /**
                 * Checks for equality with the specified enum value.
                 */
                equals?: NullableIf<keyof GetEnum<Schema, T>, Nullable>;

                /**
                 * Checks if the enum value is in the specified list of values.
                 */
                in?: (keyof GetEnum<Schema, T>)[];

                /**
                 * Checks if the enum value is not in the specified list of values.
                 */
                notIn?: (keyof GetEnum<Schema, T>)[];
            }
          : {}) & {
          /**
           * Builds a negated filter.
           */
          not?: EnumFilter<Schema, T, Nullable, WithAggregations, AllowedKinds>;
      } & (WithAggregations extends true
              ? {
                    /**
                     * Filters against the count of records.
                     */
                    _count?: NumberFilter<'Int', false, false, AllowedKinds>;

                    /**
                     * Filters against the minimum value.
                     */
                    _min?: EnumFilter<Schema, T, false, false, AllowedKinds>;

                    /**
                     * Filters against the maximum value.
                     */
                    _max?: EnumFilter<Schema, T, false, false, AllowedKinds>;
                }
              : {}));

type ArrayFilter<
    Schema extends SchemaDef,
    Type extends string,
    AllowedKinds extends FilterKind,
> = ('Equality' extends AllowedKinds
    ? {
          /**
           * Checks if the array equals the specified array.
           */
          equals?: MapScalarType<Schema, Type>[] | null;
      }
    : {}) &
    ('List' extends AllowedKinds
        ? {
              /**
               * Checks if the array contains all elements of the specified array.
               */
              has?: MapScalarType<Schema, Type> | null;

              /**
               * Checks if the array contains any of the elements of the specified array.
               */
              hasEvery?: MapScalarType<Schema, Type>[];

              /**
               * Checks if the array contains some of the elements of the specified array.
               */
              hasSome?: MapScalarType<Schema, Type>[];

              /**
               * Checks if the array is empty.
               */
              isEmpty?: boolean;
          }
        : {});

// map a scalar type (primitive and enum) to TS type
type MapScalarType<Schema extends SchemaDef, Type extends string> =
    Type extends GetEnums<Schema> ? keyof GetEnum<Schema, Type> : MapBaseType<Type>;

type PrimitiveFilter<
    T extends string,
    Nullable extends boolean,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind,
> = T extends 'String'
    ? StringFilter<Nullable, WithAggregations, AllowedKinds>
    : T extends 'Int' | 'Float' | 'Decimal' | 'BigInt'
      ? NumberFilter<T, Nullable, WithAggregations, AllowedKinds>
      : T extends 'Boolean'
        ? BooleanFilter<Nullable, WithAggregations, AllowedKinds>
        : T extends 'DateTime'
          ? DateTimeFilter<Nullable, WithAggregations, AllowedKinds>
          : T extends 'Bytes'
            ? BytesFilter<Nullable, WithAggregations, AllowedKinds>
            : T extends 'Json'
              ? JsonFilter<AllowedKinds>
              : never;

type CommonPrimitiveFilter<
    DataType,
    T extends BuiltinType,
    Nullable extends boolean,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind,
> = ('Equality' extends AllowedKinds
    ? {
          /**
           * Checks for equality with the specified value.
           */
          equals?: NullableIf<DataType, Nullable>;

          /**
           * Checks if the value is in the specified list of values.
           */
          in?: DataType[];

          /**
           * Checks if the value is not in the specified list of values.
           */
          notIn?: DataType[];
      }
    : {}) &
    ('Range' extends AllowedKinds
        ? {
              /**
               * Checks if the value is less than the specified value.
               */
              lt?: DataType;

              /**
               * Checks if the value is less than or equal to the specified value.
               */
              lte?: DataType;

              /**
               * Checks if the value is greater than the specified value.
               */
              gt?: DataType;

              /**
               * Checks if the value is greater than or equal to the specified value.
               */
              gte?: DataType;

              /**
               * Checks if the value is between the specified values (inclusive).
               */
              between?: [start: DataType, end: DataType];
          }
        : {}) & {
        /**
         * Builds a negated filter.
         */
        not?: PrimitiveFilter<T, Nullable, WithAggregations, AllowedKinds>;
    };

export type StringFilter<
    Nullable extends boolean,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind = FilterKind,
> =
    | ('Equality' extends AllowedKinds ? NullableIf<string, Nullable> : never)
    | (CommonPrimitiveFilter<string, 'String', Nullable, WithAggregations, AllowedKinds> &
          ('Like' extends AllowedKinds
              ? {
                    /**
                     * Checks if the string contains the specified substring.
                     */
                    contains?: string;

                    /**
                     * Checks if the string starts with the specified substring.
                     */
                    startsWith?: string;

                    /**
                     * Checks if the string ends with the specified substring.
                     */
                    endsWith?: string;

                    /**
                     * Specifies the string comparison mode. Not effective for "sqlite" provider
                     */
                    mode?: 'default' | 'insensitive';
                }
              : {}) &
          (WithAggregations extends true
              ? {
                    /**
                     * Filters against the count of records.
                     */
                    _count?: NumberFilter<'Int', false, false, AllowedKinds>;

                    /**
                     * Filters against the minimum value.
                     */
                    _min?: StringFilter<false, false, AllowedKinds>;

                    /**
                     * Filters against the maximum value.
                     */
                    _max?: StringFilter<false, false, AllowedKinds>;
                }
              : {}));

export type NumberFilter<
    T extends 'Int' | 'Float' | 'Decimal' | 'BigInt',
    Nullable extends boolean,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind = FilterKind,
> =
    | ('Equality' extends AllowedKinds ? NullableIf<number | bigint, Nullable> : never)
    | (CommonPrimitiveFilter<number, T, Nullable, WithAggregations, AllowedKinds> &
          (WithAggregations extends true
              ? {
                    /**
                     * Filters against the count of records.
                     */
                    _count?: NumberFilter<'Int', false, false, AllowedKinds>;

                    /**
                     * Filters against the average value.
                     */
                    _avg?: NumberFilter<T, false, false, AllowedKinds>;

                    /**
                     * Filters against the sum value.
                     */
                    _sum?: NumberFilter<T, false, false, AllowedKinds>;

                    /**
                     * Filters against the minimum value.
                     */
                    _min?: NumberFilter<T, false, false, AllowedKinds>;

                    /**
                     * Filters against the maximum value.
                     */
                    _max?: NumberFilter<T, false, false, AllowedKinds>;
                }
              : {}));

export type DateTimeFilter<
    Nullable extends boolean,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind = FilterKind,
> =
    | ('Equality' extends AllowedKinds ? NullableIf<Date | string, Nullable> : never)
    | (CommonPrimitiveFilter<Date | string, 'DateTime', Nullable, WithAggregations, AllowedKinds> &
          (WithAggregations extends true
              ? {
                    /**
                     * Filters against the count of records.
                     */
                    _count?: NumberFilter<'Int', false, false, AllowedKinds>;

                    /**
                     * Filters against the minimum value.
                     */
                    _min?: DateTimeFilter<false, false, AllowedKinds>;

                    /**
                     * Filters against the maximum value.
                     */
                    _max?: DateTimeFilter<false, false, AllowedKinds>;
                }
              : {}));

export type BytesFilter<
    Nullable extends boolean,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind = FilterKind,
> =
    | ('Equality' extends AllowedKinds ? NullableIf<Uint8Array | Buffer, Nullable> : never)
    | (('Equality' extends AllowedKinds
          ? {
                /**
                 * Checks for equality with the specified value.
                 */
                equals?: NullableIf<Uint8Array, Nullable>;

                /**
                 * Checks if the value is in the specified list of values.
                 */
                in?: Uint8Array[];

                /**
                 * Checks if the value is not in the specified list of values.
                 */
                notIn?: Uint8Array[];
            }
          : {}) & {
          /**
           * Builds a negated filter.
           */
          not?: BytesFilter<Nullable, WithAggregations, AllowedKinds>;
      } & (WithAggregations extends true
              ? {
                    /**
                     * Filters against the count of records.
                     */
                    _count?: NumberFilter<'Int', false, false, AllowedKinds>;

                    /**
                     * Filters against the minimum value.
                     */
                    _min?: BytesFilter<false, false, AllowedKinds>;

                    /**
                     * Filters against the maximum value.
                     */
                    _max?: BytesFilter<false, false, AllowedKinds>;
                }
              : {}));

export type BooleanFilter<
    Nullable extends boolean,
    WithAggregations extends boolean,
    AllowedKinds extends FilterKind = FilterKind,
> =
    | ('Equality' extends AllowedKinds ? NullableIf<boolean, Nullable> : never)
    | (('Equality' extends AllowedKinds
          ? {
                /**
                 * Checks for equality with the specified value.
                 */
                equals?: NullableIf<boolean, Nullable>;
            }
          : {}) & {
          /**
           * Builds a negated filter.
           */
          not?: BooleanFilter<Nullable, WithAggregations, AllowedKinds>;
      } & (WithAggregations extends true
              ? {
                    /**
                     * Filters against the count of records.
                     */
                    _count?: NumberFilter<'Int', false, false, AllowedKinds>;

                    /**
                     * Filters against the minimum value.
                     */
                    _min?: BooleanFilter<false, false, AllowedKinds>;

                    /**
                     * Filters against the maximum value.
                     */
                    _max?: BooleanFilter<false, false, AllowedKinds>;
                }
              : {}));

export type JsonFilter<AllowedKinds extends FilterKind = FilterKind> = ('Equality' extends AllowedKinds
    ? {
          /**
           * Checks for equality with the specified value.
           */
          equals?: JsonValue | JsonNullValues;

          /**
           * Builds a negated filter.
           */
          not?: JsonValue | JsonNullValues;
      }
    : {}) &
    ('Json' extends AllowedKinds
        ? {
              /**
               * JSON path to select the value to filter on. If omitted, the whole JSON value is used.
               */
              path?: string;

              /**
               * Checks if the value is a string and contains the specified substring.
               */
              string_contains?: string;

              /**
               * Checks if the value is a string and starts with the specified substring.
               */
              string_starts_with?: string;

              /**
               * Checks if the value is a string and ends with the specified substring.
               */
              string_ends_with?: string;

              /**
               * String comparison mode. Not effective for "sqlite" provider
               */
              mode?: 'default' | 'insensitive';

              /**
               * Checks if the value is an array and contains the specified value.
               */
              array_contains?: JsonValue;

              /**
               * Checks if the value is an array and starts with the specified value.
               */
              array_starts_with?: JsonValue;

              /**
               * Checks if the value is an array and ends with the specified value.
               */
              array_ends_with?: JsonValue;
          }
        : {});

export type TypedJsonFilter<
    Schema extends SchemaDef,
    TypeDefName extends GetTypeDefs<Schema>,
    Array extends boolean,
    Optional extends boolean,
    AllowedKinds extends FilterKind,
> = XOR<JsonFilter<AllowedKinds>, TypedJsonTypedFilter<Schema, TypeDefName, Array, Optional, AllowedKinds>>;

type TypedJsonTypedFilter<
    Schema extends SchemaDef,
    TypeDefName extends GetTypeDefs<Schema>,
    Array extends boolean,
    Optional extends boolean,
    AllowedKinds extends FilterKind,
> = 'Json' extends AllowedKinds
    ?
          | (Array extends true
                ? ArrayTypedJsonFilter<Schema, TypeDefName, AllowedKinds>
                : NonArrayTypedJsonFilter<Schema, TypeDefName, AllowedKinds>)
          | (Optional extends true ? null : never)
    : {};

type ArrayTypedJsonFilter<
    Schema extends SchemaDef,
    TypeDefName extends GetTypeDefs<Schema>,
    AllowedKinds extends FilterKind,
> = {
    some?: TypedJsonFieldsFilter<Schema, TypeDefName, AllowedKinds>;
    every?: TypedJsonFieldsFilter<Schema, TypeDefName, AllowedKinds>;
    none?: TypedJsonFieldsFilter<Schema, TypeDefName, AllowedKinds>;
};

type NonArrayTypedJsonFilter<
    Schema extends SchemaDef,
    TypeDefName extends GetTypeDefs<Schema>,
    AllowedKinds extends FilterKind,
> =
    | {
          is?: TypedJsonFieldsFilter<Schema, TypeDefName, AllowedKinds>;
          isNot?: TypedJsonFieldsFilter<Schema, TypeDefName, AllowedKinds>;
      }
    | TypedJsonFieldsFilter<Schema, TypeDefName, AllowedKinds>;

type TypedJsonFieldsFilter<
    Schema extends SchemaDef,
    TypeDefName extends GetTypeDefs<Schema>,
    AllowedKinds extends FilterKind,
> = {
    [Key in GetTypeDefFields<Schema, TypeDefName>]?: GetTypeDefFieldType<
        Schema,
        TypeDefName,
        Key
    > extends GetTypeDefs<Schema>
        ? // nested typedef - recurse
          TypedJsonFilter<
              Schema,
              GetTypeDefFieldType<Schema, TypeDefName, Key>,
              TypeDefFieldIsArray<Schema, TypeDefName, Key>,
              TypeDefFieldIsOptional<Schema, TypeDefName, Key>,
              AllowedKinds
          >
        : // array
          TypeDefFieldIsArray<Schema, TypeDefName, Key> extends true
          ? ArrayFilter<Schema, GetTypeDefFieldType<Schema, TypeDefName, Key>, AllowedKinds>
          : // enum
            GetTypeDefFieldType<Schema, TypeDefName, Key> extends GetEnums<Schema>
            ? EnumFilter<
                  Schema,
                  GetTypeDefFieldType<Schema, TypeDefName, Key>,
                  TypeDefFieldIsOptional<Schema, TypeDefName, Key>,
                  false,
                  AllowedKinds
              >
            : // primitive
              PrimitiveFilter<
                  GetTypeDefFieldType<Schema, TypeDefName, Key>,
                  TypeDefFieldIsOptional<Schema, TypeDefName, Key>,
                  false,
                  AllowedKinds
              >;
};

export type SortOrder = 'asc' | 'desc';
export type NullsOrder = 'first' | 'last';

export type OrderBy<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    WithRelation extends boolean,
    WithAggregation extends boolean,
> = {
    [Key in NonRelationFields<Schema, Model>]?: ModelFieldIsOptional<Schema, Model, Key> extends true
        ?
              | SortOrder
              | {
                    /**
                     * Sort order
                     */
                    sort: SortOrder;

                    /**
                     * Treatment of null values
                     */
                    nulls?: NullsOrder;
                }
        : SortOrder;
} & (WithRelation extends true
    ? {
          [Key in RelationFields<Schema, Model>]?: FieldIsArray<Schema, Model, Key> extends true
              ? {
                    /**
                     * Sorts by the count of related records.
                     */
                    _count?: SortOrder;
                }
              : OrderBy<Schema, RelationFieldType<Schema, Model, Key>, WithRelation, WithAggregation>;
      }
    : {}) &
    (WithAggregation extends true
        ? {
              /**
               * Sorts by the count of records.
               */
              _count?: OrderBy<Schema, Model, false, false>;

              /**
               * Sorts by the minimum value.
               */
              _min?: MinMaxInput<Schema, Model, SortOrder>;

              /**
               * Sorts by the maximum value.
               */
              _max?: MinMaxInput<Schema, Model, SortOrder>;
          } & (NumericFields<Schema, Model> extends never
              ? {}
              : {
                    /**
                     * Sorts by the average value.
                     */
                    _avg?: SumAvgInput<Schema, Model, SortOrder>;

                    /**
                     * Sorts by the sum value.
                     */
                    _sum?: SumAvgInput<Schema, Model, SortOrder>;
                })
        : {});

export type WhereUniqueInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
> = AtLeast<
    {
        [Key in keyof GetModel<Schema, Model>['uniqueFields']]?: GetModel<
            Schema,
            Model
        >['uniqueFields'][Key] extends Pick<FieldDef, 'type'>
            ? MapFieldDefType<Schema, GetModel<Schema, Model>['uniqueFields'][Key]>
            : // multi-field unique
              {
                  [Key1 in keyof GetModel<Schema, Model>['uniqueFields'][Key]]: GetModel<
                      Schema,
                      Model
                  >['uniqueFields'][Key][Key1] extends Pick<FieldDef, 'type'>
                      ? MapFieldDefType<Schema, GetModel<Schema, Model>['uniqueFields'][Key][Key1]>
                      : never;
              };
    } & WhereInput<Schema, Model, Options>,
    Extract<keyof GetModel<Schema, Model>['uniqueFields'], string>
>;

export type OmitInput<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Key in NonRelationFields<Schema, Model>]?: boolean;
};

export type SelectIncludeOmit<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    AllowCount extends boolean,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    AllowRelation extends boolean = true,
> = {
    /**
     * Explicitly select fields and relations to be returned by the query.
     */
    select?: SelectInput<Schema, Model, Options, AllowCount, AllowRelation> | null;

    /**
     * Explicitly omit fields from the query result.
     */
    omit?: OmitInput<Schema, Model> | null;
} & (AllowRelation extends true
    ? {
          /**
           * Specifies relations to be included in the query result. All scalar fields are included.
           */
          include?: IncludeInput<Schema, Model, Options, AllowCount> | null;
      }
    : {});

export type SelectInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    AllowCount extends boolean = true,
    AllowRelation extends boolean = true,
> = {
    [Key in NonRelationFields<Schema, Model>]?: boolean;
} & (AllowRelation extends true ? IncludeInput<Schema, Model, Options, AllowCount> : {});

type SelectCount<Schema extends SchemaDef, Model extends GetModels<Schema>, Options extends QueryOptions<Schema>> =
    | boolean
    | {
          /**
           * Selects specific relations to count.
           */
          select: {
              [Key in RelationFields<Schema, Model> as FieldIsArray<Schema, Model, Key> extends true ? Key : never]?:
                  | boolean
                  | {
                        where: WhereInput<Schema, RelationFieldType<Schema, Model, Key>, Options, false>;
                    };
          };
      };

export type IncludeInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    AllowCount extends boolean = true,
> = {
    [Key in RelationFields<Schema, Model> as RelationFieldType<Schema, Model, Key> extends GetSlicedModels<
        Schema,
        Options
    >
        ? Key
        : never]?:
        | boolean
        | FindArgs<
              Schema,
              RelationFieldType<Schema, Model, Key>,
              Options,
              FieldIsArray<Schema, Model, Key>,
              // where clause is allowed only if the relation is array or optional
              FieldIsArray<Schema, Model, Key> extends true
                  ? true
                  : ModelFieldIsOptional<Schema, Model, Key> extends true
                    ? true
                    : false
          >;
} & (AllowCount extends true
    ? // _count is only allowed if the model has to-many relations
      HasToManyRelations<Schema, Model> extends true
        ? { _count?: SelectCount<Schema, Model, Options> }
        : {}
    : {});

export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
};

export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
} & (T extends { select: any; include: any }
    ? 'Please either choose `select` or `include`.'
    : T extends { select: any; omit: any }
      ? 'Please either choose `select` or `omit`.'
      : {});

type ToManyRelationFilter<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = {
    every?: WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;
    some?: WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;
    none?: WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;
};

type ToOneRelationFilter<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = NullableIf<
    WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options> & {
        /**
         * Checks if the related record matches the specified filter.
         */
        is?: NullableIf<
            WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options>,
            ModelFieldIsOptional<Schema, Model, Field>
        >;

        /**
         * Checks if the related record does not match the specified filter.
         */
        isNot?: NullableIf<
            WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options>,
            ModelFieldIsOptional<Schema, Model, Field>
        >;
    },
    ModelFieldIsOptional<Schema, Model, Field>
>;

type RelationFilter<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
    AllowedKinds extends FilterKind,
> = 'Relation' extends AllowedKinds
    ? FieldIsArray<Schema, Model, Field> extends true
        ? ToManyRelationFilter<Schema, Model, Field, Options>
        : ToOneRelationFilter<Schema, Model, Field, Options>
    : never;

//#endregion

//#region Field utils

type MapModelFieldType<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = MapFieldDefType<Schema, GetModelField<Schema, Model, Field>>;

type MapFieldDefType<
    Schema extends SchemaDef,
    T extends Pick<FieldDef, 'type' | 'optional' | 'array'>,
    Partial extends boolean = false,
> = WrapType<
    T['type'] extends GetEnums<Schema>
        ? keyof GetEnum<Schema, T['type']>
        : T['type'] extends GetTypeDefs<Schema>
          ? TypeDefResult<Schema, T['type'], Partial> & Record<string, unknown>
          : MapBaseType<T['type']>,
    T['optional'],
    T['array']
>;

type OptionalFieldsForCreate<Schema extends SchemaDef, Model extends GetModels<Schema>> = keyof {
    [Key in GetModelFields<Schema, Model> as ModelFieldIsOptional<Schema, Model, Key> extends true
        ? Key
        : FieldHasDefault<Schema, Model, Key> extends true
          ? Key
          : FieldIsArray<Schema, Model, Key> extends true
            ? Key
            : GetModelField<Schema, Model, Key>['updatedAt'] extends true | UpdatedAtInfo
              ? Key
              : never]: GetModelField<Schema, Model, Key>;
};

type GetRelation<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = GetModelField<Schema, Model, Field>['relation'];

type OppositeRelation<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    FT = FieldType<Schema, Model, Field>,
> =
    FT extends GetModels<Schema>
        ? GetRelation<Schema, Model, Field> extends RelationInfo
            ? GetRelation<Schema, Model, Field>['opposite'] extends GetModelFields<Schema, FT>
                ? Schema['models'][FT]['fields'][GetRelation<Schema, Model, Field>['opposite']]['relation']
                : never
            : never
        : never;

type OppositeRelationFields<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    Opposite = OppositeRelation<Schema, Model, Field>,
> = Opposite extends RelationInfo ? (Opposite['fields'] extends readonly string[] ? Opposite['fields'] : []) : [];

type OppositeRelationAndFK<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    FT = FieldType<Schema, Model, Field>,
    Relation = GetModelField<Schema, Model, Field>['relation'],
    Opposite = Relation extends RelationInfo ? Relation['opposite'] : never,
> =
    FT extends GetModels<Schema>
        ? Opposite extends GetModelFields<Schema, FT>
            ? Opposite | OppositeRelationFields<Schema, Model, Field>[number]
            : never
        : never;

//#endregion

//#region Find args

type FilterArgs<Schema extends SchemaDef, Model extends GetModels<Schema>, Options extends QueryOptions<Schema>> = {
    /**
     * Filter conditions
     */
    where?: WhereInput<Schema, Model, Options>;
};

type SortAndTakeArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
> = {
    /**
     * Number of records to skip
     */
    skip?: number;

    /**
     * Number of records to take
     */
    take?: number;

    /**
     * Order by clauses
     */
    orderBy?: OrArray<OrderBy<Schema, Model, true, false>>;

    /**
     * Cursor for pagination
     */
    cursor?: WhereUniqueInput<Schema, Model, Options>;
};

export type FindArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    Collection extends boolean,
    AllowFilter extends boolean = true,
> = (Collection extends true
    ? SortAndTakeArgs<Schema, Model, Options> &
          (ProviderSupportsDistinct<Schema> extends true
              ? {
                    /**
                     * Distinct fields. Only supported by providers that natively support SQL "DISTINCT ON".
                     */
                    distinct?: OrArray<NonRelationFields<Schema, Model>>;
                }
              : {})
    : {}) &
    (AllowFilter extends true ? FilterArgs<Schema, Model, Options> : {}) &
    SelectIncludeOmit<Schema, Model, Collection, Options>;

export type FindManyArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = FindArgs<Schema, Model, Options, true> & ExtractExtQueryArgs<ExtQueryArgs, 'findMany'>;

export type FindFirstArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = FindArgs<Schema, Model, Options, true> & ExtractExtQueryArgs<ExtQueryArgs, 'findFirst'>;

export type ExistsArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = FilterArgs<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'exists'>;

export type FindUniqueArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = {
    where: WhereUniqueInput<Schema, Model, Options>;
} & SelectIncludeOmit<Schema, Model, true, Options> &
    ExtractExtQueryArgs<ExtQueryArgs, 'findUnique'>;

//#endregion

//#region Create args

export type CreateArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = {
    data: CreateInput<Schema, Model, Options>;
} & SelectIncludeOmit<Schema, Model, true, Options> &
    ExtractExtQueryArgs<ExtQueryArgs, 'create'>;

export type CreateManyArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    _Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = CreateManyInput<Schema, Model> & ExtractExtQueryArgs<ExtQueryArgs, 'createMany'>;

export type CreateManyAndReturnArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = CreateManyInput<Schema, Model> &
    SelectIncludeOmit<Schema, Model, false, Options, false> &
    ExtractExtQueryArgs<ExtQueryArgs, 'createManyAndReturn'>;

type OptionalWrap<Schema extends SchemaDef, Model extends GetModels<Schema>, T extends object> = Optional<
    T,
    keyof T & OptionalFieldsForCreate<Schema, Model>
>;

type CreateScalarPayload<Schema extends SchemaDef, Model extends GetModels<Schema>> = OptionalWrap<
    Schema,
    Model,
    {
        [Key in ScalarFields<Schema, Model, false> as FieldIsDelegateDiscriminator<Schema, Model, Key> extends true
            ? // discriminator fields cannot be assigned
              never
            : Key]: ScalarCreatePayload<Schema, Model, Key>;
    }
>;

type ScalarCreatePayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends ScalarFields<Schema, Model, false>,
> =
    | ScalarFieldMutationPayload<Schema, Model, Field>
    | (FieldIsArray<Schema, Model, Field> extends true
          ? {
                set?: MapModelFieldType<Schema, Model, Field>;
            }
          : never);

type ScalarFieldMutationPayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> =
    IsJsonField<Schema, Model, Field> extends true
        ? ModelFieldIsOptional<Schema, Model, Field> extends true
            ? JsonValue | JsonNull | DbNull
            : JsonValue | JsonNull
        : MapModelFieldType<Schema, Model, Field>;

type IsJsonField<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = GetModelFieldType<Schema, Model, Field> extends 'Json' ? true : false;

type CreateFKPayload<Schema extends SchemaDef, Model extends GetModels<Schema>> = OptionalWrap<
    Schema,
    Model,
    {
        [Key in ForeignKeyFields<Schema, Model>]: MapModelFieldType<Schema, Model, Key>;
    }
>;

type CreateRelationFieldPayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = Omit<
    {
        /**
         * Connects or create a related record.
         */
        connectOrCreate?: ConnectOrCreateInput<Schema, Model, Field, Options>;

        /**
         * Creates a related record.
         */
        create?: NestedCreateInput<Schema, Model, Field, Options>;

        /**
         * Creates a batch of related records.
         */
        createMany?: NestedCreateManyInput<Schema, Model, Field>;

        /**
         * Connects an existing record.
         */
        connect?: ConnectInput<Schema, Model, Field, Options>;
    },
    // no "createMany" for non-array fields
    | (FieldIsArray<Schema, Model, Field> extends true ? never : 'createMany')
    // exclude operations not applicable to delegate models
    | (FieldIsDelegateRelation<Schema, Model, Field> extends true ? 'create' | 'createMany' | 'connectOrCreate' : never)
>;

type CreateRelationPayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
> = OptionalWrap<
    Schema,
    Model,
    {
        [Key in RelationFields<Schema, Model> as RelationFieldType<Schema, Model, Key> extends GetSlicedModels<
            Schema,
            Options
        >
            ? Key
            : never]: CreateRelationFieldPayload<Schema, Model, Key, Options>;
    }
>;

type CreateWithFKInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
> =
    // scalar fields
    CreateScalarPayload<Schema, Model> &
        // fk fields
        CreateFKPayload<Schema, Model> &
        // non-owned relations
        CreateWithNonOwnedRelationPayload<Schema, Model, Options>;

type CreateWithRelationInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
> = CreateScalarPayload<Schema, Model> & CreateRelationPayload<Schema, Model, Options>;

type CreateWithNonOwnedRelationPayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
> = OptionalWrap<
    Schema,
    Model,
    {
        [Key in NonOwnedRelationFields<Schema, Model> as RelationFieldType<Schema, Model, Key> extends GetSlicedModels<
            Schema,
            Options
        >
            ? Key
            : never]: CreateRelationFieldPayload<Schema, Model, Key, Options>;
    }
>;

type ConnectOrCreatePayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    Without extends string = never,
> = {
    /**
     * The unique filter to find an existing record to connect.
     */
    where: WhereUniqueInput<Schema, Model, Options>;

    /**
     * The data to create a new record if no existing record is found.
     */
    create: CreateInput<Schema, Model, Options, Without>;
};

export type CreateManyInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Without extends string = never,
> = {
    /**
     * The data for the records to create.
     */
    data: OrArray<Omit<CreateScalarPayload<Schema, Model>, Without> & Omit<CreateFKPayload<Schema, Model>, Without>>;

    /**
     * Specifies whether to skip creating records that would violate unique constraints.
     */
    skipDuplicates?: boolean;
};

export type CreateInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    Without extends string = never,
> = XOR<
    Omit<CreateWithFKInput<Schema, Model, Options>, Without>,
    Omit<CreateWithRelationInput<Schema, Model, Options>, Without>
>;

type NestedCreateInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = OrArray<
    CreateInput<Schema, RelationFieldType<Schema, Model, Field>, Options, OppositeRelationAndFK<Schema, Model, Field>>,
    FieldIsArray<Schema, Model, Field>
>;

type NestedCreateManyInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
> = CreateManyInput<Schema, RelationFieldType<Schema, Model, Field>, OppositeRelationAndFK<Schema, Model, Field>>;

//#endregion

// #region Update args

export type UpdateArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = {
    /**
     * The data to update the record with.
     */
    data: UpdateInput<Schema, Model, Options>;

    /**
     * The unique filter to find the record to update.
     */
    where: WhereUniqueInput<Schema, Model, Options>;
} & SelectIncludeOmit<Schema, Model, true, Options> &
    ExtractExtQueryArgs<ExtQueryArgs, 'update'>;

export type UpdateManyArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = UpdateManyPayload<Schema, Model, Options> & ExtractExtQueryArgs<ExtQueryArgs, 'updateMany'>;

export type UpdateManyAndReturnArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = UpdateManyPayload<Schema, Model, Options> &
    SelectIncludeOmit<Schema, Model, false, Options, false> &
    ExtractExtQueryArgs<ExtQueryArgs, 'updateManyAndReturn'>;

type UpdateManyPayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    Without extends string = never,
> = {
    /**
     * The data to update the records with.
     */
    data: OrArray<UpdateScalarInput<Schema, Model, Without>>;

    /**
     * The filter to select records to update.
     */
    where?: WhereInput<Schema, Model, Options>;

    /**
     * Limit the number of records to update.
     */
    limit?: number;
};

export type UpsertArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = {
    /**
     * The data to create the record if it doesn't exist.
     */
    create: CreateInput<Schema, Model, Options>;

    /**
     * The data to update the record with if it exists.
     */
    update: UpdateInput<Schema, Model, Options>;

    /**
     * The unique filter to find the record to update.
     */
    where: WhereUniqueInput<Schema, Model, Options>;
} & SelectIncludeOmit<Schema, Model, true, Options> &
    ExtractExtQueryArgs<ExtQueryArgs, 'upsert'>;

type UpdateScalarInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Without extends string = never,
> = Omit<
    {
        [Key in NonRelationFields<Schema, Model> as FieldIsDelegateDiscriminator<Schema, Model, Key> extends true
            ? // discriminator fields cannot be assigned
              never
            : Key]?: ScalarUpdatePayload<Schema, Model, Key>;
    },
    Without
>;

type ScalarUpdatePayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends NonRelationFields<Schema, Model>,
> =
    | ScalarFieldMutationPayload<Schema, Model, Field>
    | (Field extends NumericFields<Schema, Model>
          ? {
                /**
                 * Sets the field to the specified value.
                 */
                set?: NullableIf<number, ModelFieldIsOptional<Schema, Model, Field>>;

                /**
                 * Increments the field by the specified value.
                 */
                increment?: number;

                /**
                 * Decrements the field by the specified value.
                 */
                decrement?: number;

                /**
                 * Multiplies the field by the specified value.
                 */
                multiply?: number;

                /**
                 * Divides the field by the specified value.
                 */
                divide?: number;
            }
          : never)
    | (FieldIsArray<Schema, Model, Field> extends true
          ? {
                /**
                 * Sets the field to the specified array.
                 */
                set?: MapModelFieldType<Schema, Model, Field>[];

                /**
                 * Appends the specified values to the array field.
                 */
                push?: OrArray<MapModelFieldType<Schema, Model, Field>, true>;
            }
          : never);

type UpdateRelationInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    Without extends string = never,
> = Omit<
    {
        [Key in RelationFields<Schema, Model> as RelationFieldType<Schema, Model, Key> extends GetSlicedModels<
            Schema,
            Options
        >
            ? Key
            : never]?: UpdateRelationFieldPayload<Schema, Model, Key, Options>;
    },
    Without
>;

export type UpdateInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema>,
    Without extends string = never,
> = UpdateScalarInput<Schema, Model, Without> & UpdateRelationInput<Schema, Model, Options, Without>;
type UpdateRelationFieldPayload<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> =
    FieldIsArray<Schema, Model, Field> extends true
        ? ToManyRelationUpdateInput<Schema, Model, Field, Options>
        : ToOneRelationUpdateInput<Schema, Model, Field, Options>;

type ToManyRelationUpdateInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = Omit<
    {
        /**
         * Creates related records.
         */
        create?: NestedCreateInput<Schema, Model, Field, Options>;

        /**
         * Creates a batch of related records.
         */
        createMany?: NestedCreateManyInput<Schema, Model, Field>;

        /**
         * Connects existing records.
         */
        connect?: ConnectInput<Schema, Model, Field, Options>;

        /**
         * Connects or create related records.
         */
        connectOrCreate?: ConnectOrCreateInput<Schema, Model, Field, Options>;

        /**
         * Disconnects related records.
         */
        disconnect?: DisconnectInput<Schema, Model, Field, Options>;

        /**
         * Updates related records.
         */
        update?: NestedUpdateInput<Schema, Model, Field, Options>;

        /**
         * Upserts related records.
         */
        upsert?: NestedUpsertInput<Schema, Model, Field, Options>;

        /**
         * Updates a batch of related records.
         */
        updateMany?: NestedUpdateManyInput<Schema, Model, Field, Options>;

        /**
         * Deletes related records.
         */
        delete?: NestedDeleteInput<Schema, Model, Field, Options>;

        /**
         * Deletes a batch of related records.
         */
        deleteMany?: NestedDeleteManyInput<Schema, Model, Field, Options>;

        /**
         * Sets the related records to the specified ones.
         */
        set?: SetRelationInput<Schema, Model, Field, Options>;
    },
    // exclude
    FieldIsDelegateRelation<Schema, Model, Field> extends true
        ? 'create' | 'createMany' | 'connectOrCreate' | 'upsert'
        : never
>;

type ToOneRelationUpdateInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = Omit<
    {
        /**
         * Creates a related record.
         */
        create?: NestedCreateInput<Schema, Model, Field, Options>;

        /**
         * Connects an existing record.
         */
        connect?: ConnectInput<Schema, Model, Field, Options>;

        /**
         * Connects or create a related record.
         */
        connectOrCreate?: ConnectOrCreateInput<Schema, Model, Field, Options>;

        /**
         * Updates the related record.
         */
        update?: NestedUpdateInput<Schema, Model, Field, Options>;

        /**
         * Upserts the related record.
         */
        upsert?: NestedUpsertInput<Schema, Model, Field, Options>;
    } & (ModelFieldIsOptional<Schema, Model, Field> extends true
        ? {
              /**
               * Disconnects the related record.
               */
              disconnect?: DisconnectInput<Schema, Model, Field, Options>;

              /**
               * Deletes the related record.
               */
              delete?: NestedDeleteInput<Schema, Model, Field, Options>;
          }
        : {}),
    FieldIsDelegateRelation<Schema, Model, Field> extends true ? 'create' | 'connectOrCreate' | 'upsert' : never
>;

// #endregion

// #region Delete args

export type DeleteArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = {
    /**
     * The unique filter to find the record to delete.
     */
    where: WhereUniqueInput<Schema, Model, Options>;
} & SelectIncludeOmit<Schema, Model, true, Options> &
    ExtractExtQueryArgs<ExtQueryArgs, 'delete'>;

export type DeleteManyArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = {
    /**
     * Filter to select records to delete.
     */
    where?: WhereInput<Schema, Model, Options>;

    /**
     * Limits the number of records to delete.
     */
    limit?: number;
} & ExtractExtQueryArgs<ExtQueryArgs, 'deleteMany'>;

// #endregion

// #region Count args

export type CountArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = Omit<FindArgs<Schema, Model, Options, true>, 'select' | 'include' | 'distinct' | 'omit'> & {
    /**
     * Selects fields to count
     */
    select?: CountAggregateInput<Schema, Model> | true;
} & ExtractExtQueryArgs<ExtQueryArgs, 'count'>;

type CountAggregateInput<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Key in NonRelationFields<Schema, Model>]?: true;
} & { _all?: true };

export type CountResult<Schema extends SchemaDef, _Model extends GetModels<Schema>, Args> = Args extends {
    select: infer S;
}
    ? S extends true
        ? number
        : {
              [Key in keyof S]: number;
          }
    : number;

// #endregion

// #region Aggregate

export type AggregateArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = {
    /**
     * Filter conditions
     */
    where?: WhereInput<Schema, Model, Options>;
    /**
     * Number of records to skip for the aggregation
     */
    skip?: number;

    /**
     * Number of records to take for the aggregation
     */
    take?: number;

    /**
     * Order by clauses
     */
    orderBy?: OrArray<OrderBy<Schema, Model, true, false>>;
} & {
    /**
     * Performs count aggregation.
     */
    _count?: true | CountAggregateInput<Schema, Model>;

    /**
     * Performs minimum value aggregation.
     */
    _min?: MinMaxInput<Schema, Model, true>;

    /**
     * Performs maximum value aggregation.
     */
    _max?: MinMaxInput<Schema, Model, true>;
} & (NumericFields<Schema, Model> extends never
        ? {}
        : {
              /**
               * Performs average value aggregation.
               */
              _avg?: SumAvgInput<Schema, Model, true>;

              /**
               * Performs sum value aggregation.
               */
              _sum?: SumAvgInput<Schema, Model, true>;
          }) &
    ExtractExtQueryArgs<ExtQueryArgs, 'aggregate'>;

type NumericFields<Schema extends SchemaDef, Model extends GetModels<Schema>> = keyof {
    [Key in GetModelFields<Schema, Model> as GetModelFieldType<Schema, Model, Key> extends
        | 'Int'
        | 'Float'
        | 'BigInt'
        | 'Decimal'
        ? FieldIsArray<Schema, Model, Key> extends true
            ? never
            : Key
        : never]: GetModelField<Schema, Model, Key>;
};

type SumAvgInput<Schema extends SchemaDef, Model extends GetModels<Schema>, ValueType> = {
    [Key in NumericFields<Schema, Model>]?: ValueType;
};

type MinMaxInput<Schema extends SchemaDef, Model extends GetModels<Schema>, ValueType> = {
    [Key in GetModelFields<Schema, Model> as FieldIsArray<Schema, Model, Key> extends true
        ? never
        : FieldIsRelation<Schema, Model, Key> extends true
          ? never
          : Key]?: ValueType;
};

export type AggregateResult<Schema extends SchemaDef, _Model extends GetModels<Schema>, Args> = (Args extends {
    _count: infer Count;
}
    ? {
          /**
           * Count aggregation result
           */
          _count: AggCommonOutput<Count>;
      }
    : {}) &
    (Args extends { _sum: infer Sum }
        ? {
              /**
               * Sum aggregation result
               */
              _sum: AggCommonOutput<Sum>;
          }
        : {}) &
    (Args extends { _avg: infer Avg }
        ? {
              /**
               * Average aggregation result
               */
              _avg: AggCommonOutput<Avg>;
          }
        : {}) &
    (Args extends { _min: infer Min }
        ? {
              /**
               * Minimum aggregation result
               */
              _min: AggCommonOutput<Min>;
          }
        : {}) &
    (Args extends { _max: infer Max }
        ? {
              /**
               * Maximum aggregation result
               */
              _max: AggCommonOutput<Max>;
          }
        : {});

type AggCommonOutput<Input> = Input extends true
    ? number
    : Input extends {}
      ? {
            [Key in keyof Input]: number;
        }
      : never;

// #endregion

// #region GroupBy

type GroupByHaving<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
> = Omit<WhereInput<Schema, Model, Options, true, true>, '$expr'>;

export type GroupByArgs<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options extends QueryOptions<Schema> = QueryOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> = {
    /**
     * Filter conditions
     */
    where?: WhereInput<Schema, Model, Options>;

    /**
     * Order by clauses
     */
    orderBy?: OrArray<OrderBy<Schema, Model, false, true>>;

    /**
     * Fields to group by
     */
    by: NonRelationFields<Schema, Model> | NonEmptyArray<NonRelationFields<Schema, Model>>;

    /**
     * Filter conditions for the grouped records
     */
    having?: GroupByHaving<Schema, Model, Options>;

    /**
     * Number of records to take for grouping
     */
    take?: number;

    /**
     * Number of records to skip for grouping
     */
    skip?: number;

    /**
     * Performs count aggregation.
     */
    _count?: true | CountAggregateInput<Schema, Model>;

    /**
     * Performs minimum value aggregation.
     */
    _min?: MinMaxInput<Schema, Model, true>;

    /**
     * Performs maximum value aggregation.
     */
    _max?: MinMaxInput<Schema, Model, true>;
} & (NumericFields<Schema, Model> extends never
    ? {}
    : {
          /**
           * Performs average value aggregation.
           */
          _avg?: SumAvgInput<Schema, Model, true>;

          /**
           * Performs sum value aggregation.
           */
          _sum?: SumAvgInput<Schema, Model, true>;
      }) &
    ExtractExtQueryArgs<ExtQueryArgs, 'groupBy'>;

export type GroupByResult<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Args extends { by: unknown },
> = Array<
    {
        [Key in NonRelationFields<Schema, Model> as Key extends ValueOfPotentialTuple<Args['by']>
            ? Key
            : never]: MapModelFieldType<Schema, Model, Key>;
    } & (Args extends { _count: infer Count }
        ? {
              /**
               * Count aggregation result
               */
              _count: AggCommonOutput<Count>;
          }
        : {}) &
        (Args extends { _avg: infer Avg }
            ? {
                  /**
                   * Average aggregation result
                   */
                  _avg: AggCommonOutput<Avg>;
              }
            : {}) &
        (Args extends { _sum: infer Sum }
            ? {
                  /**
                   * Sum aggregation result
                   */
                  _sum: AggCommonOutput<Sum>;
              }
            : {}) &
        (Args extends { _min: infer Min }
            ? {
                  /**
                   * Minimum aggregation result
                   */
                  _min: AggCommonOutput<Min>;
              }
            : {}) &
        (Args extends { _max: infer Max }
            ? {
                  /**
                   * Maximum aggregation result
                   */
                  _max: AggCommonOutput<Max>;
              }
            : {})
>;

// #endregion

// #region Relation manipulation

type ConnectInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> =
    FieldIsArray<Schema, Model, Field> extends true
        ? OrArray<WhereUniqueInput<Schema, RelationFieldType<Schema, Model, Field>, Options>>
        : WhereUniqueInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;

type ConnectOrCreateInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> =
    FieldIsArray<Schema, Model, Field> extends true
        ? OrArray<
              ConnectOrCreatePayload<
                  Schema,
                  RelationFieldType<Schema, Model, Field>,
                  Options,
                  OppositeRelationAndFK<Schema, Model, Field>
              >
          >
        : ConnectOrCreatePayload<
              Schema,
              RelationFieldType<Schema, Model, Field>,
              Options,
              OppositeRelationAndFK<Schema, Model, Field>
          >;

type DisconnectInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> =
    FieldIsArray<Schema, Model, Field> extends true
        ? OrArray<WhereUniqueInput<Schema, RelationFieldType<Schema, Model, Field>, Options>, true>
        : boolean | WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;

type SetRelationInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = OrArray<WhereUniqueInput<Schema, RelationFieldType<Schema, Model, Field>, Options>>;

type NestedUpdateInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> =
    FieldIsArray<Schema, Model, Field> extends true
        ? // to-many
          OrArray<
              {
                  /**
                   * Unique filter to select the record to update.
                   */
                  where: WhereUniqueInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;

                  /**
                   * The data to update the record with.
                   */
                  data: UpdateInput<
                      Schema,
                      RelationFieldType<Schema, Model, Field>,
                      Options,
                      OppositeRelationAndFK<Schema, Model, Field>
                  >;
              },
              true
          >
        : // to-one
          XOR<
              {
                  /**
                   * Filter to select the record to update.
                   */
                  where?: WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;

                  /**
                   * The data to update the record with.
                   */
                  data: UpdateInput<
                      Schema,
                      RelationFieldType<Schema, Model, Field>,
                      Options,
                      OppositeRelationAndFK<Schema, Model, Field>
                  >;
              },
              UpdateInput<
                  Schema,
                  RelationFieldType<Schema, Model, Field>,
                  Options,
                  OppositeRelationAndFK<Schema, Model, Field>
              >
          >;

type NestedUpsertInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = OrArray<
    {
        /**
         * Unique filter to select the record to update.
         */
        where: WhereUniqueInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;

        /**
         * The data to create the record if it doesn't exist.
         */
        create: CreateInput<
            Schema,
            RelationFieldType<Schema, Model, Field>,
            Options,
            OppositeRelationAndFK<Schema, Model, Field>
        >;

        /**
         * The data to update the record with if it exists.
         */
        update: UpdateInput<
            Schema,
            RelationFieldType<Schema, Model, Field>,
            Options,
            OppositeRelationAndFK<Schema, Model, Field>
        >;
    },
    FieldIsArray<Schema, Model, Field>
>;

type NestedUpdateManyInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = OrArray<
    UpdateManyPayload<
        Schema,
        RelationFieldType<Schema, Model, Field>,
        Options,
        OppositeRelationAndFK<Schema, Model, Field>
    >
>;

type NestedDeleteInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> =
    FieldIsArray<Schema, Model, Field> extends true
        ? OrArray<WhereUniqueInput<Schema, RelationFieldType<Schema, Model, Field>, Options>, true>
        : boolean | WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options>;

type NestedDeleteManyInput<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends RelationFields<Schema, Model>,
    Options extends QueryOptions<Schema>,
> = OrArray<WhereInput<Schema, RelationFieldType<Schema, Model, Field>, Options, true>>;

// #endregion

// #region Procedures

export type GetProcedureNames<Schema extends SchemaDef> = Schema extends { procedures: Record<string, ProcedureDef> }
    ? keyof Schema['procedures']
    : never;

export type GetProcedureParams<Schema extends SchemaDef, ProcName extends GetProcedureNames<Schema>> = Schema extends {
    procedures: Record<string, ProcedureDef>;
}
    ? Schema['procedures'][ProcName]['params']
    : never;

export type GetProcedure<Schema extends SchemaDef, ProcName extends GetProcedureNames<Schema>> = Schema extends {
    procedures: Record<string, ProcedureDef>;
}
    ? Schema['procedures'][ProcName]
    : never;

type _OptionalProcedureParamNames<Params> = keyof {
    [K in keyof Params as Params[K] extends { optional: true } ? K : never]: K;
};

type _RequiredProcedureParamNames<Params> = keyof {
    [K in keyof Params as Params[K] extends { optional: true } ? never : K]: K;
};

type _HasRequiredProcedureParams<Params> = _RequiredProcedureParamNames<Params> extends never ? false : true;

type MapProcedureArgsObject<Schema extends SchemaDef, Params> = Simplify<
    Optional<
        {
            [K in keyof Params]: MapProcedureParam<Schema, Params[K]>;
        },
        _OptionalProcedureParamNames<Params>
    >
>;

export type ProcedureEnvelope<
    Schema extends SchemaDef,
    ProcName extends GetProcedureNames<Schema>,
    Params = GetProcedureParams<Schema, ProcName>,
> = keyof Params extends never
    ? // no params
      { args?: Record<string, never> }
    : _HasRequiredProcedureParams<Params> extends true
      ? // has required params
        { args: MapProcedureArgsObject<Schema, Params> }
      : // no required params
        { args?: MapProcedureArgsObject<Schema, Params> };

type ProcedureHandlerCtx<Schema extends SchemaDef, ProcName extends GetProcedureNames<Schema>> = {
    client: ClientContract<Schema>;
} & ProcedureEnvelope<Schema, ProcName>;

/**
 * Shape of a procedure's runtime function.
 */
export type ProcedureFunc<Schema extends SchemaDef, ProcName extends GetProcedureNames<Schema>> = (
    ...args: _HasRequiredProcedureParams<GetProcedureParams<Schema, ProcName>> extends true
        ? [input: ProcedureEnvelope<Schema, ProcName>]
        : [input?: ProcedureEnvelope<Schema, ProcName>]
) => MaybePromise<MapProcedureReturn<Schema, GetProcedure<Schema, ProcName>>>;

/**
 * Signature for procedure handlers configured via client options.
 */
export type ProcedureHandlerFunc<Schema extends SchemaDef, ProcName extends GetProcedureNames<Schema>> = (
    ctx: ProcedureHandlerCtx<Schema, ProcName>,
) => MaybePromise<MapProcedureReturn<Schema, GetProcedure<Schema, ProcName>>>;

type MapProcedureReturn<Schema extends SchemaDef, Proc> = Proc extends { returnType: infer R }
    ? Proc extends { returnArray: true }
        ? Array<MapType<Schema, R & string>>
        : MapType<Schema, R & string>
    : never;

type MapProcedureParam<Schema extends SchemaDef, P> = P extends { type: infer U }
    ? OrUndefinedIf<
          P extends { array: true } ? Array<MapType<Schema, U & string>> : MapType<Schema, U & string>,
          P extends { optional: true } ? true : false
      >
    : never;

// #endregion

// #region Utilities

type NonOwnedRelationFields<Schema extends SchemaDef, Model extends GetModels<Schema>> = keyof {
    [Key in RelationFields<Schema, Model> as GetModelField<Schema, Model, Key>['relation'] extends {
        references: readonly unknown[];
    }
        ? never
        : Key]: true;
};

type HasToManyRelations<Schema extends SchemaDef, Model extends GetModels<Schema>> = keyof {
    [Key in RelationFields<Schema, Model> as FieldIsArray<Schema, Model, Key> extends true ? Key : never]: true;
} extends never
    ? false
    : true;

type EnumValue<Schema extends SchemaDef, Enum extends GetEnums<Schema>> = GetEnum<Schema, Enum>[keyof GetEnum<
    Schema,
    Enum
>];

type MapType<Schema extends SchemaDef, T extends string> = T extends keyof TypeMap
    ? TypeMap[T]
    : T extends GetModels<Schema>
      ? ModelResult<Schema, T>
      : T extends GetTypeDefs<Schema>
        ? TypeDefResult<Schema, T>
        : T extends GetEnums<Schema>
          ? EnumValue<Schema, T>
          : unknown;

type ProviderSupportsDistinct<Schema extends SchemaDef> = Schema['provider']['type'] extends 'postgresql'
    ? true
    : false;

/**
 * Extracts extended query args for a specific operation.
 */
type ExtractExtQueryArgs<ExtQueryArgs, Operation extends CoreCrudOperations> = (Operation extends keyof ExtQueryArgs
    ? ExtQueryArgs[Operation]
    : {}) &
    ('$create' extends keyof ExtQueryArgs
        ? Operation extends CoreCreateOperations
            ? ExtQueryArgs['$create']
            : {}
        : {}) &
    ('$read' extends keyof ExtQueryArgs ? (Operation extends CoreReadOperations ? ExtQueryArgs['$read'] : {}) : {}) &
    ('$update' extends keyof ExtQueryArgs
        ? Operation extends CoreUpdateOperations
            ? ExtQueryArgs['$update']
            : {}
        : {}) &
    ('$delete' extends keyof ExtQueryArgs
        ? Operation extends CoreDeleteOperations
            ? ExtQueryArgs['$delete']
            : {}
        : {}) &
    ('$all' extends keyof ExtQueryArgs ? ExtQueryArgs['$all'] : {});

// #endregion
