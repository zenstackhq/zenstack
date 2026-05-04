import { enumerate, invariant, lowerCaseFirst, upperCaseFirst } from '@zenstackhq/common-helpers';
import {
    type AttributeApplication,
    type BuiltinType,
    type FieldDef,
    type GetModels,
    type SchemaDef,
} from '@zenstackhq/schema';
import { ZodUtils } from '@zenstackhq/zod';
import Decimal from 'decimal.js';
import { match, P } from 'ts-pattern';
import { z, ZodObject, ZodType } from 'zod';
import { AnyNullClass, DbNullClass, JsonNullClass } from '../../common-types';
import { extractFields } from '../../utils/object-utils';
import { AggregateOperators, FILTER_PROPERTY_TO_KIND, LOGICAL_COMBINATORS, NUMERIC_FIELD_TYPES } from '../constants';
import type { ClientContract } from '../contract';
import type {
    AggregateArgs,
    CountArgs,
    CreateArgs,
    CreateManyAndReturnArgs,
    CreateManyArgs,
    DeleteArgs,
    DeleteManyArgs,
    ExistsArgs,
    FindFirstArgs,
    FindManyArgs,
    FindUniqueArgs,
    GroupByArgs,
    UpdateArgs,
    UpdateManyAndReturnArgs,
    UpdateManyArgs,
    UpsertArgs,
} from '../crud-types';
import {
    CoreCreateOperations,
    CoreDeleteOperations,
    CoreReadOperations,
    CoreUpdateOperations,
    type CoreCrudOperations,
} from '../crud/operations/base';
import { createInternalError } from '../errors';
import type { ClientOptions, QueryOptions } from '../options';
import type { AnyPlugin, ExtQueryArgsBase } from '../plugin';
import {
    fieldHasDefaultValue,
    getEnum,
    getTypeDef,
    getUniqueFields,
    isEnum,
    isTypeDef,
    requireField,
    requireModel,
} from '../query-utils';
import { cache } from './cache-decorator';

/**
 * Create a factory for generating Zod schemas to validate ORM query inputs.
 */
export function createQuerySchemaFactory<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
>(client: ClientContract<Schema, Options, ExtQueryArgs>): ZodSchemaFactory<Schema, Options, ExtQueryArgs>;

/**
 * Create a factory for generating Zod schemas to validate ORM query inputs.
 */
export function createQuerySchemaFactory<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
>(schema: Schema, options?: Options): ZodSchemaFactory<Schema, Options, ExtQueryArgs>;

/**
 * Create a factory using only query options (e.g. slicing) without a full client config.
 */
export function createQuerySchemaFactory<Schema extends SchemaDef>(
    schema: Schema,
    options?: QueryOptions<Schema>,
): ZodSchemaFactory<Schema>;

export function createQuerySchemaFactory(clientOrSchema: any, options?: any) {
    return new ZodSchemaFactory(clientOrSchema, options);
}

/**
 * Options for creating Zod schemas.
 */
export type CreateSchemaOptions = {
    /**
     * Controls the depth of relation nesting in the generated schema. Default is unlimited.
     */
    relationDepth?: number;
};

/**
 * Factory class responsible for creating and caching Zod schemas for ORM input validation.
 */
export class ZodSchemaFactory<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> {
    private readonly schemaCache = new Map<string, ZodType>();
    private readonly schemaRegistry = z.registry<{ id: string }>();
    private readonly allFilterKinds = [...new Set(Object.values(FILTER_PROPERTY_TO_KIND))];
    private readonly schema: Schema;
    private readonly options: Options;
    private readonly extraValidationsEnabled = true;

    constructor(client: ClientContract<Schema, Options, ExtQueryArgs, any>);
    constructor(schema: Schema, options?: Options);
    constructor(clientOrSchema: any, options?: Options) {
        if ('$schema' in clientOrSchema) {
            this.schema = clientOrSchema.$schema;
            this.options = clientOrSchema.$options;
        } else {
            this.schema = clientOrSchema;
            this.options = options || ({} as Options);
        }
    }

    private get plugins(): AnyPlugin[] {
        return this.options.plugins ?? [];
    }

    /**
     * Returns model field entries, excluding Unsupported fields.
     */
    private getModelFields(model: string): [string, FieldDef][] {
        const modelDef = requireModel(this.schema, model);
        return Object.entries(modelDef.fields).filter(([, def]) => def.type !== 'Unsupported');
    }

    private shouldIncludeRelations(options?: CreateSchemaOptions): boolean {
        return options?.relationDepth === undefined || options.relationDepth > 0;
    }

    private nextOptions(options?: CreateSchemaOptions): CreateSchemaOptions | undefined {
        if (!options) return undefined;
        if (options.relationDepth === undefined) return options;
        return { ...options, relationDepth: options.relationDepth - 1 };
    }

    // #region Cache Management

    // @ts-ignore
    private getCache(cacheKey: string) {
        return this.schemaCache.get(cacheKey);
    }

    // @ts-ignore
    private setCache(cacheKey: string, schema: ZodType) {
        this.schemaCache.set(cacheKey, schema);
    }

    /**
     * Builds a suffix to append to schema IDs when filter variants differ from defaults.
     * Ensures different combinations of optional, array, and allowedFilterKinds produce distinct registry entries.
     */
    private filterSchemaSuffix(opts: {
        optional?: boolean;
        array?: boolean;
        withAggregations?: boolean;
        allowedFilterKinds?: string[] | undefined;
    }): string {
        const parts: string[] = [];
        if (opts.optional) parts.push('Optional');
        if (opts.array) parts.push('Array');
        if (opts.withAggregations) parts.push('Agg');
        if (opts.allowedFilterKinds) parts.push(...opts.allowedFilterKinds.slice().sort());
        return parts.length ? `${parts.join('')}` : '';
    }

    /**
     * Registers a schema in the registry under the given id.
     * Safe to call multiple times with the same id: first registration wins, subsequent ones are silently skipped.
     */
    private registerSchema(id: string, schema: ZodType) {
        if (!this.schemaRegistry.has(schema)) {
            try {
                this.schemaRegistry.add(schema, { id });
            } catch {
                // id already taken by a different schema variant (e.g. different options) — skip
            }
        }
    }

    /**
     * Returns a JSON Schema document containing all registered Zod schemas as named definitions.
     * The returned object has the shape `{ schemas: { [id]: jsonSchema } }`.
     *
     * Eagerly builds all top-level schemas for every model so the registry is fully populated
     * before serialization.
     */
    toJSONSchema() {
        // Reset both the registry and the builder cache so that all eager calls
        // below re-execute their bodies and re-register schemas into the fresh registry.
        this.schemaCache.clear();
        this.schemaRegistry.clear();

        // Eagerly build schemas for included models so they are registered before serialization.
        for (const model of Object.keys(this.schema.models).filter((m) => this.isModelAllowed(m))) {
            const m = model as GetModels<Schema>;
            this.makeFindUniqueSchema(m);
            this.makeFindFirstSchema(m);
            this.makeFindManySchema(m);
            this.makeExistsSchema(m);
            this.makeCreateSchema(m);
            this.makeCreateManySchema(m);
            this.makeCreateManyAndReturnSchema(m);
            this.makeUpdateSchema(m);
            this.makeUpdateManySchema(m);
            this.makeUpdateManyAndReturnSchema(m);
            this.makeUpsertSchema(m);
            this.makeDeleteSchema(m);
            this.makeDeleteManySchema(m);
            this.makeCountSchema(m);
            this.makeAggregateSchema(m);
            this.makeGroupBySchema(m);
        }
        // Eagerly build args schemas for allowed procedures only.
        for (const procName of Object.keys(this.schema.procedures ?? {})) {
            if (this.isProcedureAllowed(procName)) {
                this.makeProcedureArgsSchema(procName);
            }
        }
        return z.toJSONSchema(this.schemaRegistry, { unrepresentable: 'any' });
    }

    get cacheStats() {
        return {
            size: this.schemaCache.size,
            keys: [...this.schemaCache.keys()],
        };
    }

    // #endregion

    // #region Find

    makeFindUniqueSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<FindUniqueArgs<Schema, Model, Options, ExtQueryArgs>> {
        return this.makeFindSchema(model, 'findUnique', options) as ZodType<
            FindUniqueArgs<Schema, Model, Options, ExtQueryArgs>
        >;
    }

    makeFindFirstSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<FindFirstArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        return this.makeFindSchema(model, 'findFirst', options) as ZodType<
            FindFirstArgs<Schema, Model, Options, ExtQueryArgs> | undefined
        >;
    }

    makeFindManySchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<FindManyArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        return this.makeFindSchema(model, 'findMany', options) as ZodType<
            FindManyArgs<Schema, Model, Options, ExtQueryArgs> | undefined
        >;
    }

    @cache()
    private makeFindSchema(model: string, operation: CoreCrudOperations, options?: CreateSchemaOptions) {
        const fields: Record<string, z.ZodSchema> = {};
        const unique = operation === 'findUnique';
        const findOne = operation === 'findUnique' || operation === 'findFirst';
        const where = this.makeWhereSchema(model, unique, false, false, options);
        if (unique) {
            fields['where'] = where;
        } else {
            fields['where'] = where.optional();
        }

        fields['select'] = this.makeSelectSchema(model, options).optional().nullable();
        fields['include'] = this.makeIncludeSchema(model, options).optional().nullable();
        fields['omit'] = this.makeOmitSchema(model).optional().nullable();

        if (!unique) {
            fields['skip'] = this.makeSkipSchema().optional();
            if (findOne) {
                fields['take'] = z.literal(1).optional();
            } else {
                fields['take'] = this.makeTakeSchema().optional();
            }
            fields['orderBy'] = this.orArray(this.makeOrderBySchema(model, true, false, options), true).optional();
            fields['cursor'] = this.makeCursorSchema(model, options).optional();
            fields['distinct'] = this.makeDistinctSchema(model).optional();
        }

        const baseSchema = z.strictObject(fields);
        let result: ZodType = this.mergePluginArgsSchema(baseSchema, operation);
        result = this.refineForSelectIncludeMutuallyExclusive(result);
        result = this.refineForSelectOmitMutuallyExclusive(result);
        result = this.refineForSelectHasTruthyField(result);

        if (!unique) {
            result = result.optional();
        }
        this.registerSchema(`${model}${upperCaseFirst(operation)}Args`, result);
        return result;
    }

    @cache()
    makeExistsSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<ExistsArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, false, false, false, options).optional(),
        });
        const result = this.mergePluginArgsSchema(baseSchema, 'exists').optional() as ZodType<
            ExistsArgs<Schema, Model, Options, ExtQueryArgs> | undefined
        >;
        this.registerSchema(`${model}ExistsArgs`, result);
        return result;
    }

    private makeScalarSchema(type: string, attributes?: readonly AttributeApplication[]) {
        if (this.schema.typeDefs && type in this.schema.typeDefs) {
            return this.makeTypeDefSchema(type);
        } else if (this.schema.enums && type in this.schema.enums) {
            return this.makeEnumSchema(type);
        } else {
            return match(type)
                .with('String', () =>
                    this.extraValidationsEnabled ? ZodUtils.addStringValidation(z.string(), attributes) : z.string(),
                )
                .with('Int', () =>
                    this.extraValidationsEnabled
                        ? ZodUtils.addNumberValidation(z.number().int(), attributes)
                        : z.number().int(),
                )
                .with('Float', () =>
                    this.extraValidationsEnabled ? ZodUtils.addNumberValidation(z.number(), attributes) : z.number(),
                )
                .with('Boolean', () => z.boolean())
                .with('BigInt', () =>
                    z.union([
                        this.extraValidationsEnabled
                            ? ZodUtils.addNumberValidation(z.number().int(), attributes)
                            : z.number().int(),
                        this.extraValidationsEnabled
                            ? ZodUtils.addBigIntValidation(z.bigint(), attributes)
                            : z.bigint(),
                    ]),
                )
                .with('Decimal', () => {
                    return z.union([
                        this.extraValidationsEnabled
                            ? ZodUtils.addNumberValidation(z.number(), attributes)
                            : z.number(),
                        ZodUtils.addDecimalValidation(z.instanceof(Decimal), attributes, this.extraValidationsEnabled),
                        ZodUtils.addDecimalValidation(z.string(), attributes, this.extraValidationsEnabled),
                    ]);
                })
                .with('DateTime', () => this.makeDateTimeValueSchema())
                .with('Bytes', () => z.instanceof(Uint8Array))
                .with('Json', () => this.makeJsonValueSchema())
                .otherwise(() => z.unknown());
        }
    }

    @cache()
    private makeEnumSchema(_enum: string) {
        const enumDef = getEnum(this.schema, _enum);
        invariant(enumDef, `Enum "${_enum}" not found in schema`);
        const schema = z.enum(Object.keys(enumDef.values) as [string, ...string[]]);
        this.registerSchema(_enum, schema);
        return schema;
    }

    @cache()
    private makeTypeDefSchema(type: string): ZodType {
        const typeDef = getTypeDef(this.schema, type);
        invariant(typeDef, `Type definition "${type}" not found in schema`);
        const schema = z.looseObject(
            Object.fromEntries(
                Object.entries(typeDef.fields).map(([field, def]) => {
                    let fieldSchema = this.makeScalarSchema(def.type);
                    if (def.array) {
                        fieldSchema = fieldSchema.array();
                    }
                    if (def.optional) {
                        fieldSchema = fieldSchema.nullish();
                    }
                    return [field, fieldSchema];
                }),
            ),
        );

        // zod doesn't preserve object field order after parsing, here we use a
        // validation-only custom schema and use the original data if parsing
        // is successful
        const finalSchema = z.any().superRefine((value, ctx) => {
            const parseResult = schema.safeParse(value);
            if (!parseResult.success) {
                parseResult.error.issues.forEach((issue) => ctx.addIssue(issue as any));
            }
        });

        this.registerSchema(type, finalSchema);
        return finalSchema;
    }

    @cache()
    makeWhereSchema(
        model: string,
        unique: boolean,
        withoutRelationFields = false,
        withAggregations = false,
        options?: CreateSchemaOptions,
    ): ZodType {
        // unique field used in unique filters bypass filter slicing
        const uniqueFieldNames = unique
            ? getUniqueFields(this.schema, model)
                  .filter(
                      (uf): uf is { name: string; def: FieldDef } =>
                          // single-field unique
                          'def' in uf,
                  )
                  .map((uf) => uf.name)
            : undefined;

        const nextOpts = this.nextOptions(options);

        const fields: Record<string, any> = {};
        for (const [field, fieldDef] of this.getModelFields(model)) {
            let fieldSchema: ZodType | undefined;

            if (fieldDef.relation) {
                if (withoutRelationFields || !this.shouldIncludeRelations(options)) {
                    continue;
                }

                // Check if Relation filter kind is allowed
                const allowedFilterKinds = this.getEffectiveFilterKinds(model, field);
                if (allowedFilterKinds && !allowedFilterKinds.includes('Relation')) {
                    // Relation filters are not allowed for this field - use z.never()
                    fieldSchema = z.never();
                } else {
                    fieldSchema = z.lazy(() =>
                        this.makeWhereSchema(fieldDef.type, false, false, false, nextOpts).optional(),
                    );

                    if (fieldDef.array) {
                        // to-many relation
                        fieldSchema = z.strictObject({
                            some: fieldSchema.optional(),
                            every: fieldSchema.optional(),
                            none: fieldSchema.optional(),
                        });
                    } else {
                        // to-one relation

                        // optional to-one relation allows null
                        fieldSchema = this.nullableIf(fieldSchema, !fieldDef.array && !!fieldDef.optional);

                        fieldSchema = z.union([
                            fieldSchema,
                            z.strictObject({
                                is: fieldSchema.optional(),
                                isNot: fieldSchema.optional(),
                            }),
                        ]);
                    }
                }
            } else {
                const ignoreSlicing = !!uniqueFieldNames?.includes(field);
                const allowedFilterKinds = ignoreSlicing ? undefined : this.getEffectiveFilterKinds(model, field);

                const enumDef = getEnum(this.schema, fieldDef.type);
                if (enumDef) {
                    // enum
                    if (Object.keys(enumDef.values).length > 0) {
                        fieldSchema = this.makeEnumFilterSchema(
                            fieldDef.type,
                            !!fieldDef.optional,
                            !!fieldDef.array,
                            withAggregations,
                            allowedFilterKinds,
                        );
                    }
                } else if (fieldDef.array) {
                    // array field
                    fieldSchema = this.makeArrayFilterSchema(fieldDef.type, allowedFilterKinds);
                } else if (this.isTypeDefType(fieldDef.type)) {
                    fieldSchema = this.makeTypedJsonFilterSchema(
                        fieldDef.type,
                        !!fieldDef.optional,
                        !!fieldDef.array,
                        allowedFilterKinds,
                    );
                } else {
                    // primitive field
                    fieldSchema = this.makePrimitiveFilterSchema(
                        fieldDef.type as BuiltinType,
                        !!fieldDef.optional,
                        withAggregations,
                        allowedFilterKinds,
                    );
                }
            }

            if (fieldSchema) {
                fields[field] = fieldSchema.optional();
            }
        }

        if (unique) {
            // add compound unique fields, e.g. `{ id1_id2: { id1: 1, id2: 1 } }`
            // compound-field filters are not affected by slicing
            const uniqueFields = getUniqueFields(this.schema, model);
            for (const uniqueField of uniqueFields) {
                if ('defs' in uniqueField) {
                    fields[uniqueField.name] = z
                        .object(
                            Object.fromEntries(
                                Object.entries(uniqueField.defs).map(([key, def]) => {
                                    invariant(!def.relation, 'unique field cannot be a relation');
                                    let fieldSchema: ZodType;
                                    const enumDef = getEnum(this.schema, def.type);
                                    if (enumDef) {
                                        // enum (ignoreSlicing=true → undefined allowedFilterKinds)
                                        if (Object.keys(enumDef.values).length > 0) {
                                            fieldSchema = this.makeEnumFilterSchema(
                                                def.type,
                                                !!def.optional,
                                                !!def.array,
                                                false,
                                                undefined,
                                            );
                                        } else {
                                            fieldSchema = z.never();
                                        }
                                    } else {
                                        fieldSchema = this.makePrimitiveFilterSchema(
                                            def.type as BuiltinType,
                                            !!def.optional,
                                            false,
                                            undefined,
                                        );
                                    }
                                    return [key, fieldSchema];
                                }),
                            ),
                        )
                        .optional();
                }
            }
        }

        // expression builder
        fields['$expr'] = z.custom((v) => typeof v === 'function', { error: '"$expr" must be a function' }).optional();

        // logical operators
        fields['AND'] = this.orArray(
            z.lazy(() => this.makeWhereSchema(model, false, withoutRelationFields, false, options)),
            true,
        ).optional();
        fields['OR'] = z
            .lazy(() => this.makeWhereSchema(model, false, withoutRelationFields, false, options))
            .array()
            .optional();
        fields['NOT'] = this.orArray(
            z.lazy(() => this.makeWhereSchema(model, false, withoutRelationFields, false, options)),
            true,
        ).optional();

        const baseWhere = z.strictObject(fields);
        let result: ZodType = baseWhere;

        if (unique) {
            // requires at least one unique field (field set) is required
            const uniqueFields = getUniqueFields(this.schema, model);
            if (uniqueFields.length === 0) {
                throw createInternalError(`Model "${model}" has no unique fields`);
            }

            if (uniqueFields.length === 1) {
                // only one unique field (set), mark the field(s) required
                result = baseWhere.required({
                    [uniqueFields[0]!.name]: true,
                } as any);
            } else {
                result = baseWhere.refine((value) => {
                    // check that at least one unique field is set
                    return uniqueFields.some(({ name }) => value[name] !== undefined);
                }, `At least one unique field or field set must be set`);
            }
        }

        let schemaId = unique ? `${model}WhereUniqueInput` : `${model}WhereInput`;
        if (withoutRelationFields) schemaId += 'WithoutRelation';
        if (withAggregations) schemaId += 'WithAggregation';
        this.registerSchema(schemaId, result);
        return result;
    }

    @cache()
    private makeTypedJsonFilterSchema(
        type: string,
        optional: boolean,
        array: boolean,
        allowedFilterKinds: string[] | undefined,
    ) {
        const typeDef = getTypeDef(this.schema, type);
        invariant(typeDef, `Type definition "${type}" not found in schema`);

        const candidates: ZodType[] = [];

        if (!array) {
            // fields filter — typedef sub-fields are not model fields, no slicing applies
            const fieldSchemas: Record<string, ZodType> = {};
            for (const [fieldName, fieldDef] of Object.entries(typeDef.fields)) {
                if (this.isTypeDefType(fieldDef.type)) {
                    fieldSchemas[fieldName] = this.makeTypedJsonFilterSchema(
                        fieldDef.type,
                        !!fieldDef.optional,
                        !!fieldDef.array,
                        undefined,
                    ).optional();
                } else {
                    const enumDef = getEnum(this.schema, fieldDef.type);
                    if (enumDef) {
                        fieldSchemas[fieldName] = this.makeEnumFilterSchema(
                            fieldDef.type,
                            !!fieldDef.optional,
                            !!fieldDef.array,
                            false,
                            undefined,
                        ).optional();
                    } else if (fieldDef.array) {
                        fieldSchemas[fieldName] = this.makeArrayFilterSchema(fieldDef.type, undefined).optional();
                    } else {
                        fieldSchemas[fieldName] = this.makePrimitiveFilterSchema(
                            fieldDef.type as BuiltinType,
                            !!fieldDef.optional,
                            false,
                            undefined,
                        ).optional();
                    }
                }
            }

            candidates.push(z.strictObject(fieldSchemas));
        }

        const recursiveSchema = z
            .lazy(() => this.makeTypedJsonFilterSchema(type, optional, false, allowedFilterKinds))
            .optional();
        if (array) {
            // array filter
            candidates.push(
                z.strictObject({
                    some: recursiveSchema,
                    every: recursiveSchema,
                    none: recursiveSchema,
                }),
            );
        } else {
            // is / isNot filter
            candidates.push(
                z.strictObject({
                    is: recursiveSchema,
                    isNot: recursiveSchema,
                }),
            );
        }

        // plain json filter
        candidates.push(this.makeJsonFilterSchema(optional, allowedFilterKinds));

        if (optional) {
            // allow null and null sentinel values
            candidates.push(z.null());
            candidates.push(z.instanceof(DbNullClass));
            candidates.push(z.instanceof(JsonNullClass));
            candidates.push(z.instanceof(AnyNullClass));
        }

        // either plain json filter or field filters
        const result = z.union(candidates);
        this.registerSchema(`${type}Filter${this.filterSchemaSuffix({ optional, array, allowedFilterKinds })}`, result);
        return result;
    }

    // For optional typed JSON fields, allow DbNull, JsonNull, and null.
    // z.union doesn't work here because `z.any()` (returned by `makeScalarSchema`)
    // always wins, so we create a wrapper superRefine instead.
    // The caller must pass the already-built fieldSchema so that array/list
    // mutation shapes (set, push, etc.) are preserved.
    private makeNullableTypedJsonMutationSchema(fieldSchema: z.ZodTypeAny) {
        return z
            .any()
            .superRefine((value, ctx) => {
                if (
                    value instanceof DbNullClass ||
                    value instanceof JsonNullClass ||
                    value === null ||
                    value === undefined
                ) {
                    return;
                }
                const parseResult = fieldSchema.safeParse(value);
                if (!parseResult.success) {
                    parseResult.error.issues.forEach((issue) => ctx.addIssue(issue as any));
                }
            })
            .optional();
    }

    private isTypeDefType(type: string) {
        return this.schema.typeDefs && type in this.schema.typeDefs;
    }

    @cache()
    private makeEnumFilterSchema(
        enumName: string,
        optional: boolean,
        array: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ) {
        const enumDef = getEnum(this.schema, enumName);
        invariant(enumDef, `Enum "${enumName}" not found in schema`);
        const baseSchema = z.enum(Object.keys(enumDef.values) as [string, ...string[]]);
        let schema: ZodType;
        if (array) {
            schema = this.internalMakeArrayFilterSchema(baseSchema, allowedFilterKinds);
        } else {
            const components = this.makeCommonPrimitiveFilterComponents(
                baseSchema,
                optional,
                () =>
                    z.lazy(() =>
                        this.makeEnumFilterSchema(enumName, optional, array, withAggregations, allowedFilterKinds),
                    ),
                ['equals', 'in', 'notIn', 'not'],
                withAggregations ? ['_count', '_min', '_max'] : undefined,
                allowedFilterKinds,
            );

            schema = this.createUnionFilterSchema(baseSchema, optional, components, allowedFilterKinds);
        }
        this.registerSchema(
            `${enumName}Filter${this.filterSchemaSuffix({ optional, array, allowedFilterKinds, withAggregations })}`,
            schema,
        );
        return schema;
    }

    @cache()
    @cache()
    private makeArrayFilterSchema(fieldType: string, allowedFilterKinds: string[] | undefined) {
        const schema = this.internalMakeArrayFilterSchema(
            this.makeScalarSchema(fieldType as BuiltinType),
            allowedFilterKinds,
        );
        this.registerSchema(
            `${fieldType}ArrayFilter${this.filterSchemaSuffix({ array: true, allowedFilterKinds })}`,
            schema,
        );
        return schema;
    }

    private internalMakeArrayFilterSchema(elementSchema: ZodType, allowedFilterKinds: string[] | undefined) {
        const operators = {
            equals: elementSchema.array().optional(),
            has: elementSchema.optional(),
            hasEvery: elementSchema.array().optional(),
            hasSome: elementSchema.array().optional(),
            isEmpty: z.boolean().optional(),
        };

        // Filter operators based on allowed filter kinds
        const filteredOperators = this.trimFilterOperators(operators, allowedFilterKinds);

        return z.strictObject(filteredOperators);
    }

    @cache()
    private makePrimitiveFilterSchema(
        type: BuiltinType,
        optional: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ) {
        return match(type)
            .with('String', () => this.makeStringFilterSchema(optional, withAggregations, allowedFilterKinds))
            .with(P.union('Int', 'Float', 'Decimal', 'BigInt'), (type) =>
                this.makeNumberFilterSchema(type, optional, withAggregations, allowedFilterKinds),
            )
            .with('Boolean', () => this.makeBooleanFilterSchema(optional, withAggregations, allowedFilterKinds))
            .with('DateTime', () => this.makeDateTimeFilterSchema(optional, withAggregations, allowedFilterKinds))
            .with('Bytes', () => this.makeBytesFilterSchema(optional, withAggregations, allowedFilterKinds))
            .with('Json', () => this.makeJsonFilterSchema(optional, allowedFilterKinds))
            .with('Unsupported', () => z.never())
            .exhaustive();
    }

    @cache()
    private makeJsonValueSchema(): ZodType {
        const schema = z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.instanceof(JsonNullClass),
            z.lazy(() => z.union([this.makeJsonValueSchema(), z.null()]).array()),
            z.record(
                z.string(),
                z.lazy(() => z.union([this.makeJsonValueSchema(), z.null()])),
            ),
        ]);
        this.registerSchema('JsonValue', schema);
        return schema;
    }

    @cache()
    private makeJsonFilterSchema(optional: boolean, allowedFilterKinds: string[] | undefined) {
        // Check if Json filter kind is allowed
        if (allowedFilterKinds && !allowedFilterKinds.includes('Json')) {
            // Return a never schema if Json filters are not allowed
            return z.never();
        }

        // Extend the base JsonValue with filter-only null sentinels, flattened into one union
        const jsonValue = this.makeJsonValueSchema();
        const filterMembers: ZodType[] = [jsonValue, z.instanceof(DbNullClass), z.instanceof(AnyNullClass)];
        if (optional) filterMembers.push(z.null());
        const filterValueSchema = z.union(filterMembers as [ZodType, ZodType, ...ZodType[]]);
        const schema = z.strictObject({
            path: z.string().optional(),
            equals: filterValueSchema.optional(),
            not: filterValueSchema.optional(),
            string_contains: z.string().optional(),
            string_starts_with: z.string().optional(),
            string_ends_with: z.string().optional(),
            mode: this.makeStringModeSchema().optional(),
            array_contains: filterValueSchema.optional(),
            array_starts_with: filterValueSchema.optional(),
            array_ends_with: filterValueSchema.optional(),
        });
        this.registerSchema(`JsonFilter${this.filterSchemaSuffix({ optional, allowedFilterKinds })}`, schema);
        return schema;
    }

    @cache()
    private makeDateTimeValueSchema(): ZodType {
        const schema = z.union([z.iso.datetime(), z.iso.date(), z.date()]);
        this.registerSchema('DateTime', schema);
        return schema;
    }

    @cache()
    private makeDateTimeFilterSchema(
        optional: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ): ZodType {
        const filterValueSchema = this.makeDateTimeValueSchema();

        const schema = this.makeCommonPrimitiveFilterSchema(
            filterValueSchema,
            optional,
            () => z.lazy(() => this.makeDateTimeFilterSchema(optional, withAggregations, allowedFilterKinds)),
            withAggregations ? ['_count', '_min', '_max'] : undefined,
            allowedFilterKinds,
        );
        this.registerSchema(
            `DateTimeFilter${this.filterSchemaSuffix({ optional, allowedFilterKinds, withAggregations })}`,
            schema,
        );
        return schema;
    }

    @cache()
    private makeBooleanFilterSchema(
        optional: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ): ZodType {
        const components = this.makeCommonPrimitiveFilterComponents(
            z.boolean(),
            optional,
            () => z.lazy(() => this.makeBooleanFilterSchema(optional, withAggregations, allowedFilterKinds)),
            ['equals', 'not'],
            withAggregations ? ['_count', '_min', '_max'] : undefined,
            allowedFilterKinds,
        );

        const schema = this.createUnionFilterSchema(z.boolean(), optional, components, allowedFilterKinds);
        this.registerSchema(
            `BooleanFilter${this.filterSchemaSuffix({ optional, allowedFilterKinds, withAggregations })}`,
            schema,
        );
        return schema;
    }

    @cache()
    private makeBytesFilterSchema(
        optional: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ): ZodType {
        const baseSchema = z.instanceof(Uint8Array);
        const components = this.makeCommonPrimitiveFilterComponents(
            baseSchema,
            optional,
            () => z.instanceof(Uint8Array),
            ['equals', 'in', 'notIn', 'not'],
            withAggregations ? ['_count', '_min', '_max'] : undefined,
            allowedFilterKinds,
        );

        const schema = this.createUnionFilterSchema(baseSchema, optional, components, allowedFilterKinds);
        this.registerSchema(
            `BytesFilter${this.filterSchemaSuffix({ optional, allowedFilterKinds, withAggregations })}`,
            schema,
        );
        return schema;
    }

    private makeCommonPrimitiveFilterComponents(
        baseSchema: ZodType,
        optional: boolean,
        makeThis: () => ZodType,
        supportedOperators: string[] | undefined = undefined,
        withAggregations: Array<'_count' | '_avg' | '_sum' | '_min' | '_max'> | undefined = undefined,
        allowedFilterKinds: string[] | undefined = undefined,
    ) {
        const commonAggSchema = () =>
            this.makeCommonPrimitiveFilterSchema(baseSchema, false, makeThis, undefined, allowedFilterKinds).optional();
        let result = {
            equals: this.nullableIf(baseSchema.optional(), optional),
            in: baseSchema.array().optional(),
            notIn: baseSchema.array().optional(),
            lt: baseSchema.optional(),
            lte: baseSchema.optional(),
            gt: baseSchema.optional(),
            gte: baseSchema.optional(),
            between: baseSchema.array().length(2).optional(),
            not: makeThis().optional(),
            ...(withAggregations?.includes('_count')
                ? { _count: this.makeNumberFilterSchema('Int', false, false, undefined).optional() }
                : {}),
            ...(withAggregations?.includes('_avg') ? { _avg: commonAggSchema() } : {}),
            ...(withAggregations?.includes('_sum') ? { _sum: commonAggSchema() } : {}),
            ...(withAggregations?.includes('_min') ? { _min: commonAggSchema() } : {}),
            ...(withAggregations?.includes('_max') ? { _max: commonAggSchema() } : {}),
        };
        if (supportedOperators) {
            const keys = [...supportedOperators, ...(withAggregations ?? [])];
            result = extractFields(result, keys) as typeof result;
        }

        // Filter operators based on allowed filter kinds
        result = this.trimFilterOperators(result, allowedFilterKinds) as typeof result;

        return result;
    }

    private makeCommonPrimitiveFilterSchema(
        baseSchema: ZodType,
        optional: boolean,
        makeThis: () => ZodType,
        withAggregations: Array<AggregateOperators> | undefined = undefined,
        allowedFilterKinds: string[] | undefined = undefined,
    ): ZodType {
        const components = this.makeCommonPrimitiveFilterComponents(
            baseSchema,
            optional,
            makeThis,
            undefined,
            withAggregations,
            allowedFilterKinds,
        );

        return this.createUnionFilterSchema(baseSchema, optional, components, allowedFilterKinds);
    }

    @cache()
    private makeNumberFilterSchema(
        type: 'Int' | 'Float' | 'Decimal' | 'BigInt',
        optional: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ): ZodType {
        const schema = this.makeCommonPrimitiveFilterSchema(
            this.makeScalarSchema(type),
            optional,
            () => z.lazy(() => this.makeNumberFilterSchema(type, optional, withAggregations, allowedFilterKinds)),
            withAggregations ? ['_count', '_avg', '_sum', '_min', '_max'] : undefined,
            allowedFilterKinds,
        );
        this.registerSchema(
            `${type}Filter${this.filterSchemaSuffix({ optional, allowedFilterKinds, withAggregations })}`,
            schema,
        );
        return schema;
    }

    @cache()
    private makeStringFilterSchema(
        optional: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ): ZodType {
        const baseComponents = this.makeCommonPrimitiveFilterComponents(
            z.string(),
            optional,
            () => z.lazy(() => this.makeStringFilterSchema(optional, withAggregations, allowedFilterKinds)),
            undefined,
            withAggregations ? ['_count', '_min', '_max'] : undefined,
            allowedFilterKinds,
        );

        const stringSpecificOperators = {
            startsWith: z.string().optional(),
            endsWith: z.string().optional(),
            contains: z.string().optional(),
            ...(this.providerSupportsFuzzySearch
                ? {
                      fuzzy: this.makeFuzzyFilterSchema().optional(),
                  }
                : {}),
            ...(this.providerSupportsCaseSensitivity
                ? {
                      mode: this.makeStringModeSchema().optional(),
                  }
                : {}),
        };

        // Filter string-specific operators based on allowed filter kinds
        const filteredStringOperators = this.trimFilterOperators(stringSpecificOperators, allowedFilterKinds);

        const allComponents = {
            ...baseComponents,
            ...filteredStringOperators,
        };

        const schema = this.createUnionFilterSchema(z.string(), optional, allComponents, allowedFilterKinds);
        this.registerSchema(
            `StringFilter${this.filterSchemaSuffix({ optional, allowedFilterKinds, withAggregations })}`,
            schema,
        );
        return schema;
    }

    private makeStringModeSchema() {
        return z.union([z.literal('default'), z.literal('insensitive')]);
    }

    private makeFuzzyFilterSchema() {
        return z.strictObject({
            search: z.string().min(1),
            mode: z.union([z.literal('simple'), z.literal('word'), z.literal('strictWord')]).default('simple'),
            threshold: z.number().min(0).max(1).optional(),
            unaccent: z.boolean().default(false),
        });
    }

    @cache()
    private makeSelectSchema(model: string, options?: CreateSchemaOptions) {
        const fields: Record<string, ZodType> = {};
        for (const [field, fieldDef] of this.getModelFields(model)) {
            if (fieldDef.relation) {
                if (!this.shouldIncludeRelations(options)) {
                    continue;
                }
                // Check if the target model is allowed by slicing configuration
                if (this.isModelAllowed(fieldDef.type)) {
                    fields[field] = this.makeRelationSelectIncludeSchema(model, field, options).optional();
                }
            } else {
                fields[field] = z.boolean().optional();
            }
        }

        if (this.shouldIncludeRelations(options)) {
            const _countSchema = this.makeCountSelectionSchema(model, options);
            if (!(_countSchema instanceof z.ZodNever)) {
                fields['_count'] = _countSchema;
            }
        }

        this.addExtResultFields(model, fields);

        const result = z.strictObject(fields);
        this.registerSchema(`${model}Select`, result);
        return result;
    }

    @cache()
    private makeCountSelectionSchema(model: string, options?: CreateSchemaOptions) {
        const modelDef = requireModel(this.schema, model);
        const toManyRelations = Object.values(modelDef.fields).filter((def) => def.relation && def.array);
        if (toManyRelations.length > 0) {
            const nextOpts = this.nextOptions(options);
            const schema = z
                .union([
                    z.literal(true),
                    z.strictObject({
                        select: z.strictObject(
                            toManyRelations.reduce(
                                (acc, fieldDef) => ({
                                    ...acc,
                                    [fieldDef.name]: z
                                        .union([
                                            z.boolean(),
                                            z.strictObject({
                                                where: this.makeWhereSchema(
                                                    fieldDef.type,
                                                    false,
                                                    false,
                                                    false,
                                                    nextOpts,
                                                ),
                                            }),
                                        ])
                                        .optional(),
                                }),
                                {} as Record<string, ZodType>,
                            ),
                        ),
                    }),
                ])
                .optional();
            this.registerSchema(`${model}CountSelection`, schema);
            return schema;
        } else {
            return z.never();
        }
    }

    @cache()
    private makeRelationSelectIncludeSchema(model: string, field: string, options?: CreateSchemaOptions) {
        const fieldDef = requireField(this.schema, model, field);
        const nextOpts = this.nextOptions(options);
        let objSchema: ZodType = z.strictObject({
            ...(fieldDef.array || fieldDef.optional
                ? {
                      // to-many relations and optional to-one relations are filterable
                      where: z
                          .lazy(() => this.makeWhereSchema(fieldDef.type, false, false, false, nextOpts))
                          .optional(),
                  }
                : {}),
            select: z
                .lazy(() => this.makeSelectSchema(fieldDef.type, nextOpts))
                .optional()
                .nullable(),
            include: z
                .lazy(() => this.makeIncludeSchema(fieldDef.type, nextOpts))
                .optional()
                .nullable(),
            omit: z
                .lazy(() => this.makeOmitSchema(fieldDef.type))
                .optional()
                .nullable(),
            ...(fieldDef.array
                ? {
                      // to-many relations can be ordered, skipped, taken, and cursor-located
                      orderBy: z
                          .lazy(() => this.orArray(this.makeOrderBySchema(fieldDef.type, true, false, nextOpts), true))
                          .optional(),
                      skip: this.makeSkipSchema().optional(),
                      take: this.makeTakeSchema().optional(),
                      cursor: this.makeCursorSchema(fieldDef.type, nextOpts).optional(),
                      distinct: this.makeDistinctSchema(fieldDef.type).optional(),
                  }
                : {}),
        });

        objSchema = this.refineForSelectIncludeMutuallyExclusive(objSchema);
        objSchema = this.refineForSelectOmitMutuallyExclusive(objSchema);
        objSchema = this.refineForSelectHasTruthyField(objSchema);

        const result = z.union([z.boolean(), objSchema]);
        this.registerSchema(`${model}${upperCaseFirst(field)}RelationInput`, result);
        return result;
    }

    @cache()
    private makeOmitSchema(model: string) {
        const fields: Record<string, ZodType> = {};
        for (const [field, fieldDef] of this.getModelFields(model)) {
            if (!fieldDef.relation) {
                if (this.options.allowQueryTimeOmitOverride !== false) {
                    // if override is allowed, use boolean
                    fields[field] = z.boolean().optional();
                } else {
                    // otherwise only allow true
                    fields[field] = z.literal(true).optional();
                }
            }
        }

        this.addExtResultFields(model, fields);

        const result = z.strictObject(fields);
        this.registerSchema(`${model}OmitInput`, result);
        return result;
    }

    private addExtResultFields(model: string, fields: Record<string, ZodType>) {
        for (const plugin of this.plugins) {
            const resultConfig = plugin.result;
            if (resultConfig) {
                const modelConfig = resultConfig[lowerCaseFirst(model)];
                if (modelConfig) {
                    for (const field of Object.keys(modelConfig)) {
                        fields[field] = z.boolean().optional();
                    }
                }
            }
        }
    }

    @cache()
    private makeIncludeSchema(model: string, options?: CreateSchemaOptions) {
        const modelDef = requireModel(this.schema, model);
        const fields: Record<string, ZodType> = {};
        for (const field of Object.keys(modelDef.fields)) {
            const fieldDef = requireField(this.schema, model, field);
            if (fieldDef.relation) {
                if (!this.shouldIncludeRelations(options)) {
                    continue;
                }
                // Check if the target model is allowed by slicing configuration
                if (this.isModelAllowed(fieldDef.type)) {
                    fields[field] = this.makeRelationSelectIncludeSchema(model, field, options).optional();
                }
            }
        }

        if (this.shouldIncludeRelations(options)) {
            const _countSchema = this.makeCountSelectionSchema(model, options);
            if (!(_countSchema instanceof z.ZodNever)) {
                fields['_count'] = _countSchema;
            }
        }

        const result = z.strictObject(fields);
        this.registerSchema(`${model}Include`, result);
        return result;
    }

    @cache()
    private makeOrderBySchema(
        model: string,
        withRelation: boolean,
        WithAggregation: boolean,
        options?: CreateSchemaOptions,
    ) {
        const fields: Record<string, ZodType> = {};
        const sort = z.union([z.literal('asc'), z.literal('desc')]);
        const refineAtMostOneKey = (s: ZodObject) =>
            s.refine((v: object) => Object.keys(v).length <= 1, {
                message: 'Each orderBy element must have at most one key',
            });
        const nextOpts = this.nextOptions(options);
        for (const [field, fieldDef] of this.getModelFields(model)) {
            if (fieldDef.relation) {
                // relations
                if (withRelation && this.shouldIncludeRelations(options)) {
                    fields[field] = z
                        .lazy(() => {
                            let relationOrderBy = this.makeOrderBySchema(
                                fieldDef.type,
                                withRelation,
                                WithAggregation,
                                nextOpts,
                            );
                            if (fieldDef.array) {
                                // safeExtend drops existing refinements, so re-apply after extending
                                relationOrderBy = refineAtMostOneKey(relationOrderBy.safeExtend({ _count: sort }));
                            }
                            return relationOrderBy;
                        })
                        .optional();
                }
            } else {
                // scalars
                if (fieldDef.optional) {
                    fields[field] = z
                        .union([
                            sort,
                            z.strictObject({
                                sort,
                                nulls: z.union([z.literal('first'), z.literal('last')]),
                            }),
                        ])
                        .optional();
                } else {
                    fields[field] = sort.optional();
                }
            }
        }

        // aggregations
        if (WithAggregation) {
            const aggregationFields = ['_count', '_avg', '_sum', '_min', '_max'];
            for (const agg of aggregationFields) {
                fields[agg] = z.lazy(() => this.makeOrderBySchema(model, true, false, options).optional());
            }
        }

        // _fuzzyRelevance ordering for fuzzy search (string fields only, postgres only).
        // Distinct from a future `_searchRelevance` for full-text search.
        if (this.providerSupportsFuzzySearch) {
            const stringFieldNames = this.getModelFields(model)
                .filter(([, def]) => !def.relation && def.type === 'String')
                .map(([name]) => name);
            if (stringFieldNames.length > 0) {
                fields['_fuzzyRelevance'] = z
                    .strictObject({
                        fields: z.array(z.enum(stringFieldNames as [string, ...string[]])).min(1),
                        search: z.string(),
                        mode: z
                            .union([z.literal('simple'), z.literal('word'), z.literal('strictWord')])
                            .default('simple'),
                        unaccent: z.boolean().default(false),
                        sort,
                    })
                    .optional();
            }
        }

        const schema = refineAtMostOneKey(z.strictObject(fields));

        let schemaId = `${model}OrderBy`;
        if (withRelation) schemaId += 'WithRelation';
        if (WithAggregation) schemaId += 'WithAggregation';
        schemaId += 'Input';
        this.registerSchema(schemaId, schema);
        return schema;
    }

    @cache()
    private makeDistinctSchema(model: string) {
        const nonRelationFields = this.getModelFields(model)
            .filter(([, def]) => !def.relation)
            .map(([name]) => name);
        const schema = nonRelationFields.length > 0 ? this.orArray(z.enum(nonRelationFields as any), true) : z.never();
        this.registerSchema(`${model}DistinctInput`, schema);
        return schema;
    }

    @cache()
    private makeCursorSchema(model: string, options?: CreateSchemaOptions) {
        const schema = this.makeWhereSchema(model, true, true, false, options).optional();
        this.registerSchema(`${model}CursorInput`, schema);
        return schema;
    }

    // #endregion

    // #region Create

    @cache()
    makeCreateSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<CreateArgs<Schema, Model, Options, ExtQueryArgs>> {
        const dataSchema = this.makeCreateDataSchema(model, false, [], false, options);
        const baseSchema = z.strictObject({
            data: dataSchema,
            select: this.makeSelectSchema(model, options).optional().nullable(),
            include: this.makeIncludeSchema(model, options).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'create');
        schema = this.refineForSelectIncludeMutuallyExclusive(schema);
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        schema = this.refineForSelectHasTruthyField(schema);
        this.registerSchema(`${model}CreateArgs`, schema);
        return schema as ZodType<CreateArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeCreateManySchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<CreateManyArgs<Schema, Model, Options, ExtQueryArgs>> {
        const result = this.mergePluginArgsSchema(
            this.makeCreateManyPayloadSchema(model, [], options),
            'createMany',
        ) as unknown as ZodType<CreateManyArgs<Schema, Model, Options, ExtQueryArgs>>;
        this.registerSchema(`${model}CreateManyArgs`, result);
        return result;
    }

    @cache()
    makeCreateManyAndReturnSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<CreateManyAndReturnArgs<Schema, Model, Options, ExtQueryArgs>> {
        const base = this.makeCreateManyPayloadSchema(model, [], options);
        let result: ZodObject = base.extend({
            select: this.makeSelectSchema(model, options).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        result = this.mergePluginArgsSchema(result, 'createManyAndReturn');
        const schema = this.refineForSelectHasTruthyField(
            this.refineForSelectOmitMutuallyExclusive(result),
        ).optional() as ZodType<CreateManyAndReturnArgs<Schema, Model, Options, ExtQueryArgs>>;
        this.registerSchema(`${model}CreateManyAndReturnArgs`, schema);
        return schema;
    }

    @cache()
    private makeCreateDataSchema(
        model: string,
        canBeArray: boolean,
        withoutFields: string[] = [],
        withoutRelationFields = false,
        options?: CreateSchemaOptions,
    ) {
        const skipRelations = withoutRelationFields || !this.shouldIncludeRelations(options);
        const uncheckedVariantFields: Record<string, ZodType> = {};
        const checkedVariantFields: Record<string, ZodType> = {};
        const modelDef = requireModel(this.schema, model);
        const modelFields = this.getModelFields(model);
        const hasRelation =
            !skipRelations && modelFields.some(([f, def]) => !withoutFields.includes(f) && def.relation);

        const nextOpts = this.nextOptions(options);

        modelFields.forEach(([field, fieldDef]) => {
            if (withoutFields.includes(field)) {
                return;
            }

            // skip computed fields and discriminator fields
            if (fieldDef.computed || fieldDef.isDiscriminator) {
                return;
            }

            if (fieldDef.relation) {
                if (skipRelations) {
                    return;
                }
                // Check if the target model is allowed by slicing configuration
                if (!this.isModelAllowed(fieldDef.type)) {
                    return;
                }
                const excludeFields: string[] = [];
                const oppositeField = fieldDef.relation.opposite;
                if (oppositeField) {
                    excludeFields.push(oppositeField);
                    const oppositeFieldDef = requireField(this.schema, fieldDef.type, oppositeField);
                    if (oppositeFieldDef.relation?.fields) {
                        excludeFields.push(...oppositeFieldDef.relation.fields);
                    }
                }

                let fieldSchema: ZodType = z.lazy(() =>
                    this.makeRelationManipulationSchema(model, field, excludeFields, 'create', nextOpts),
                );

                if (fieldDef.optional || fieldDef.array) {
                    // optional or array relations are optional
                    fieldSchema = fieldSchema.optional();
                } else {
                    // if all fk fields are optional, the relation is optional
                    let allFksOptional = false;
                    if (fieldDef.relation.fields) {
                        allFksOptional = fieldDef.relation.fields.every((f) => {
                            const fkDef = requireField(this.schema, model, f);
                            return fkDef.optional || fieldHasDefaultValue(fkDef);
                        });
                    }
                    if (allFksOptional) {
                        fieldSchema = fieldSchema.optional();
                    }
                }

                // optional to-one relation can be null
                if (fieldDef.optional && !fieldDef.array) {
                    fieldSchema = fieldSchema.nullable();
                }
                checkedVariantFields[field] = fieldSchema;
                if (fieldDef.array || !fieldDef.relation.references) {
                    // non-owned relation
                    uncheckedVariantFields[field] = fieldSchema;
                }
            } else {
                let fieldSchema = this.makeScalarSchema(fieldDef.type, fieldDef.attributes);

                if (fieldDef.array) {
                    fieldSchema = ZodUtils.addListValidation(fieldSchema.array(), fieldDef.attributes);
                    fieldSchema = z
                        .union([
                            fieldSchema,
                            z.strictObject({
                                set: fieldSchema,
                            }),
                        ])
                        .optional();
                }

                if (fieldDef.optional || fieldHasDefaultValue(fieldDef)) {
                    fieldSchema = fieldSchema.optional();
                }

                if (fieldDef.optional) {
                    if (fieldDef.type === 'Json') {
                        // DbNull for Json fields
                        fieldSchema = z.union([fieldSchema, z.instanceof(DbNullClass)]);
                    } else if (this.isTypeDefType(fieldDef.type)) {
                        fieldSchema = this.makeNullableTypedJsonMutationSchema(fieldSchema);
                    } else {
                        fieldSchema = fieldSchema.nullable();
                    }
                }

                uncheckedVariantFields[field] = fieldSchema;
                if (!fieldDef.foreignKeyFor) {
                    // non-fk field
                    checkedVariantFields[field] = fieldSchema;
                }
            }
        });

        const uncheckedCreateSchema = this.extraValidationsEnabled
            ? ZodUtils.addCustomValidation(z.strictObject(uncheckedVariantFields), modelDef.attributes)
            : z.strictObject(uncheckedVariantFields);
        const checkedCreateSchema = this.extraValidationsEnabled
            ? ZodUtils.addCustomValidation(z.strictObject(checkedVariantFields), modelDef.attributes)
            : z.strictObject(checkedVariantFields);

        const result = !hasRelation
            ? this.orArray(uncheckedCreateSchema, canBeArray)
            : z.union([
                  uncheckedCreateSchema,
                  checkedCreateSchema,
                  ...(canBeArray ? [z.array(uncheckedCreateSchema)] : []),
                  ...(canBeArray ? [z.array(checkedCreateSchema)] : []),
              ]);

        const idParts = [`${model}CreateData`];
        if (canBeArray) idParts.push('Array');
        if (withoutRelationFields) idParts.push('WithoutRelation');
        if (withoutFields.length) idParts.push(`Without${withoutFields.slice().sort().join('')}`);
        this.registerSchema(idParts.join(''), result);
        return result;
    }

    @cache()
    private makeRelationManipulationSchema(
        model: string,
        field: string,
        withoutFields: string[],
        mode: 'create' | 'update',
        options?: CreateSchemaOptions,
    ) {
        const fieldDef = requireField(this.schema, model, field);
        const fieldType = fieldDef.type;
        const array = !!fieldDef.array;
        const canCreateModel = this.canCreateModel(fieldType);
        const fields: Record<string, ZodType> = {
            connect: this.makeConnectDataSchema(fieldType, array, options).optional(),
        };

        if (canCreateModel) {
            fields['create'] = this.makeCreateDataSchema(
                fieldDef.type,
                !!fieldDef.array,
                withoutFields,
                false,
                options,
            ).optional();
            fields['connectOrCreate'] = this.makeConnectOrCreateDataSchema(
                fieldType,
                array,
                withoutFields,
                options,
            ).optional();
        }

        if (array && canCreateModel) {
            fields['createMany'] = this.makeCreateManyPayloadSchema(fieldType, withoutFields, options).optional();
        }

        if (mode === 'update') {
            if (fieldDef.optional || fieldDef.array) {
                // disconnect and delete are only available for optional/to-many relations
                fields['disconnect'] = this.makeDisconnectDataSchema(fieldType, array, options).optional();

                fields['delete'] = this.makeDeleteRelationDataSchema(fieldType, array, true, options).optional();
            }

            fields['update'] = array
                ? this.orArray(
                      z.strictObject({
                          where: this.makeWhereSchema(fieldType, true, false, false, options),
                          data: this.makeUpdateDataSchema(fieldType, withoutFields, false, options),
                      }),
                      true,
                  ).optional()
                : z
                      .union([
                          z.strictObject({
                              where: this.makeWhereSchema(fieldType, false, false, false, options).optional(),
                              data: this.makeUpdateDataSchema(fieldType, withoutFields, false, options),
                          }),
                          this.makeUpdateDataSchema(fieldType, withoutFields, false, options),
                      ])
                      .optional();

            if (canCreateModel) {
                let upsertWhere = this.makeWhereSchema(fieldType, true, false, false, options);
                if (!fieldDef.array) {
                    // to-one relation, can upsert without where clause
                    upsertWhere = upsertWhere.optional();
                }
                fields['upsert'] = this.orArray(
                    z.strictObject({
                        where: upsertWhere,
                        create: this.makeCreateDataSchema(fieldType, false, withoutFields, false, options),
                        update: this.makeUpdateDataSchema(fieldType, withoutFields, false, options),
                    }),
                    true,
                ).optional();
            }

            if (array) {
                // to-many relation specifics
                fields['set'] = this.makeSetDataSchema(fieldType, true, options).optional();

                fields['updateMany'] = this.orArray(
                    z.strictObject({
                        where: this.makeWhereSchema(fieldType, false, true, false, options),
                        data: this.makeUpdateDataSchema(fieldType, withoutFields, false, options),
                    }),
                    true,
                ).optional();

                fields['deleteMany'] = this.makeDeleteRelationDataSchema(fieldType, true, false, options).optional();
            }
        }

        return z.strictObject(fields);
    }

    @cache()
    private makeSetDataSchema(model: string, canBeArray: boolean, options?: CreateSchemaOptions) {
        return this.orArray(this.makeWhereSchema(model, true, false, false, options), canBeArray);
    }

    @cache()
    private makeConnectDataSchema(model: string, canBeArray: boolean, options?: CreateSchemaOptions) {
        return this.orArray(this.makeWhereSchema(model, true, false, false, options), canBeArray);
    }

    @cache()
    private makeDisconnectDataSchema(model: string, canBeArray: boolean, options?: CreateSchemaOptions) {
        if (canBeArray) {
            // to-many relation, must be unique filters
            return this.orArray(this.makeWhereSchema(model, true, false, false, options), canBeArray);
        } else {
            // to-one relation, can be boolean or a regular filter - the entity
            // being disconnected is already uniquely identified by its parent
            return z.union([z.boolean(), this.makeWhereSchema(model, false, false, false, options)]);
        }
    }

    @cache()
    private makeDeleteRelationDataSchema(
        model: string,
        toManyRelation: boolean,
        uniqueFilter: boolean,
        options?: CreateSchemaOptions,
    ) {
        return toManyRelation
            ? this.orArray(this.makeWhereSchema(model, uniqueFilter, false, false, options), true)
            : z.union([z.boolean(), this.makeWhereSchema(model, uniqueFilter, false, false, options)]);
    }

    @cache()
    private makeConnectOrCreateDataSchema(
        model: string,
        canBeArray: boolean,
        withoutFields: string[],
        options?: CreateSchemaOptions,
    ) {
        const whereSchema = this.makeWhereSchema(model, true, false, false, options);
        const createSchema = this.makeCreateDataSchema(model, false, withoutFields, false, options);
        return this.orArray(
            z.strictObject({
                where: whereSchema,
                create: createSchema,
            }),
            canBeArray,
        );
    }

    @cache()
    private makeCreateManyPayloadSchema(model: string, withoutFields: string[], options?: CreateSchemaOptions) {
        const schema = z.strictObject({
            data: this.makeCreateDataSchema(model, true, withoutFields, true, options),
            skipDuplicates: z.boolean().optional(),
        });
        const idParts = [`${model}CreateManyPayload`];
        if (withoutFields.length) idParts.push(`Without${withoutFields.slice().sort().join('')}`);
        this.registerSchema(idParts.join(''), schema);
        return schema;
    }

    // #endregion

    // #region Update

    @cache()
    makeUpdateSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<UpdateArgs<Schema, Model, Options, ExtQueryArgs>> {
        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, true, false, false, options),
            data: this.makeUpdateDataSchema(model, [], false, options),
            select: this.makeSelectSchema(model, options).optional().nullable(),
            include: this.makeIncludeSchema(model, options).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'update');
        schema = this.refineForSelectIncludeMutuallyExclusive(schema);
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        schema = this.refineForSelectHasTruthyField(schema);
        this.registerSchema(`${model}UpdateArgs`, schema);
        return schema as ZodType<UpdateArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeUpdateManySchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<UpdateManyArgs<Schema, Model, Options, ExtQueryArgs>> {
        const result = this.mergePluginArgsSchema(
            z.strictObject({
                where: this.makeWhereSchema(model, false, false, false, options).optional(),
                data: this.makeUpdateDataSchema(model, [], true, options),
                limit: z.number().int().nonnegative().optional(),
            }),
            'updateMany',
        ) as unknown as ZodType<UpdateManyArgs<Schema, Model, Options, ExtQueryArgs>>;
        this.registerSchema(`${model}UpdateManyArgs`, result);
        return result;
    }

    @cache()
    makeUpdateManyAndReturnSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<UpdateManyAndReturnArgs<Schema, Model, Options, ExtQueryArgs>> {
        // plugin extended args schema is merged in `makeUpdateManySchema`
        const baseSchema = this.makeUpdateManySchema(model, options) as unknown as ZodObject;
        let schema: ZodType = baseSchema.extend({
            select: this.makeSelectSchema(model, options).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        schema = this.refineForSelectHasTruthyField(schema);
        this.registerSchema(`${model}UpdateManyAndReturnArgs`, schema);
        return schema as ZodType<UpdateManyAndReturnArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeUpsertSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<UpsertArgs<Schema, Model, Options, ExtQueryArgs>> {
        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, true, false, false, options),
            create: this.makeCreateDataSchema(model, false, [], false, options),
            update: this.makeUpdateDataSchema(model, [], false, options),
            select: this.makeSelectSchema(model, options).optional().nullable(),
            include: this.makeIncludeSchema(model, options).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'upsert');
        schema = this.refineForSelectIncludeMutuallyExclusive(schema);
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        schema = this.refineForSelectHasTruthyField(schema);
        this.registerSchema(`${model}UpsertArgs`, schema);
        return schema as ZodType<UpsertArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    private makeUpdateDataSchema(
        model: string,
        withoutFields: string[] = [],
        withoutRelationFields = false,
        options?: CreateSchemaOptions,
    ) {
        const skipRelations = withoutRelationFields || !this.shouldIncludeRelations(options);
        const uncheckedVariantFields: Record<string, ZodType> = {};
        const checkedVariantFields: Record<string, ZodType> = {};
        const modelDef = requireModel(this.schema, model);
        const modelFields = this.getModelFields(model);
        const hasRelation =
            !skipRelations && modelFields.some(([key, value]) => value.relation && !withoutFields.includes(key));

        const nextOpts = this.nextOptions(options);

        modelFields.forEach(([field, fieldDef]) => {
            if (withoutFields.includes(field)) {
                return;
            }

            // skip computed fields and discriminator fields
            if (fieldDef.computed || fieldDef.isDiscriminator) {
                return;
            }

            if (fieldDef.relation) {
                if (skipRelations) {
                    return;
                }
                // Check if the target model is allowed by slicing configuration
                if (!this.isModelAllowed(fieldDef.type)) {
                    return;
                }
                const excludeFields: string[] = [];
                const oppositeField = fieldDef.relation.opposite;
                if (oppositeField) {
                    excludeFields.push(oppositeField);
                    const oppositeFieldDef = requireField(this.schema, fieldDef.type, oppositeField);
                    if (oppositeFieldDef.relation?.fields) {
                        excludeFields.push(...oppositeFieldDef.relation.fields);
                    }
                }
                let fieldSchema: ZodType = z
                    .lazy(() => this.makeRelationManipulationSchema(model, field, excludeFields, 'update', nextOpts))
                    .optional();
                // optional to-one relation can be null
                if (fieldDef.optional && !fieldDef.array) {
                    fieldSchema = fieldSchema.nullable();
                }
                checkedVariantFields[field] = fieldSchema;
                if (fieldDef.array || !fieldDef.relation.references) {
                    // non-owned relation
                    uncheckedVariantFields[field] = fieldSchema;
                }
            } else {
                let fieldSchema = this.makeScalarSchema(fieldDef.type, fieldDef.attributes);

                if (this.isNumericField(fieldDef)) {
                    fieldSchema = z.union([
                        fieldSchema,
                        z
                            .object({
                                // TODO: use Decimal/BigInt for incremental updates
                                set: this.nullableIf(z.number().optional(), !!fieldDef.optional).optional(),
                                increment: z.number().optional(),
                                decrement: z.number().optional(),
                                multiply: z.number().optional(),
                                divide: z.number().optional(),
                            })
                            .refine(
                                (v) => Object.keys(v).length === 1,
                                'Only one of "set", "increment", "decrement", "multiply", or "divide" can be provided',
                            ),
                    ]);
                }

                if (fieldDef.array) {
                    const arraySchema = ZodUtils.addListValidation(fieldSchema.array(), fieldDef.attributes);
                    fieldSchema = z.union([
                        arraySchema,
                        z
                            .object({
                                set: arraySchema.optional(),
                                push: z.union([fieldSchema, fieldSchema.array()]).optional(),
                            })
                            .refine((v) => Object.keys(v).length === 1, 'Only one of "set", "push" can be provided'),
                    ]);
                }

                if (fieldDef.optional) {
                    if (fieldDef.type === 'Json') {
                        // DbNull for Json fields
                        fieldSchema = z.union([fieldSchema, z.instanceof(DbNullClass)]);
                    } else if (this.isTypeDefType(fieldDef.type)) {
                        fieldSchema = this.makeNullableTypedJsonMutationSchema(fieldSchema);
                    } else {
                        fieldSchema = fieldSchema.nullable();
                    }
                }

                // all fields are optional in update
                fieldSchema = fieldSchema.optional();

                uncheckedVariantFields[field] = fieldSchema;
                if (!fieldDef.foreignKeyFor) {
                    // non-fk field
                    checkedVariantFields[field] = fieldSchema;
                }
            }
        });

        const uncheckedUpdateSchema = this.extraValidationsEnabled
            ? ZodUtils.addCustomValidation(z.strictObject(uncheckedVariantFields), modelDef.attributes)
            : z.strictObject(uncheckedVariantFields);
        const checkedUpdateSchema = this.extraValidationsEnabled
            ? ZodUtils.addCustomValidation(z.strictObject(checkedVariantFields), modelDef.attributes)
            : z.strictObject(checkedVariantFields);
        const result = !hasRelation ? uncheckedUpdateSchema : z.union([uncheckedUpdateSchema, checkedUpdateSchema]);

        const idParts = [`${model}UpdateData`];
        if (withoutRelationFields) idParts.push('WithoutRelation');
        if (withoutFields.length) idParts.push(`Without${withoutFields.slice().sort().join('')}`);
        this.registerSchema(idParts.join(''), result);
        return result;
    }

    // #endregion

    // #region Delete

    @cache()
    makeDeleteSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<DeleteArgs<Schema, Model, Options, ExtQueryArgs>> {
        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, true, false, false, options),
            select: this.makeSelectSchema(model, options).optional().nullable(),
            include: this.makeIncludeSchema(model, options).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'delete');
        schema = this.refineForSelectIncludeMutuallyExclusive(schema);
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        schema = this.refineForSelectHasTruthyField(schema);
        this.registerSchema(`${model}DeleteArgs`, schema);
        return schema as ZodType<DeleteArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeDeleteManySchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<DeleteManyArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        const result = this.mergePluginArgsSchema(
            z.strictObject({
                where: this.makeWhereSchema(model, false, false, false, options).optional(),
                limit: z.number().int().nonnegative().optional(),
            }),
            'deleteMany',
        ).optional() as unknown as ZodType<DeleteManyArgs<Schema, Model, Options, ExtQueryArgs> | undefined>;
        this.registerSchema(`${model}DeleteManyArgs`, result);
        return result;
    }

    // #endregion

    // #region Count

    @cache()
    makeCountSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<CountArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        const result = this.mergePluginArgsSchema(
            z.strictObject({
                where: this.makeWhereSchema(model, false, false, false, options).optional(),
                skip: this.makeSkipSchema().optional(),
                take: this.makeTakeSchema().optional(),
                orderBy: this.orArray(this.makeOrderBySchema(model, true, false, options), true).optional(),
                select: this.makeCountAggregateInputSchema(model).optional(),
            }),
            'count',
        ).optional() as ZodType<CountArgs<Schema, Model, Options, ExtQueryArgs> | undefined>;
        this.registerSchema(`${model}CountArgs`, result);
        return result;
    }

    @cache()
    private makeCountAggregateInputSchema(model: string) {
        const schema = z.union([
            z.literal(true),
            z.strictObject({
                _all: z.literal(true).optional(),
                ...this.getModelFields(model).reduce(
                    (acc, [field]) => {
                        acc[field] = z.literal(true).optional();
                        return acc;
                    },
                    {} as Record<string, ZodType>,
                ),
            }),
        ]);
        this.registerSchema(`${model}CountAggregateInput`, schema);
        return schema;
    }

    // #endregion

    // #region Aggregate

    @cache()
    makeAggregateSchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<AggregateArgs<Schema, Model, Options, ExtQueryArgs>> {
        const result = this.mergePluginArgsSchema(
            z.strictObject({
                where: this.makeWhereSchema(model, false, false, false, options).optional(),
                skip: this.makeSkipSchema().optional(),
                take: this.makeTakeSchema().optional(),
                orderBy: this.orArray(this.makeOrderBySchema(model, true, false, options), true).optional(),
                _count: this.makeCountAggregateInputSchema(model).optional(),
                _avg: this.makeSumAvgInputSchema(model).optional(),
                _sum: this.makeSumAvgInputSchema(model).optional(),
                _min: this.makeMinMaxInputSchema(model).optional(),
                _max: this.makeMinMaxInputSchema(model).optional(),
            }),
            'aggregate',
        ) as unknown as ZodType<AggregateArgs<Schema, Model, Options, ExtQueryArgs>>;
        this.registerSchema(`${model}AggregateArgs`, result);
        return result;
    }

    @cache()
    private makeSumAvgInputSchema(model: string) {
        const schema = z.strictObject(
            this.getModelFields(model).reduce(
                (acc, [field, fieldDef]) => {
                    if (this.isNumericField(fieldDef)) {
                        acc[field] = z.literal(true).optional();
                    }
                    return acc;
                },
                {} as Record<string, ZodType>,
            ),
        );
        this.registerSchema(`${model}SumAvgAggregateInput`, schema);
        return schema;
    }

    @cache()
    private makeMinMaxInputSchema(model: string) {
        const schema = z.strictObject(
            this.getModelFields(model).reduce(
                (acc, [field, fieldDef]) => {
                    if (!fieldDef.relation && !fieldDef.array) {
                        acc[field] = z.literal(true).optional();
                    }
                    return acc;
                },
                {} as Record<string, ZodType>,
            ),
        );
        this.registerSchema(`${model}MinMaxAggregateInput`, schema);
        return schema;
    }

    // #endregion

    // #region Group By

    @cache()
    makeGroupBySchema<Model extends GetModels<Schema>>(
        model: Model,
        options?: CreateSchemaOptions,
    ): ZodType<GroupByArgs<Schema, Model, Options, ExtQueryArgs>> {
        const nonRelationFields = this.getModelFields(model)
            .filter(([, def]) => !def.relation)
            .map(([name]) => name);
        const bySchema =
            nonRelationFields.length > 0
                ? this.orArray(z.enum(nonRelationFields as [string, ...string[]]), true)
                : z.never();

        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, false, false, false, options).optional(),
            orderBy: this.orArray(this.makeOrderBySchema(model, false, true, options), true).optional(),
            by: bySchema,
            having: this.makeHavingSchema(model, options).optional(),
            skip: this.makeSkipSchema().optional(),
            take: this.makeTakeSchema().optional(),
            _count: this.makeCountAggregateInputSchema(model).optional(),
            _avg: this.makeSumAvgInputSchema(model).optional(),
            _sum: this.makeSumAvgInputSchema(model).optional(),
            _min: this.makeMinMaxInputSchema(model).optional(),
            _max: this.makeMinMaxInputSchema(model).optional(),
        });

        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'groupBy');

        // fields used in `having` must be either in the `by` list, or aggregations
        schema = schema.refine((value: any) => {
            const bys = enumerate(value.by);
            if (value.having && typeof value.having === 'object') {
                for (const [key, val] of Object.entries(value.having)) {
                    if (AggregateOperators.includes(key as any)) {
                        continue;
                    }
                    if (bys.includes(key)) {
                        continue;
                    }
                    // we have a key not mentioned in `by`, in this case it must only use
                    // aggregations in the condition

                    // 1. payload must be an object
                    if (!val || typeof val !== 'object') {
                        return false;
                    }
                    // 2. payload must only contain aggregations
                    if (!this.onlyAggregationFields(val)) {
                        return false;
                    }
                }
            }
            return true;
        }, 'fields in "having" must be in "by"');

        // fields used in `orderBy` must be either in the `by` list, or aggregations
        schema = schema.refine((value: any) => {
            const bys = enumerate(value.by);
            for (const orderBy of enumerate(value.orderBy)) {
                if (
                    orderBy &&
                    Object.keys(orderBy)
                        .filter((f) => !AggregateOperators.includes(f as AggregateOperators))
                        .some((key) => !bys.includes(key))
                ) {
                    return false;
                }
            }
            return true;
        }, 'fields in "orderBy" must be in "by"');

        this.registerSchema(`${model}GroupByArgs`, schema);
        return schema as ZodType<GroupByArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    private onlyAggregationFields(val: object) {
        for (const [key, value] of Object.entries(val)) {
            if (AggregateOperators.includes(key as any)) {
                // aggregation field
                continue;
            }
            if (LOGICAL_COMBINATORS.includes(key as any)) {
                // logical operators
                if (enumerate(value).every((v) => this.onlyAggregationFields(v))) {
                    continue;
                }
            }
            return false;
        }
        return true;
    }

    @cache()
    private makeHavingSchema(model: string, options?: CreateSchemaOptions) {
        const schema = this.makeWhereSchema(model, false, true, true, options);
        this.registerSchema(`${model}HavingInput`, schema);
        return schema;
    }

    // #endregion

    // #region Procedures

    @cache()
    makeProcedureArgsSchema(procName: string): ZodType {
        const procDef = (this.schema.procedures ?? {})[procName];
        if (!procDef) {
            throw createInternalError(`Procedure not found: ${procName}`);
        }
        const shape: Record<string, ZodType> = {};
        for (const param of Object.values(procDef.params ?? {})) {
            shape[param.name] = this.makeProcedureParamSchema(param);
        }
        const schema = z.object(shape);
        this.registerSchema(`${procName}ProcArgs`, schema);
        return schema;
    }

    @cache()
    makeProcedureParamSchema(
        param: { type: string; array?: boolean; optional?: boolean },
        _options?: CreateSchemaOptions,
    ): ZodType {
        let schema: ZodType;

        if (isTypeDef(this.schema, param.type)) {
            schema = this.makeTypeDefSchema(param.type);
        } else if (isEnum(this.schema, param.type)) {
            schema = this.makeEnumSchema(param.type);
        } else if (param.type in (this.schema.models ?? {})) {
            // For model-typed values, accept any object (no deep shape validation).
            schema = z.record(z.string(), z.unknown());
        } else {
            // Builtin scalar types.
            schema = this.makeScalarSchema(param.type as BuiltinType);

            // If a type isn't recognized by any of the above branches, `makeScalarSchema` returns `unknown`.
            // Treat it as configuration/schema error.
            if (schema instanceof z.ZodUnknown) {
                throw createInternalError(`Unsupported procedure parameter type: ${param.type}`);
            }
        }

        if (param.array) {
            schema = schema.array();
        }
        if (param.optional) {
            schema = schema.optional();
        }

        return schema;
    }

    // #endregion

    // #region Plugin Args

    private mergePluginArgsSchema(schema: ZodObject, operation: CoreCrudOperations) {
        let result = schema;
        for (const plugin of this.plugins ?? []) {
            if (plugin.queryArgs) {
                const pluginSchema = this.getPluginExtQueryArgsSchema(plugin, operation);
                if (pluginSchema) {
                    result = result.extend(pluginSchema.shape);
                }
            }
        }
        return result.strict();
    }

    private getPluginExtQueryArgsSchema(plugin: AnyPlugin, operation: string): ZodObject | undefined {
        if (!plugin.queryArgs) {
            return undefined;
        }

        let result: ZodType | undefined;

        if (operation in plugin.queryArgs && plugin.queryArgs[operation]) {
            // most specific operation takes highest precedence
            result = plugin.queryArgs[operation];
        } else if (operation === 'upsert') {
            // upsert is special: it's in both CoreCreateOperations and CoreUpdateOperations
            // so we need to merge both $create and $update schemas to match the type system
            const createSchema =
                '$create' in plugin.queryArgs && plugin.queryArgs['$create'] ? plugin.queryArgs['$create'] : undefined;
            const updateSchema =
                '$update' in plugin.queryArgs && plugin.queryArgs['$update'] ? plugin.queryArgs['$update'] : undefined;

            if (createSchema && updateSchema) {
                invariant(createSchema instanceof ZodObject, 'Plugin extended query args schema must be a Zod object');
                invariant(updateSchema instanceof ZodObject, 'Plugin extended query args schema must be a Zod object');
                // merge both schemas (combines their properties)
                result = createSchema.extend(updateSchema.shape);
            } else if (createSchema) {
                result = createSchema;
            } else if (updateSchema) {
                result = updateSchema;
            }
        } else if (
            // then comes grouped operations: $create, $read, $update, $delete
            CoreCreateOperations.includes(operation as CoreCreateOperations) &&
            '$create' in plugin.queryArgs &&
            plugin.queryArgs['$create']
        ) {
            result = plugin.queryArgs['$create'];
        } else if (
            CoreReadOperations.includes(operation as CoreReadOperations) &&
            '$read' in plugin.queryArgs &&
            plugin.queryArgs['$read']
        ) {
            result = plugin.queryArgs['$read'];
        } else if (
            CoreUpdateOperations.includes(operation as CoreUpdateOperations) &&
            '$update' in plugin.queryArgs &&
            plugin.queryArgs['$update']
        ) {
            result = plugin.queryArgs['$update'];
        } else if (
            CoreDeleteOperations.includes(operation as CoreDeleteOperations) &&
            '$delete' in plugin.queryArgs &&
            plugin.queryArgs['$delete']
        ) {
            result = plugin.queryArgs['$delete'];
        } else if ('$all' in plugin.queryArgs && plugin.queryArgs['$all']) {
            // finally comes $all
            result = plugin.queryArgs['$all'];
        }

        invariant(
            result === undefined || result instanceof ZodObject,
            'Plugin extended query args schema must be a Zod object',
        );
        return result;
    }

    // #endregion

    // #region Helpers

    @cache()
    private makeSkipSchema() {
        return z.number().int().nonnegative();
    }

    @cache()
    private makeTakeSchema() {
        return z.number().int();
    }

    private refineForSelectIncludeMutuallyExclusive(schema: ZodType) {
        return schema.refine(
            (value: any) => !(value['select'] && value['include']),
            '"select" and "include" cannot be used together',
        );
    }

    private refineForSelectOmitMutuallyExclusive(schema: ZodType) {
        return schema.refine(
            (value: any) => !(value['select'] && value['omit']),
            '"select" and "omit" cannot be used together',
        );
    }

    private refineForSelectHasTruthyField(schema: ZodType) {
        return schema.refine((value: any) => {
            const select = value['select'];
            if (!select || typeof select !== 'object') {
                return true;
            }
            return Object.values(select).some((v) => v);
        }, '"select" must have at least one truthy value');
    }

    private nullableIf(schema: ZodType, nullable: boolean) {
        return nullable ? schema.nullable() : schema;
    }

    private orArray<T extends ZodType>(schema: T, canBeArray: boolean) {
        return canBeArray ? z.union([schema, z.array(schema)]) : schema;
    }

    private isNumericField(fieldDef: FieldDef) {
        return NUMERIC_FIELD_TYPES.includes(fieldDef.type) && !fieldDef.array;
    }

    private get providerSupportsCaseSensitivity() {
        return this.schema.provider.type === 'postgresql';
    }

    private get providerSupportsFuzzySearch() {
        return this.schema.provider.type === 'postgresql';
    }

    /**
     * Gets the effective set of allowed FilterKind values for a specific model and field.
     * Respects the precedence: model[field] > model.$all > $all[field] > $all.$all.
     */
    private getEffectiveFilterKinds(model: string | undefined, field: string): string[] | undefined {
        if (!model) {
            // no restrictions
            return undefined;
        }

        const slicing = this.options.slicing;
        if (!slicing?.models) {
            // no slicing or no model-specific slicing, no restrictions
            return undefined;
        }

        // A string-indexed view of slicing.models that avoids unsafe 'as any' while still
        // allowing runtime access by model name. The value shape matches FieldSlicingOptions.
        type FieldConfig = { includedFilterKinds?: readonly string[]; excludedFilterKinds?: readonly string[] };
        type FieldsRecord = { $all?: FieldConfig } & Record<string, FieldConfig>;
        type ModelConfig = { fields?: FieldsRecord };
        const modelsRecord = slicing.models as Record<string, ModelConfig>;

        // Check field-level settings for the specific model
        const modelConfig = modelsRecord[lowerCaseFirst(model)];
        if (modelConfig?.fields) {
            const fieldConfig = modelConfig.fields[field];
            if (fieldConfig) {
                return this.computeFilterKinds(fieldConfig.includedFilterKinds, fieldConfig.excludedFilterKinds);
            }

            // Fallback to field-level $all for the specific model
            const allFieldsConfig = modelConfig.fields['$all'];
            if (allFieldsConfig) {
                return this.computeFilterKinds(
                    allFieldsConfig.includedFilterKinds,
                    allFieldsConfig.excludedFilterKinds,
                );
            }
        }

        // Fallback to model-level $all
        const allModelsConfig = modelsRecord['$all'];
        if (allModelsConfig?.fields) {
            // Check specific field in $all model config before falling back to $all.$all
            const allModelsFieldConfig = allModelsConfig.fields[field];
            if (allModelsFieldConfig) {
                return this.computeFilterKinds(
                    allModelsFieldConfig.includedFilterKinds,
                    allModelsFieldConfig.excludedFilterKinds,
                );
            }

            // Fallback to $all.$all
            const allModelsAllFieldsConfig = allModelsConfig.fields['$all'];
            if (allModelsAllFieldsConfig) {
                return this.computeFilterKinds(
                    allModelsAllFieldsConfig.includedFilterKinds,
                    allModelsAllFieldsConfig.excludedFilterKinds,
                );
            }
        }

        return undefined; // No restrictions
    }

    /**
     * Computes the effective set of filter kinds based on inclusion and exclusion lists.
     */
    private computeFilterKinds(included: readonly string[] | undefined, excluded: readonly string[] | undefined) {
        let result: string[] | undefined;

        if (included !== undefined) {
            // Start with the included set
            result = [...included];
        }

        if (excluded !== undefined) {
            if (!result) {
                // If no inclusion list, start with all filter kinds
                result = [...this.allFilterKinds];
            }
            // Remove excluded kinds
            for (const kind of excluded) {
                result = result.filter((k) => k !== kind);
            }
        }

        return result;
    }

    /**
     * Filters operators based on allowed filter kinds.
     */
    private trimFilterOperators<T extends Record<string, any>>(
        operators: T,
        allowedKinds: string[] | undefined,
    ): Partial<T> {
        if (!allowedKinds) {
            return operators; // No restrictions
        }

        return Object.fromEntries(
            Object.entries(operators).filter(([key, _]) => {
                return (
                    !(key in FILTER_PROPERTY_TO_KIND) ||
                    allowedKinds.includes(FILTER_PROPERTY_TO_KIND[key as keyof typeof FILTER_PROPERTY_TO_KIND])
                );
            }),
        ) as Partial<T>;
    }

    private createUnionFilterSchema(
        valueSchema: ZodType,
        optional: boolean,
        components: Record<string, ZodType>,
        allowedFilterKinds: string[] | undefined,
    ) {
        // If all filter operators are excluded
        if (Object.keys(components).length === 0) {
            // if equality filters are allowed, allow direct value
            if (!allowedFilterKinds || allowedFilterKinds.includes('Equality')) {
                return this.nullableIf(valueSchema, optional);
            }
            // otherwise nothing is allowed
            return z.never();
        }

        if (!allowedFilterKinds || allowedFilterKinds.includes('Equality')) {
            // direct value or filter operators
            return z.union([this.nullableIf(valueSchema, optional), z.strictObject(components)]);
        } else {
            // filter operators
            return z.strictObject(components);
        }
    }

    private canCreateModel(model: string) {
        const modelDef = requireModel(this.schema, model);
        if (modelDef.isDelegate) {
            return false;
        }
        const hasRequiredUnsupportedFields = Object.values(modelDef.fields).some(
            (fieldDef) => fieldDef.type === 'Unsupported' && !fieldDef.optional && !fieldHasDefaultValue(fieldDef),
        );
        if (hasRequiredUnsupportedFields) {
            return false;
        }
        return true;
    }

    private isModelAllowed(targetModel: string): boolean {
        const slicing = this.options.slicing;
        if (!slicing) {
            return true; // No slicing, all models allowed
        }

        const { includedModels, excludedModels } = slicing;

        // If includedModels is specified, only those models are allowed
        if (includedModels !== undefined) {
            if (!includedModels.includes(targetModel as any)) {
                return false;
            }
        }

        // If excludedModels is specified, those models are not allowed
        if (excludedModels !== undefined) {
            if (excludedModels.includes(targetModel as any)) {
                return false;
            }
        }

        return true;
    }

    private isProcedureAllowed(procName: string): boolean {
        const slicing = this.options.slicing;
        if (!slicing) {
            return true;
        }

        const { includedProcedures, excludedProcedures } = slicing;

        if (includedProcedures !== undefined) {
            if (!(includedProcedures as readonly string[]).includes(procName)) {
                return false;
            }
        }

        if (excludedProcedures !== undefined) {
            if ((excludedProcedures as readonly string[]).includes(procName)) {
                return false;
            }
        }

        return true;
    }

    // #endregion
}

export function createSchemaFactory<Schema extends SchemaDef, Client extends ClientContract<Schema, any, any>>(
    client: Client,
): Client extends ClientContract<Schema, infer Options, infer ExtQueryArgs>
    ? ZodSchemaFactory<Schema, Options, ExtQueryArgs>
    : never {
    return new ZodSchemaFactory(client) as any;
}
