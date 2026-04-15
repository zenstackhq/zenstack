import type {
    FieldHasDefault,
    FieldIsArray,
    FieldIsComputed,
    FieldIsDelegateDiscriminator,
    FieldIsRelation,
    GetEnum,
    GetEnums,
    GetModelFields,
    GetModelFieldType,
    GetModels,
    GetTypeDefFields,
    GetTypeDefFieldType,
    GetTypeDefs,
    ModelFieldIsOptional,
    SchemaDef,
    TypeDefFieldIsArray,
    TypeDefFieldIsOptional,
} from '@zenstackhq/schema';
import type Decimal from 'decimal.js';
import type z from 'zod';

/**
 * Scalar-only shape returned by the no-options `makeModelSchema` overload.
 * Relation fields are excluded by default — use `include` or `select` to opt in.
 */
export type GetModelFieldsShape<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? never
        : Field]: ZodOptionalAndNullableIf<
        ZodArrayIf<MapModelFieldToZod<Schema, Model, Field>, FieldIsArray<Schema, Model, Field>>,
        ModelFieldIsOptional<Schema, Model, Field>
    >;
};

/**
 * Full shape including both scalar and relation fields — used internally for
 * type lookups (e.g. resolving relation field Zod types in include/select).
 */
type GetAllModelFieldsShape<Schema extends SchemaDef, Model extends GetModels<Schema>> = GetModelFieldsShape<
    Schema,
    Model
> & {
    // relation fields, always optional
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? Field
        : never]: ZodNullableIf<
        z.ZodOptional<
            ZodArrayIf<
                z.ZodObject<
                    GetModelFieldsShape<
                        Schema,
                        GetModelFieldType<Schema, Model, Field> extends GetModels<Schema>
                            ? GetModelFieldType<Schema, Model, Field>
                            : never
                    >,
                    z.core.$strict
                >,
                FieldIsArray<Schema, Model, Field>
            >
        >,
        ModelFieldIsOptional<Schema, Model, Field>
    >;
};

export type GetModelCreateFieldsShape<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? never
        : FieldIsComputed<Schema, Model, Field> extends true
          ? never
          : FieldIsDelegateDiscriminator<Schema, Model, Field> extends true
            ? never
            : Field]: ZodOptionalIf<
        ZodOptionalAndNullableIf<
            ZodArrayIf<MapModelFieldToZod<Schema, Model, Field>, FieldIsArray<Schema, Model, Field>>,
            ModelFieldIsOptional<Schema, Model, Field>
        >,
        FieldHasDefault<Schema, Model, Field>
    >;
};

export type GetModelUpdateFieldsShape<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? never
        : FieldIsComputed<Schema, Model, Field> extends true
          ? never
          : FieldIsDelegateDiscriminator<Schema, Model, Field> extends true
            ? never
            : Field]: z.ZodOptional<
        ZodOptionalAndNullableIf<
            ZodArrayIf<MapModelFieldToZod<Schema, Model, Field>, FieldIsArray<Schema, Model, Field>>,
            ModelFieldIsOptional<Schema, Model, Field>
        >
    >;
};

export type GetTypeDefFieldsShape<Schema extends SchemaDef, Type extends GetTypeDefs<Schema>> = {
    [Field in GetTypeDefFields<Schema, Type>]: ZodOptionalAndNullableIf<
        ZodArrayIf<MapTypeDefFieldToZod<Schema, Type, Field>, TypeDefFieldIsArray<Schema, Type, Field>>,
        TypeDefFieldIsOptional<Schema, Type, Field>
    >;
};

type FieldTypeZodMap = {
    String: z.ZodString;
    Int: z.ZodNumber;
    BigInt: z.ZodBigInt;
    Float: z.ZodNumber;
    Decimal: z.ZodType<Decimal>;
    Boolean: z.ZodBoolean;
    DateTime: z.ZodType<Date>;
    Bytes: z.ZodType<Uint8Array>;
    Json: JsonZodType;
};

type MapModelFieldToZod<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    FieldType = GetModelFieldType<Schema, Model, Field>,
> = MapFieldTypeToZod<Schema, FieldType>;

type MapTypeDefFieldToZod<
    Schema extends SchemaDef,
    Type extends GetTypeDefs<Schema>,
    Field extends GetTypeDefFields<Schema, Type>,
    FieldType = GetTypeDefFieldType<Schema, Type, Field>,
> = MapFieldTypeToZod<Schema, FieldType>;

type MapFieldTypeToZod<Schema extends SchemaDef, FieldType> = FieldType extends keyof FieldTypeZodMap
    ? FieldTypeZodMap[FieldType]
    : FieldType extends GetEnums<Schema>
      ? EnumZodType<Schema, FieldType>
      : FieldType extends GetTypeDefs<Schema>
        ? z.ZodObject<GetTypeDefFieldsShape<Schema, FieldType>, z.core.$strict>
        : z.ZodUnknown;

type JsonZodType =
    | z.ZodObject<Record<string, z.ZodType>, z.core.$loose>
    | z.ZodArray<z.ZodType>
    | z.ZodString
    | z.ZodNumber
    | z.ZodBoolean
    | z.ZodNull;

