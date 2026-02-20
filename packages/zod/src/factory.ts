import {
    SchemaAccessor,
    type BuiltinType,
    type FieldDef,
    type FieldIsArray,
    type FieldIsRelation,
    type GetEnum,
    type GetEnums,
    type GetModelFields,
    type GetModelFieldType,
    type GetModels,
    type GetTypeDefFields,
    type GetTypeDefFieldType,
    type GetTypeDefs,
    type ModelFieldIsOptional,
    type SchemaDef,
    type TypeDefFieldIsOptional,
} from '@zenstackhq/schema';
import Decimal from 'decimal.js';
import { match } from 'ts-pattern';
import z from 'zod';
import {
    addBigIntValidation,
    addCustomValidation,
    addDecimalValidation,
    addNumberValidation,
    addStringValidation,
} from './utils';

export function createSchemaFactory<Schema extends SchemaDef>(schema: Schema) {
    return new SchemaFactory(schema);
}

class SchemaFactory<Schema extends SchemaDef> {
    private readonly schema: SchemaAccessor<Schema>;

    constructor(_schema: Schema) {
        this.schema = new SchemaAccessor(_schema);
    }

    makeModelSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): z.ZodObject<GetModelFieldsShape<Schema, Model>, z.core.$strict> {
        const modelDef = this.schema.models[model];
        if (!modelDef) {
            throw new Error(`Model "${model}" not found in schema`);
        }
        const fields: Record<string, z.ZodType> = {};

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.relation) {
                const relatedModelName = fieldDef.type;
                const lazySchema: z.ZodType = z.lazy(() => this.makeModelSchema(relatedModelName as GetModels<Schema>));
                // relation fields are always optional
                fields[fieldName] = this.applyCardinality(lazySchema, fieldDef).optional();
            } else {
                fields[fieldName] = this.makeScalarFieldSchema(fieldDef);
            }
        }

        const shape = z.strictObject(fields);
        return addCustomValidation(shape, modelDef.attributes) as unknown as z.ZodObject<
            GetModelFieldsShape<Schema, Model>,
            z.core.$strict
        >;
    }

    private makeScalarFieldSchema(fieldDef: FieldDef): z.ZodType {
        const { type, attributes } = fieldDef;

        // enum
        const enumDef = this.schema.getEnum(type);
        if (enumDef) {
            return this.applyCardinality(this.makeEnumSchema(type as GetEnums<Schema>), fieldDef);
        }

        // typedef
        const typedefDef = this.schema.getTypeDef(type);
        if (typedefDef) {
            return this.applyCardinality(this.makeTypeSchema(type as GetTypeDefs<Schema>), fieldDef);
        }

        const base = match<BuiltinType>(type as BuiltinType)
            .with('String', () => addStringValidation(z.string(), attributes))
            .with('Int', () => addNumberValidation(z.number().int(), attributes))
            .with('Float', () => addNumberValidation(z.number(), attributes))
            .with('Boolean', () => z.boolean())
            .with('BigInt', () => addBigIntValidation(z.bigint(), attributes))
            .with('Decimal', () =>
                z.union([
                    addNumberValidation(z.number(), attributes) as z.ZodNumber,
                    addDecimalValidation(z.string(), attributes, true) as z.ZodString,
                    addDecimalValidation(z.instanceof(Decimal), attributes, true),
                ]),
            )
            .with('DateTime', () => z.union([z.date(), z.iso.datetime()]))
            .with('Bytes', () => z.instanceof(Uint8Array))
            .with('Json', () => this.makeJsonSchema())
            .with('Unsupported', () => z.unknown())
            .exhaustive();

        return this.applyCardinality(base, fieldDef);
    }

    private makeJsonSchema(): z.ZodType {
        return z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.null(),
            z.array(z.lazy(() => this.makeJsonSchema())),
            z.object({}).catchall(z.lazy(() => this.makeJsonSchema())),
        ]);
    }

    private applyCardinality(schema: z.ZodType, fieldDef: FieldDef): z.ZodType {
        let result = schema;
        if (fieldDef.array) {
            result = result.array();
        }
        if (fieldDef.optional) {
            result = result.nullable().optional();
        }
        return result;
    }

    makeTypeSchema<Type extends GetTypeDefs<Schema>>(
        type: Type,
    ): z.ZodObject<GetTypeDefFieldsShape<Schema, Type>, z.core.$strict> {
        const typeDef = this.schema.requireTypeDef(type);
        const fields: Record<string, z.ZodType> = {};

        for (const [fieldName, fieldDef] of Object.entries(typeDef.fields)) {
            fields[fieldName] = this.makeScalarFieldSchema(fieldDef);
        }

        const shape = z.strictObject(fields);
        return addCustomValidation(shape, typeDef.attributes) as unknown as z.ZodObject<
            GetTypeDefFieldsShape<Schema, Type>,
            z.core.$strict
        >;
    }

    makeEnumSchema<Enum extends GetEnums<Schema>>(
        _enum: Enum,
    ): z.ZodEnum<{ [Key in keyof GetEnum<Schema, Enum>]: GetEnum<Schema, Enum>[Key] }> {
        const enumDef = this.schema.requireEnum(_enum);
        return z.enum(Object.keys(enumDef.values) as [string, ...string[]]) as unknown as z.ZodEnum<{
            [Key in keyof GetEnum<Schema, Enum>]: GetEnum<Schema, Enum>[Key];
        }>;
    }
}

type GetModelFieldsShape<Schema extends SchemaDef, Model extends GetModels<Schema>> = {
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

type GetTypeDefFieldsShape<Schema extends SchemaDef, Type extends GetTypeDefs<Schema>> = {
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

type ZodNullableIf<T extends z.ZodType, Condition extends boolean> = Condition extends true ? z.ZodNullable<T> : T;
type ZodArrayIf<T extends z.ZodType, Condition extends boolean> = Condition extends true ? z.ZodArray<T> : T;
