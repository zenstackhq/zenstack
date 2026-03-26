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
    select?: Record<string, true | RawOptions>;
    include?: Record<string, true | RawOptions>;
    omit?: Record<string, true>;
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
            select: z.record(z.string(), z.union([z.literal(true), rawOptionsSchema])).optional(),
            include: z.record(z.string(), z.union([z.literal(true), rawOptionsSchema])).optional(),
            omit: z.record(z.string(), z.literal(true)).optional(),
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
            // ── No-options path: scalar fields only (relations excluded by default) ──
            const fields: Record<string, z.ZodType> = {};

            for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
                // Relation fields are excluded by default — use `include` or `select`
                // to opt in, mirroring ORM behaviour and avoiding infinite
                // nesting for circular relations.
                if (fieldDef.relation) continue;

                fields[fieldName] = this.applyDescription(this.makeScalarFieldSchema(fieldDef), fieldDef.attributes);
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
        // @@validate conditions only reference scalar fields of the same model
        // (the ZModel compiler rejects relation fields). When `select` or `omit`
        // produces a partial shape some of those scalar fields may be absent;
        // we skip any rule that references a missing field so it can't produce
        // a false negative against a partial payload.
        const presentFields = this.buildPresentFields(model as string, rawOptions);
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
            // Only include fields that are explicitly listed (value is always `true` or nested options).
            for (const [key, value] of Object.entries(select)) {
                const fieldDef = modelDef.fields[key];
                if (!fieldDef) {
                    throw new SchemaFactoryError(`Field "${key}" does not exist on model "${model}"`);
                }

                if (fieldDef.relation) {
                    const subOptions = typeof value === 'object' ? (value as RawOptions) : undefined;
                    const relSchema = this.makeRelationFieldSchema(fieldDef, subOptions);
                    fields[key] = this.applyDescription(
                        this.applyCardinality(relSchema, fieldDef).optional(),
                        fieldDef.attributes,
                    );
                } else {
                    if (typeof value === 'object') {
                        throw new SchemaFactoryError(
                            `Field "${key}" on model "${model}" is a scalar field and cannot have nested options`,
                        );
                    }
                    fields[key] = this.applyDescription(this.makeScalarFieldSchema(fieldDef), fieldDef.attributes);
                }
            }
        } else {
            // ── include + omit branch ────────────────────────────────────────
            // Validate omit keys up-front.
            if (omit) {
                for (const key of Object.keys(omit)) {
                    const fieldDef = modelDef.fields[key];
                    if (!fieldDef) {
                        throw new SchemaFactoryError(`Field "${key}" does not exist on model "${model}"`);
                    }
                    if (fieldDef.relation) {
                        throw new SchemaFactoryError(
                            `Field "${key}" on model "${model}" is a relation field and cannot be used in "omit"`,
                        );
                    }
                }
            }

            // Start with all scalar fields, applying omit exclusions.
            for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
                if (fieldDef.relation) continue;

                if (omit?.[fieldName] === true) continue;
                fields[fieldName] = this.applyDescription(this.makeScalarFieldSchema(fieldDef), fieldDef.attributes);
            }

            // Validate include keys and add relation fields.
            if (include) {
                for (const [key, value] of Object.entries(include)) {
                    const fieldDef = modelDef.fields[key];
                    if (!fieldDef) {
                        throw new SchemaFactoryError(`Field "${key}" does not exist on model "${model}"`);
                    }
                    if (!fieldDef.relation) {
                        throw new SchemaFactoryError(
                            `Field "${key}" on model "${model}" is not a relation field and cannot be used in "include"`,
                        );
                    }

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
     * Returns the set of scalar field names that will be present in the
     * resulting schema after applying `options`. Used by `addCustomValidation`
     * to skip `@@validate` rules that reference an absent field.
     *
     * Only scalar fields matter here because `@@validate` conditions are
     * restricted by the ZModel compiler to scalar fields of the same model.
     */
    private buildPresentFields(model: string, options: RawOptions): ReadonlySet<string> {
        const { select, omit } = options;
        const modelDef = this.schema.requireModel(model);
        const fields = new Set<string>();

        if (select) {
            // Only scalar fields explicitly selected (value is always `true` or nested options).
            for (const [key] of Object.entries(select)) {
                const fieldDef = modelDef.fields[key];
                if (fieldDef && !fieldDef.relation) {
                    fields.add(key);
                }
            }
        } else {
            // All scalar fields minus explicitly omitted ones.
            for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
                if (fieldDef.relation) continue;
                if (omit?.[fieldName] === true) continue;
                fields.add(fieldName);
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