type EnumZodType<Schema extends SchemaDef, EnumName extends GetEnums<Schema>> = z.ZodEnum<{
    [Key in keyof GetEnum<Schema, EnumName>]: GetEnum<Schema, EnumName>[Key];
}>;

type ZodOptionalAndNullableIf<T extends z.ZodType, Condition extends boolean> = Condition extends true
    ? z.ZodOptional<z.ZodNullable<T>>
    : T;

type ZodOptionalIf<T extends z.ZodType, Condition extends boolean> = Condition extends true ? z.ZodOptional<T> : T;
type ZodNullableIf<T extends z.ZodType, Condition extends boolean> = Condition extends true ? z.ZodNullable<T> : T;
type ZodArrayIf<T extends z.ZodType, Condition extends boolean> = Condition extends true ? z.ZodArray<T> : T;

// -------------------------------------------------------------------------
// Query options types (ORM-style include / select / omit)
// -------------------------------------------------------------------------

/**
 * The non-relation scalar fields of a model (excludes relation fields and
 * foreign-key fields that back a relation).
 */
type ScalarModelFields<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? never
        : Field]: Field;
};

/**
 * The relation fields of a model.
 */
type RelationModelFields<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? Field
        : never]: Field;
};

/**
 * For a relation field, resolve the related model name.
 */
type RelatedModel<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = GetModelFieldType<Schema, Model, Field> extends GetModels<Schema> ? GetModelFieldType<Schema, Model, Field> : never;

/**
 * Controls which fields are made optional in the generated schema.
 *
 * - `"all"`      — every field in the schema becomes optional.
 * - `"defaults"` — only fields that have a default value (`@default`) or are
 *                  auto-managed (`@updatedAt`) are made optional; all other
 *                  fields retain their original optionality.
 */
export type ModelSchemaOptionality = 'all' | 'defaults';

/**
 * ORM-style query options accepted by `makeModelSchema`.
 *
 * Exactly mirrors the `select` / `include` / `omit` vocabulary:
 * - `select`      — pick specific fields (scalars and/or relations). Mutually
 *                   exclusive with `include` and `omit`.
 * - `include`     — start with all scalar fields, then add the named relation
 *                   fields. Can be combined with `omit`.
 * - `omit`        — remove named scalar fields from the default scalar set.
 *                   Can be combined with `include`, mutually exclusive with
 *                   `select`.
 * - `optionality` — when `"all"`, every field becomes optional. When
 *                   `"defaults"`, only fields with a `@default` value or
 *                   `@updatedAt` are made optional.
 */
export type ModelSchemaOptions<Schema extends SchemaDef, Model extends GetModels<Schema>> =
    | {
          /**
           * Pick only the listed fields. Values must be `true` (include with
           * default shape) or a nested options object (for relation fields).
           * Only `true` is accepted — ORM convention.
           */
          select: {
              [Field in GetModelFields<Schema, Model>]?: FieldIsRelation<Schema, Model, Field> extends true
                  ? true | ModelSchemaOptions<Schema, RelatedModel<Schema, Model, Field>>
                  : true;
          };
          include?: never;
          omit?: never;
          /**
           * Controls which fields are made optional.
           * - `"all"`      — every field becomes optional.
           * - `"defaults"` — only fields with `@default` or `@updatedAt` become optional.
           */
          optionality?: ModelSchemaOptionality;
      }
    | {
          select?: never;
          /**
           * Add the listed relation fields on top of the scalar fields.
           * Values must be `true` (default shape) or a nested options object.
           * Only `true` is accepted — ORM convention.
           */
          include?: {
              [Field in keyof RelationModelFields<Schema, Model>]?: Field extends GetModelFields<Schema, Model>
                  ? true | ModelSchemaOptions<Schema, RelatedModel<Schema, Model, Field>>
                  : never;
          };
          /**
           * Remove the listed scalar fields from the output.
           * Only `true` is accepted — ORM convention.
           */
          omit?: {
              [Field in keyof ScalarModelFields<Schema, Model>]?: true;
          };
          /**
           * Controls which fields are made optional.
           * - `"all"`      — every field becomes optional.
           * - `"defaults"` — only fields with `@default` or `@updatedAt` become optional.
           */
          optionality?: ModelSchemaOptionality;
      };

// ---- Output shape helpers ------------------------------------------------

/**
 * Narrows `Field` so it can safely index `GetModelFieldsShape`. The mapped
 * type uses a `as`-remapping clause, so TypeScript widens the key set and
 * `Field extends GetModelFields<…>` alone is not enough for indexing.
 */
type FieldInShape<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = Field & keyof GetAllModelFieldsShape<Schema, Model>;

/**
 * Zod shape produced when a relation field is included via `include: { field:
 * true }` or `select: { field: true }` — identical to how the existing
 * `makeModelSchema` (no-options) represents relation fields: optional, carries
 * array-ness and nullability from the field definition.
 */
type RelationFieldZodDefault<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
> = GetAllModelFieldsShape<Schema, Model>[FieldInShape<Schema, Model, Field>];

