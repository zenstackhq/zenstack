import {
    ExpressionUtils,
    SchemaAccessor,
    type AttributeApplication,
    type FieldDef,
    type GetEnum,
    type GetEnums,
    type GetModels,
    type GetTypeDefs,
    type SchemaDef,
} from '@zenstackhq/schema';
import Decimal from 'decimal.js';
import z from 'zod';
import { SchemaFactoryError } from './error';
import type {
    GetModelCreateFieldsShape,
    GetModelFieldsShape,
    GetModelSchemaShapeWithOptions,
    GetModelUpdateFieldsShape,
    GetTypeDefFieldsShape,
    ModelSchemaOptions,
} from './types';
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

/** Internal untyped representation of the options object used at runtime. */
type RawOptions = {
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
    omit?: Record<string, unknown>;
};

/**
 * Recursive Zod schema that validates a `RawOptions` object at runtime,
 * enforcing the same mutual-exclusion rules that the TypeScript union type
 * enforces at compile time:
 *  - `select` and `include` cannot be used together.
 *  - `select` and `omit` cannot be used together.
 * Nested relation options are validated with the same rules.
 */
const rawOptionsSchema: z.ZodType<RawOptions> = z.lazy(() =>
    z
        .object({
            select: z.record(z.string(), z.union([z.boolean(), rawOptionsSchema])).optional(),
            include: z.record(z.string(), z.union([z.boolean(), rawOptionsSchema])).optional(),
            omit: z.record(z.string(), z.boolean()).optional(),
        })
        .superRefine((val, ctx) => {
            if (val.select && val.include) {
                ctx.addIssue({
                    code: 'custom',
                    message: '`select` and `include` cannot be used together',
                });
            }
            if (val.select && val.omit) {
                ctx.addIssue({
                    code: 'custom',
                    message: '`select` and `omit` cannot be used together',
                });
            }
        }),
);

class SchemaFactory<Schema extends SchemaDef> {
    private readonly schema: SchemaAccessor<Schema>;

    constructor(_schema: Schema) {
        this.schema = new SchemaAccessor(_schema);
    }

    makeModelSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): z.ZodObject<GetModelFieldsShape<Schema, Model>, z.core.$strict>;

    makeModelSchema<Model extends GetModels<Schema>, Options extends ModelSchemaOptions<Schema, Model>>(
        model: Model,
        options: Options,
    ): z.ZodObject<GetModelSchemaShapeWithOptions<Schema, Model, Options>, z.core.$strict>;

    makeModelSchema<Model extends GetModels<Schema>, Options extends ModelSchemaOptions<Schema, Model>>(
        model: Model,
        options?: Options,
    ): z.ZodObject<Record<string, z.ZodType>, z.core.$strict> {
        const modelDef = this.schema.requireModel(model);

        if (!options) {
            // ── No-options path (original behaviour) ─────────────────────────
            const fields: Record<string, z.ZodType> = {};

            for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
                if (fieldDef.relation) {
                    const relatedModelName = fieldDef.type;
                    const lazySchema: z.ZodType = z.lazy(() =>
                        this.makeModelSchema(relatedModelName as GetModels<Schema>),
                    );
                    // relation fields are always optional
                    fields[fieldName] = this.applyDescription(
                        this.applyCardinality(lazySchema, fieldDef).optional(),
                        fieldDef.attributes,
                    );
                } else {
                    fields[fieldName] = this.applyDescription(
                        this.makeScalarFieldSchema(fieldDef),
                        fieldDef.attributes,
                    );
                }
            }

            const shape = z.strictObject(fields);
            return this.applyDescription(
                addCustomValidation(shape, modelDef.attributes),
                modelDef.attributes,
            ) as unknown as z.ZodObject<GetModelFieldsShape<Schema, Model>, z.core.$strict>;
        }

        // ── Options path ─────────────────────────────────────────────────────
        const rawOptions = rawOptionsSchema.parse(options);
        const fields = this.buildFieldsWithOptions(model as string, rawOptions);
        const shape = z.strictObject(fields);
        // @@validate expressions reference fields by name. When `select` or
        // `omit` produces a partial shape, some fields referenced by @@validate
        // may be absent. Applying those rules would cause false negatives (the
        // field evaluates to null) or make the schema impossible to satisfy
        // (strict parsing rejects a field the refinement needs).
        // We therefore apply each @@validate rule only when every field it
        // references is present in the resulting shape.
        const presentFields = new Set(Object.keys(fields));
        const withValidation = addCustomValidation(shape, modelDef.attributes, presentFields);
        return this.applyDescription(withValidation, modelDef.attributes) as unknown as z.ZodObject<
            GetModelSchemaShapeWithOptions<Schema, Model, Options>,
            z.core.$strict
        >;
    }

    makeModelCreateSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): z.ZodObject<GetModelCreateFieldsShape<Schema, Model>, z.core.$strict> {
        const modelDef = this.schema.requireModel(model);
        const fields: Record<string, z.ZodType> = {};

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            // exclude relation, computed, delegate discriminator fields
            if (fieldDef.relation || fieldDef.computed || fieldDef.isDiscriminator) {
                continue;
            }

            let fieldSchema = this.makeScalarFieldSchema(fieldDef);
            if (fieldDef.optional || fieldDef.default !== undefined || fieldDef.updatedAt) {
                fieldSchema = fieldSchema.optional();
            }
            fields[fieldName] = this.applyDescription(fieldSchema, fieldDef.attributes);
        }

        const shape = z.strictObject(fields);
        return this.applyDescription(
            addCustomValidation(shape, modelDef.attributes),
            modelDef.attributes,
        ) as unknown as z.ZodObject<GetModelCreateFieldsShape<Schema, Model>, z.core.$strict>;
    }

    makeModelUpdateSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): z.ZodObject<GetModelUpdateFieldsShape<Schema, Model>, z.core.$strict> {
        const modelDef = this.schema.requireModel(model);
        const fields: Record<string, z.ZodType> = {};

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            // exclude relation, computed, delegate discriminator fields
            if (fieldDef.relation || fieldDef.computed || fieldDef.isDiscriminator) {
                continue;
            }

            let fieldSchema = this.makeScalarFieldSchema(fieldDef);
            fieldSchema = fieldSchema.optional();
            fields[fieldName] = this.applyDescription(fieldSchema, fieldDef.attributes);
        }

        const shape = z.strictObject(fields);
        return this.applyDescription(
            addCustomValidation(shape, modelDef.attributes),
            modelDef.attributes,
        ) as unknown as z.ZodObject<GetModelUpdateFieldsShape<Schema, Model>, z.core.$strict>;
    }

    // -------------------------------------------------------------------------
    // Options-aware field building
    // -------------------------------------------------------------------------

    /**
     * Internal loose options shape used at runtime (we've already validated the
     * type-level constraints via the overload signatures).
     */
    private buildFieldsWithOptions(model: string, options: RawOptions): Record<string, z.ZodType> {
        const { select, include, omit } = options;
        const modelDef = this.schema.requireModel(model);
        const fields: Record<string, z.ZodType> = {};

        if (select) {
            // ── select branch ────────────────────────────────────────────────
            // Only include fields that are explicitly listed with a truthy value.
            for (const [key, value] of Object.entries(select)) {
                if (!value) continue; // false → skip

                const fieldDef = modelDef.fields[key];
                if (!fieldDef) continue;

                if (fieldDef.relation) {
                    // Relation field: recurse if value is a nested options object,
                    // otherwise use the default lazy schema.
                    const subOptions = typeof value === 'object' ? (value as RawOptions) : undefined;
                    const relSchema = this.makeRelationFieldSchema(fieldDef, subOptions);
                    fields[key] = this.applyDescription(
                        this.applyCardinality(relSchema, fieldDef).optional(),
                        fieldDef.attributes,
                    );
                } else {
                    fields[key] = this.applyDescription(this.makeScalarFieldSchema(fieldDef), fieldDef.attributes);
                }
            }
        } else {
            // ── include + omit branch ────────────────────────────────────────
            // Start with all scalar fields, applying omit exclusions.
            for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
                if (fieldDef.relation) continue; // relations handled below

                // Skip if this field is explicitly omitted.
                if (omit && (omit as Record<string, unknown>)[fieldName] === true) continue;

                fields[fieldName] = this.applyDescription(this.makeScalarFieldSchema(fieldDef), fieldDef.attributes);
            }

            // Add included relation fields.
            if (include) {
                for (const [key, value] of Object.entries(include)) {
                    if (!value) continue; // false → skip

                    const fieldDef = modelDef.fields[key];
                    if (!fieldDef?.relation) continue;

                    const subOptions = typeof value === 'object' ? (value as RawOptions) : undefined;
                    const relSchema = this.makeRelationFieldSchema(fieldDef, subOptions);
                    fields[key] = this.applyDescription(
                        this.applyCardinality(relSchema, fieldDef).optional(),
                        fieldDef.attributes,
                    );
                }
            }
        }

        return fields;
    }

    /**
     * Build the inner Zod schema for a relation field, optionally with nested
     * query options.  Does NOT apply cardinality/optional wrappers — the caller
     * does that.
     */
    private makeRelationFieldSchema(fieldDef: FieldDef, subOptions?: RawOptions): z.ZodType {
        const relatedModelName = fieldDef.type as GetModels<Schema>;
        if (subOptions) {
            // Recurse: build the related model's schema with its own options.
            return this.makeModelSchema(relatedModelName, subOptions as ModelSchemaOptions<Schema, GetModels<Schema>>);
        }
        // No sub-options: use a lazy reference to the default schema so that
        // circular models don't cause infinite recursion at build time.
        return z.lazy(() => this.makeModelSchema(relatedModelName));
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

        let base: z.ZodType;
        switch (type) {
            case 'String':
                base = addStringValidation(z.string(), attributes);
                break;
            case 'Int':
                base = addNumberValidation(z.number().int(), attributes);
                break;
            case 'Float':
                base = addNumberValidation(z.number(), attributes);
                break;
            case 'Boolean':
                base = z.boolean();
                break;
            case 'BigInt':
                base = addBigIntValidation(z.bigint(), attributes);
                break;
            case 'Decimal':
                base = z.union([
                    addNumberValidation(z.number(), attributes) as z.ZodNumber,
                    addDecimalValidation(z.string(), attributes, true) as z.ZodString,
                    addDecimalValidation(z.instanceof(Decimal), attributes, true),
                ]);
                break;
            case 'DateTime':
                base = z.union([z.date(), z.iso.datetime()]);
                break;
            case 'Bytes':
                base = z.instanceof(Uint8Array);
                break;
            case 'Json':
                base = this.makeJsonSchema();
                break;
            case 'Unsupported':
                base = z.unknown();
                break;
            default: {
                const _exhaustive: never = type as never;
                throw new SchemaFactoryError(`Unsupported field type: ${_exhaustive}`);
            }
        }

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
            fields[fieldName] = this.applyDescription(this.makeScalarFieldSchema(fieldDef), fieldDef.attributes);
        }

        const shape = z.strictObject(fields);
        return this.applyDescription(
            addCustomValidation(shape, typeDef.attributes),
            typeDef.attributes,
        ) as unknown as z.ZodObject<GetTypeDefFieldsShape<Schema, Type>, z.core.$strict>;
    }

    makeEnumSchema<Enum extends GetEnums<Schema>>(
        _enum: Enum,
    ): z.ZodEnum<{ [Key in keyof GetEnum<Schema, Enum>]: GetEnum<Schema, Enum>[Key] }> {
        const enumDef = this.schema.requireEnum(_enum);
        const schema = z.enum(Object.keys(enumDef.values) as [string, ...string[]]);
        return this.applyDescription(schema, enumDef.attributes) as unknown as z.ZodEnum<{
            [Key in keyof GetEnum<Schema, Enum>]: GetEnum<Schema, Enum>[Key];
        }>;
    }

    private getMetaDescription(attributes: readonly AttributeApplication[] | undefined): string | undefined {
        if (!attributes) return undefined;
        for (const attr of attributes) {
            if (attr.name !== '@meta' && attr.name !== '@@meta') continue;
            const nameExpr = attr.args?.[0]?.value;
            if (!nameExpr || ExpressionUtils.getLiteralValue(nameExpr) !== 'description') continue;
            const valueExpr = attr.args?.[1]?.value;
            if (valueExpr) {
                return ExpressionUtils.getLiteralValue(valueExpr) as string | undefined;
            }
        }
        return undefined;
    }

    private applyDescription<T extends z.ZodType>(
        schema: T,
        attributes: readonly AttributeApplication[] | undefined,
    ): T {
        const description = this.getMetaDescription(attributes);
        if (description) {
            return schema.meta({ description }) as T;
        }
        return schema;
    }
}
