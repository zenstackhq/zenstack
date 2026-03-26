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

export type GetModelFieldsShape<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    // scalar fields
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? never
        : Field]: ZodOptionalAndNullableIf<
        ZodArrayIf<MapModelFieldToZod<Schema, Model, Field>, FieldIsArray<Schema, Model, Field>>,
        ModelFieldIsOptional<Schema, Model, Field>
    >;
} & {
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
 * ORM-style query options accepted by `makeModelSchema`.
 *
 * Exactly mirrors the `select` / `include` / `omit` vocabulary:
 * - `select`  — pick specific fields (scalars and/or relations). Mutually
 *               exclusive with `include` and `omit`.
 * - `include` — start with all scalar fields, then add the named relation
 *               fields. Can be combined with `omit`.
 * - `omit`    — remove named scalar fields from the default scalar set.
 *               Can be combined with `include`, mutually exclusive with
 *               `select`.
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
> = Field & keyof GetModelFieldsShape<Schema, Model>;

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
> = GetModelFieldsShape<Schema, Model>[FieldInShape<Schema, Model, Field>];

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
      GetModelFieldsShape<Schema, Model>[FieldInShape<Schema, Model, Field>]
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
                  ? never
                  : Field
              : Field]: GetModelFieldsShape<Schema, Model>[FieldInShape<Schema, Model, Field>];
    } & (I extends object // included relation fields
        ? {
              [Field in keyof I & GetModelFields<Schema, Model>]: I[Field] extends object
                  ? RelationFieldZodWithOptions<Schema, Model, Field, I[Field]>
                  : RelationFieldZodDefault<Schema, Model, Field>;
          }
        : // no include — empty, so the intersection is a no-op
          {});

/**
 * The top-level conditional that maps options → Zod shape.
 *
 * - No options / undefined  → existing `GetModelFieldsShape` (no change).
 * - `{ select: S }`         → `BuildSelectShape`.
 * - `{ include?, omit? }`   → `BuildIncludeOmitShape`.
 */
export type GetModelSchemaShapeWithOptions<
    Schema extends SchemaDef,
    Model extends GetModels<Schema>,
    Options,
> = Options extends { select: infer S extends Record<string, unknown> }
    ? BuildSelectShape<Schema, Model, S>
    : Options extends {
            include?: infer I extends Record<string, unknown> | undefined;
            omit?: infer O extends Record<string, unknown> | undefined;
        }
      ? BuildIncludeOmitShape<Schema, Model, I, O>
      : GetModelFieldsShape<Schema, Model>;