/**
 * Zod shape for a relation field included with nested options.  We recurse
 * into `GetModelSchemaShapeWithOptions` for the related model, then re-apply
 * the same optional/array/nullable wrappers as the default relation field.
 */
type RelationFieldZodWithOptions<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    Options,
> =
    RelatedModel<Schema, Model, Field> extends GetModels<Schema>
        ? ZodNullableIf<
              z.ZodOptional<
                  ZodArrayIf<
                      z.ZodObject<
                          GetModelSchemaShapeWithOptions<Schema, RelatedModel<Schema, Model, Field>, Options>,
                          z.core.$strict
                      >,
                      FieldIsArray<Schema, Model, Field>
                  >
              >,
              ModelFieldIsOptional<Schema, Model, Field>
          >
        : never;

/**
 * Resolve the Zod type for a single field given a select-entry value (`true`
 * or a nested options object).
 */
type SelectEntryToZod<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Field extends GetModelFields<Schema, Model>,
    Value,
> = Value extends boolean
    ? // `true` or widened `boolean` — use the default shape for this field.
      // Handling `boolean` (not just literal `true`) prevents the type from
      // collapsing to `never` when callers use a boolean variable instead of
      // a literal (e.g. `const pick: boolean = true`).
      GetAllModelFieldsShape<Schema, Model>[FieldInShape<Schema, Model, Field>]
    : Value extends object
      ? // nested options — must be a relation field
        RelationFieldZodWithOptions<Schema, Model, Field, Value>
      : never;

/**
 * Build the Zod shape for the `select` branch: only the listed fields,
 * recursing into relations when given nested options.
 */
type BuildSelectShape<Schema extends SchemaDef, Model extends GetModels<Schema>, S extends Record<string, unknown>> = {
    [Field in keyof S & GetModelFields<Schema, Model>]: SelectEntryToZod<Schema, Model, Field, S[Field]>;
};

/**
 * Build the Zod shape for the `include` + `omit` branch:
 * - All scalar fields, minus any that appear in `omit` with value `true`.
 * - Plus the relation fields listed in `include`.
 */
type BuildIncludeOmitShape<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    I extends Record<string, unknown> | undefined,
    O extends Record<string, unknown> | undefined,
> =
    // scalar fields, omitting those explicitly excluded (only `true` omits a field)
    {
        [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
            ? never
            : O extends object
              ? Field extends keyof O
                  ? O[Field] extends true
                      ? never
                      : Field
                  : Field
              : Field]: GetAllModelFieldsShape<Schema, Model>[FieldInShape<Schema, Model, Field>];
    } & (I extends object // included relation fields
        ? {
              [Field in keyof I & GetModelFields<Schema, Model>]: I[Field] extends object
                  ? RelationFieldZodWithOptions<Schema, Model, Field, I[Field]>
                  : RelationFieldZodDefault<Schema, Model, Field>;
          }
        : // no include — empty, so the intersection is a no-op
          {});

/**
 * Wraps every field in a shape with `z.ZodOptional` when `Optionality` is `"all"`.
 * When `Optionality` is `"defaults"`, only fields that carry a `@default` or
 * `@updatedAt` attribute (as detected by `FieldHasDefault`) are wrapped.
 * When `Optionality` is anything else the shape is returned as-is.
 */
type ApplyOptionality<
    Shape extends Record<string, z.ZodType>,
    Optionality,
    Schema extends SchemaDef = never,
    Model extends GetModels<Schema> = never,
> = Optionality extends 'all'
    ? { [K in keyof Shape]: z.ZodOptional<Shape[K]> }
    : Optionality extends 'defaults'
      ? {
            [K in keyof Shape]: K extends GetModelFields<Schema, Model>
                ? FieldHasDefault<Schema, Model, K> extends true
                    ? z.ZodOptional<Shape[K]>
                    : Shape[K]
                : Shape[K];
        }
      : Shape;

/**
 * The top-level conditional that maps options → Zod shape.
 *
 * - No options / undefined  → existing `GetModelFieldsShape` (no change).
 * - `{ select: S }`         → `BuildSelectShape` (+ optionality wrapper).
 * - `{ include?, omit? }`   → `BuildIncludeOmitShape` (+ optionality wrapper).
 *
 * `optionality: "defaults"` is inferred statically using `FieldHasDefault`,
 * which inspects the `default` and `updatedAt` fields on `FieldDef` to
 * determine which fields should become optional.
 */
export type GetModelSchemaShapeWithOptions<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options,
> = Options extends { select: infer S extends Record<string, unknown>; optionality?: infer Opt }
    ? ApplyOptionality<BuildSelectShape<Schema, Model, S>, Opt, Schema, Model>
    : Options extends {
            include?: infer I extends Record<string, unknown> | undefined;
            omit?: infer O extends Record<string, unknown> | undefined;
            optionality?: infer Opt;
        }
      ? ApplyOptionality<BuildIncludeOmitShape<Schema, Model, I, O>, Opt, Schema, Model>
      : GetModelFieldsShape<Schema, Model>;
