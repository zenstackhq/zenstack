import type {
    FieldHasDefault,
    FieldIsArray,
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
    TypeDefFieldIsOptional,
} from '@zenstackhq/schema';
import type Decimal from 'decimal.js';
import type z from 'zod';

export type GetModelFieldsShape<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    // scalar fields
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? never
        : Field]: ZodOptionalAndNullableIf<
        MapModelFieldToZod<Schema, Model, Field>,
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
        : Field]: ZodOptionalIf<
        ZodOptionalAndNullableIf<MapModelFieldToZod<Schema, Model, Field>, ModelFieldIsOptional<Schema, Model, Field>>,
        FieldHasDefault<Schema, Model, Field>
    >;
};

export type GetModelUpdateFieldsShape<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
    [Field in GetModelFields<Schema, Model> as FieldIsRelation<Schema, Model, Field> extends true
        ? never
        : Field]: z.ZodOptional<
        ZodOptionalAndNullableIf<MapModelFieldToZod<Schema, Model, Field>, ModelFieldIsOptional<Schema, Model, Field>>
    >;
};

export type GetTypeDefFieldsShape<Schema extends SchemaDef, Type extends GetTypeDefs<Schema>> = {
    [Field in GetTypeDefFields<Schema, Type>]: ZodOptionalAndNullableIf<
        MapTypeDefFieldToZod<Schema, Type, Field>,
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
