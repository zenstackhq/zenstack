import { enumerate, invariant, lowerCaseFirst } from '@zenstackhq/common-helpers';
import { ZodUtils } from '@zenstackhq/zod';
import Decimal from 'decimal.js';
import { match, P } from 'ts-pattern';
import { z, ZodObject, ZodType } from 'zod';
import { AnyNullClass, DbNullClass, JsonNullClass } from '../../common-types';
import {
    type AttributeApplication,
    type BuiltinType,
    type FieldDef,
    type GetModels,
    type SchemaDef,
} from '../../schema';
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
import type { ClientOptions } from '../options';
import type { AnyPlugin, ExtQueryArgsBase, RuntimePlugin } from '../plugin';
import {
    fieldHasDefaultValue,
    getDiscriminatorField,
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
 * Minimal field information needed for filter schema generation.
 */
type FieldInfo = {
    name: string;
    type: string;
    optional?: boolean;
    array?: boolean;
};

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

export function createQuerySchemaFactory(clientOrSchema: any, options?: any) {
    return new ZodSchemaFactory(clientOrSchema, options);
}

/**
 * Factory class responsible for creating and caching Zod schemas for ORM input validation.
 */
export class ZodSchemaFactory<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> {
    private readonly schemaCache = new Map<string, ZodType>();
    private readonly allFilterKinds = [...new Set(Object.values(FILTER_PROPERTY_TO_KIND))];
    private readonly schema: Schema;
    private readonly options: Options;

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

    private get plugins(): RuntimePlugin<Schema, any, any>[] {
        return this.options.plugins ?? [];
    }

    private get extraValidationsEnabled() {
        return this.options.validateInput !== false;
    }

    // #region Cache Management

    // @ts-ignore
    private getCache(cacheKey: string) {
        return this.schemaCache.get(cacheKey);
    }

    // @ts-ignore
    private setCache(cacheKey: string, schema: ZodType) {
        return this.schemaCache.set(cacheKey, schema);
    }

    // @ts-ignore
    private printCacheStats(detailed = false) {
        console.log('Schema cache size:', this.schemaCache.size);
        if (detailed) {
            for (const key of this.schemaCache.keys()) {
                console.log(`\t${key}`);
            }
        }
    }

    // #endregion

    // #region Find

    makeFindUniqueSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<FindUniqueArgs<Schema, Model, Options, ExtQueryArgs>> {
        return this.makeFindSchema(model, 'findUnique') as ZodType<
            FindUniqueArgs<Schema, Model, Options, ExtQueryArgs>
        >;
    }

    makeFindFirstSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<FindFirstArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        return this.makeFindSchema(model, 'findFirst') as ZodType<
            FindFirstArgs<Schema, Model, Options, ExtQueryArgs> | undefined
        >;
    }

    makeFindManySchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<FindManyArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        return this.makeFindSchema(model, 'findMany') as ZodType<
            FindManyArgs<Schema, Model, Options, ExtQueryArgs> | undefined
        >;
    }

    @cache()
    private makeFindSchema(model: string, operation: CoreCrudOperations) {
        const fields: Record<string, z.ZodSchema> = {};
        const unique = operation === 'findUnique';
        const findOne = operation === 'findUnique' || operation === 'findFirst';
        const where = this.makeWhereSchema(model, unique);
        if (unique) {
            fields['where'] = where;
        } else {
            fields['where'] = where.optional();
        }

        fields['select'] = this.makeSelectSchema(model).optional().nullable();
        fields['include'] = this.makeIncludeSchema(model).optional().nullable();
        fields['omit'] = this.makeOmitSchema(model).optional().nullable();

        if (!unique) {
            fields['skip'] = this.makeSkipSchema().optional();
            if (findOne) {
                fields['take'] = z.literal(1).optional();
            } else {
                fields['take'] = this.makeTakeSchema().optional();
            }
            fields['orderBy'] = this.orArray(this.makeOrderBySchema(model, true, false), true).optional();
            fields['cursor'] = this.makeCursorSchema(model).optional();
            fields['distinct'] = this.makeDistinctSchema(model).optional();
        }

        const baseSchema = z.strictObject(fields);
        let result: ZodType = this.mergePluginArgsSchema(baseSchema, operation);
        result = this.refineForSelectIncludeMutuallyExclusive(result);
        result = this.refineForSelectOmitMutuallyExclusive(result);

        if (!unique) {
            result = result.optional();
        }
        return result;
    }

    @cache()
    makeExistsSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<ExistsArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, false).optional(),
        });
        return this.mergePluginArgsSchema(baseSchema, 'exists').optional() as ZodType<
            ExistsArgs<Schema, Model, Options, ExtQueryArgs> | undefined
        >;
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
                .with('DateTime', () => z.union([z.date(), z.iso.datetime()]))
                .with('Bytes', () => z.instanceof(Uint8Array))
                .with('Json', () => this.makeJsonValueSchema(false, false))
                .otherwise(() => z.unknown());
        }
    }

    @cache()
    private makeEnumSchema(_enum: string) {
        const enumDef = getEnum(this.schema, _enum);
        invariant(enumDef, `Enum "${_enum}" not found in schema`);
        return z.enum(Object.keys(enumDef.values) as [string, ...string[]]);
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

        return finalSchema;
    }

    @cache()
    makeWhereSchema(model: string, unique: boolean, withoutRelationFields = false, withAggregations = false): ZodType {
        const modelDef = requireModel(this.schema, model);

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

        const fields: Record<string, any> = {};
        for (const field of Object.keys(modelDef.fields)) {
            const fieldDef = requireField(this.schema, model, field);
            let fieldSchema: ZodType | undefined;

            if (fieldDef.relation) {
                if (withoutRelationFields) {
                    continue;
                }

                // Check if Relation filter kind is allowed
                const allowedFilterKinds = this.getEffectiveFilterKinds(model, field);
                if (allowedFilterKinds && !allowedFilterKinds.includes('Relation')) {
                    // Relation filters are not allowed for this field - use z.never()
                    fieldSchema = z.never();
                } else {
                    fieldSchema = z.lazy(() => this.makeWhereSchema(fieldDef.type, false).optional());

                    // optional to-one relation allows null
                    fieldSchema = this.nullableIf(fieldSchema, !fieldDef.array && !!fieldDef.optional);

                    if (fieldDef.array) {
                        // to-many relation
                        fieldSchema = z.union([
                            fieldSchema,
                            z.strictObject({
                                some: fieldSchema.optional(),
                                every: fieldSchema.optional(),
                                none: fieldSchema.optional(),
                            }),
                        ]);
                    } else {
                        // to-one relation
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

                const enumDef = getEnum(this.schema, fieldDef.type);
                if (enumDef) {
                    // enum
                    if (Object.keys(enumDef.values).length > 0) {
                        fieldSchema = this.makeEnumFilterSchema(model, fieldDef, withAggregations, ignoreSlicing);
                    }
                } else if (fieldDef.array) {
                    // array field
                    fieldSchema = this.makeArrayFilterSchema(model, fieldDef);
                } else if (this.isTypeDefType(fieldDef.type)) {
                    fieldSchema = this.makeTypedJsonFilterSchema(model, fieldDef);
                } else {
                    // primitive field
                    fieldSchema = this.makePrimitiveFilterSchema(model, fieldDef, withAggregations, ignoreSlicing);
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
                                        // enum
                                        if (Object.keys(enumDef.values).length > 0) {
                                            fieldSchema = this.makeEnumFilterSchema(model, def, false, true);
                                        } else {
                                            fieldSchema = z.never();
                                        }
                                    } else {
                                        fieldSchema = this.makePrimitiveFilterSchema(model, def, false, true);
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
            z.lazy(() => this.makeWhereSchema(model, false, withoutRelationFields)),
            true,
        ).optional();
        fields['OR'] = z
            .lazy(() => this.makeWhereSchema(model, false, withoutRelationFields))
            .array()
            .optional();
        fields['NOT'] = this.orArray(
            z.lazy(() => this.makeWhereSchema(model, false, withoutRelationFields)),
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

        return result;
    }

    @cache()
    private makeTypedJsonFilterSchema(contextModel: string | undefined, fieldInfo: FieldInfo) {
        const field = fieldInfo.name;
        const type = fieldInfo.type;
        const optional = !!fieldInfo.optional;
        const array = !!fieldInfo.array;

        const typeDef = getTypeDef(this.schema, type);
        invariant(typeDef, `Type definition "${type}" not found in schema`);

        const candidates: ZodType[] = [];

        if (!array) {
            // fields filter
            const fieldSchemas: Record<string, ZodType> = {};
            for (const [fieldName, fieldDef] of Object.entries(typeDef.fields)) {
                if (this.isTypeDefType(fieldDef.type)) {
                    // recursive typed JSON - use same model/field for nested typed JSON
                    fieldSchemas[fieldName] = this.makeTypedJsonFilterSchema(contextModel, fieldDef).optional();
                } else {
                    // enum, array, primitives
                    const enumDef = getEnum(this.schema, fieldDef.type);
                    if (enumDef) {
                        fieldSchemas[fieldName] = this.makeEnumFilterSchema(contextModel, fieldDef, false).optional();
                    } else if (fieldDef.array) {
                        fieldSchemas[fieldName] = this.makeArrayFilterSchema(contextModel, fieldDef).optional();
                    } else {
                        fieldSchemas[fieldName] = this.makePrimitiveFilterSchema(
                            contextModel,
                            fieldDef,
                            false,
                        ).optional();
                    }
                }
            }

            candidates.push(z.strictObject(fieldSchemas));
        }

        const recursiveSchema = z
            .lazy(() => this.makeTypedJsonFilterSchema(contextModel, { name: field, type, optional, array: false }))
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
        candidates.push(this.makeJsonFilterSchema(contextModel, field, optional));

        if (optional) {
            // allow null as well
            candidates.push(z.null());
        }

        // either plain json filter or field filters
        return z.union(candidates);
    }

    private isTypeDefType(type: string) {
        return this.schema.typeDefs && type in this.schema.typeDefs;
    }

    @cache()
    private makeEnumFilterSchema(
        model: string | undefined,
        fieldInfo: FieldInfo,
        withAggregations: boolean,
        ignoreSlicing: boolean = false,
    ) {
        const enumName = fieldInfo.type;
        const optional = !!fieldInfo.optional;
        const array = !!fieldInfo.array;

        const enumDef = getEnum(this.schema, enumName);
        invariant(enumDef, `Enum "${enumName}" not found in schema`);
        const baseSchema = z.enum(Object.keys(enumDef.values) as [string, ...string[]]);
        if (array) {
            return this.internalMakeArrayFilterSchema(model, fieldInfo.name, baseSchema);
        }
        const allowedFilterKinds = ignoreSlicing ? undefined : this.getEffectiveFilterKinds(model, fieldInfo.name);
        const components = this.makeCommonPrimitiveFilterComponents(
            baseSchema,
            optional,
            () => z.lazy(() => this.makeEnumFilterSchema(model, fieldInfo, withAggregations)),
            ['equals', 'in', 'notIn', 'not'],
            withAggregations ? ['_count', '_min', '_max'] : undefined,
            allowedFilterKinds,
        );

        return this.createUnionFilterSchema(baseSchema, optional, components, allowedFilterKinds);
    }

    @cache()
    private makeArrayFilterSchema(model: string | undefined, fieldInfo: FieldInfo) {
        return this.internalMakeArrayFilterSchema(
            model,
            fieldInfo.name,
            this.makeScalarSchema(fieldInfo.type as BuiltinType),
        );
    }

    private internalMakeArrayFilterSchema(contextModel: string | undefined, field: string, elementSchema: ZodType) {
        const allowedFilterKinds = this.getEffectiveFilterKinds(contextModel, field);
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
        contextModel: string | undefined,
        fieldInfo: FieldInfo,
        withAggregations: boolean,
        ignoreSlicing = false,
    ) {
        const allowedFilterKinds = ignoreSlicing
            ? undefined
            : this.getEffectiveFilterKinds(contextModel, fieldInfo.name);
        const type = fieldInfo.type as BuiltinType;
        const optional = !!fieldInfo.optional;
        return match(type)
            .with('String', () => this.makeStringFilterSchema(optional, withAggregations, allowedFilterKinds))
            .with(P.union('Int', 'Float', 'Decimal', 'BigInt'), (type) =>
                this.makeNumberFilterSchema(
                    this.makeScalarSchema(type),
                    optional,
                    withAggregations,
                    allowedFilterKinds,
                ),
            )
            .with('Boolean', () => this.makeBooleanFilterSchema(optional, withAggregations, allowedFilterKinds))
            .with('DateTime', () => this.makeDateTimeFilterSchema(optional, withAggregations, allowedFilterKinds))
            .with('Bytes', () => this.makeBytesFilterSchema(optional, withAggregations, allowedFilterKinds))
            .with('Json', () => this.makeJsonFilterSchema(contextModel, fieldInfo.name, optional))
            .with('Unsupported', () => z.never())
            .exhaustive();
    }

    private makeJsonValueSchema(nullable: boolean, forFilter: boolean): ZodType {
        const options: ZodType[] = [z.string(), z.number(), z.boolean(), z.instanceof(JsonNullClass)];

        if (forFilter) {
            options.push(z.instanceof(DbNullClass));
        } else {
            if (nullable) {
                // for mutation, allow DbNull only if nullable
                options.push(z.instanceof(DbNullClass));
            }
        }

        if (forFilter) {
            options.push(z.instanceof(AnyNullClass));
        }

        const schema = z.union([
            ...options,
            z.lazy(() => z.union([this.makeJsonValueSchema(false, false), z.null()]).array()),
            z.record(
                z.string(),
                z.lazy(() => z.union([this.makeJsonValueSchema(false, false), z.null()])),
            ),
        ]);
        return this.nullableIf(schema, nullable);
    }

    @cache()
    private makeJsonFilterSchema(contextModel: string | undefined, field: string, optional: boolean) {
        const allowedFilterKinds = this.getEffectiveFilterKinds(contextModel, field);

        // Check if Json filter kind is allowed
        if (allowedFilterKinds && !allowedFilterKinds.includes('Json')) {
            // Return a never schema if Json filters are not allowed
            return z.never();
        }

        const valueSchema = this.makeJsonValueSchema(optional, true);
        return z.strictObject({
            path: z.string().optional(),
            equals: valueSchema.optional(),
            not: valueSchema.optional(),
            string_contains: z.string().optional(),
            string_starts_with: z.string().optional(),
            string_ends_with: z.string().optional(),
            mode: this.makeStringModeSchema().optional(),
            array_contains: valueSchema.optional(),
            array_starts_with: valueSchema.optional(),
            array_ends_with: valueSchema.optional(),
        });
    }

    @cache()
    private makeDateTimeFilterSchema(
        optional: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ): ZodType {
        return this.makeCommonPrimitiveFilterSchema(
            z.union([z.iso.datetime(), z.date()]),
            optional,
            () => z.lazy(() => this.makeDateTimeFilterSchema(optional, withAggregations, allowedFilterKinds)),
            withAggregations ? ['_count', '_min', '_max'] : undefined,
            allowedFilterKinds,
        );
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

        return this.createUnionFilterSchema(z.boolean(), optional, components, allowedFilterKinds);
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

        return this.createUnionFilterSchema(baseSchema, optional, components, allowedFilterKinds);
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
                ? { _count: this.makeNumberFilterSchema(z.number().int(), false, false, undefined).optional() }
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

    private makeNumberFilterSchema(
        baseSchema: ZodType,
        optional: boolean,
        withAggregations: boolean,
        allowedFilterKinds: string[] | undefined,
    ): ZodType {
        return this.makeCommonPrimitiveFilterSchema(
            baseSchema,
            optional,
            () => z.lazy(() => this.makeNumberFilterSchema(baseSchema, optional, withAggregations, allowedFilterKinds)),
            withAggregations ? ['_count', '_avg', '_sum', '_min', '_max'] : undefined,
            allowedFilterKinds,
        );
    }

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

        return this.createUnionFilterSchema(z.string(), optional, allComponents, allowedFilterKinds);
    }

    private makeStringModeSchema() {
        return z.union([z.literal('default'), z.literal('insensitive')]);
    }

    @cache()
    private makeSelectSchema(model: string) {
        const modelDef = requireModel(this.schema, model);
        const fields: Record<string, ZodType> = {};
        for (const field of Object.keys(modelDef.fields)) {
            const fieldDef = requireField(this.schema, model, field);
            if (fieldDef.relation) {
                // Check if the target model is allowed by slicing configuration
                if (this.isModelAllowed(fieldDef.type)) {
                    fields[field] = this.makeRelationSelectIncludeSchema(model, field).optional();
                }
            } else {
                fields[field] = z.boolean().optional();
            }
        }

        const _countSchema = this.makeCountSelectionSchema(model);
        if (!(_countSchema instanceof z.ZodNever)) {
            fields['_count'] = _countSchema;
        }

        return z.strictObject(fields);
    }

    @cache()
    private makeCountSelectionSchema(model: string) {
        const modelDef = requireModel(this.schema, model);
        const toManyRelations = Object.values(modelDef.fields).filter((def) => def.relation && def.array);
        if (toManyRelations.length > 0) {
            return z
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
                                                where: this.makeWhereSchema(fieldDef.type, false, false),
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
        } else {
            return z.never();
        }
    }

    @cache()
    private makeRelationSelectIncludeSchema(model: string, field: string) {
        const fieldDef = requireField(this.schema, model, field);
        let objSchema: ZodType = z.strictObject({
            ...(fieldDef.array || fieldDef.optional
                ? {
                      // to-many relations and optional to-one relations are filterable
                      where: z.lazy(() => this.makeWhereSchema(fieldDef.type, false)).optional(),
                  }
                : {}),
            select: z
                .lazy(() => this.makeSelectSchema(fieldDef.type))
                .optional()
                .nullable(),
            include: z
                .lazy(() => this.makeIncludeSchema(fieldDef.type))
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
                          .lazy(() => this.orArray(this.makeOrderBySchema(fieldDef.type, true, false), true))
                          .optional(),
                      skip: this.makeSkipSchema().optional(),
                      take: this.makeTakeSchema().optional(),
                      cursor: this.makeCursorSchema(fieldDef.type).optional(),
                      distinct: this.makeDistinctSchema(fieldDef.type).optional(),
                  }
                : {}),
        });

        objSchema = this.refineForSelectIncludeMutuallyExclusive(objSchema);
        objSchema = this.refineForSelectOmitMutuallyExclusive(objSchema);

        return z.union([z.boolean(), objSchema]);
    }

    @cache()
    private makeOmitSchema(model: string) {
        const modelDef = requireModel(this.schema, model);
        const fields: Record<string, ZodType> = {};
        for (const field of Object.keys(modelDef.fields)) {
            const fieldDef = requireField(this.schema, model, field);
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
        return z.strictObject(fields);
    }

    @cache()
    private makeIncludeSchema(model: string) {
        const modelDef = requireModel(this.schema, model);
        const fields: Record<string, ZodType> = {};
        for (const field of Object.keys(modelDef.fields)) {
            const fieldDef = requireField(this.schema, model, field);
            if (fieldDef.relation) {
                // Check if the target model is allowed by slicing configuration
                if (this.isModelAllowed(fieldDef.type)) {
                    fields[field] = this.makeRelationSelectIncludeSchema(model, field).optional();
                }
            }
        }

        const _countSchema = this.makeCountSelectionSchema(model);
        if (!(_countSchema instanceof z.ZodNever)) {
            fields['_count'] = _countSchema;
        }

        return z.strictObject(fields);
    }

    @cache()
    private makeOrderBySchema(model: string, withRelation: boolean, WithAggregation: boolean) {
        const modelDef = requireModel(this.schema, model);
        const fields: Record<string, ZodType> = {};
        const sort = z.union([z.literal('asc'), z.literal('desc')]);
        for (const field of Object.keys(modelDef.fields)) {
            const fieldDef = requireField(this.schema, model, field);
            if (fieldDef.relation) {
                // relations
                if (withRelation) {
                    fields[field] = z.lazy(() => {
                        let relationOrderBy = this.makeOrderBySchema(fieldDef.type, withRelation, WithAggregation);
                        if (fieldDef.array) {
                            relationOrderBy = relationOrderBy.extend({
                                _count: sort,
                            });
                        }
                        return relationOrderBy.optional();
                    });
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
                fields[agg] = z.lazy(() => this.makeOrderBySchema(model, true, false).optional());
            }
        }

        return z.strictObject(fields);
    }

    @cache()
    private makeDistinctSchema(model: string) {
        const modelDef = requireModel(this.schema, model);
        const nonRelationFields = Object.keys(modelDef.fields).filter((field) => !modelDef.fields[field]?.relation);
        return nonRelationFields.length > 0 ? this.orArray(z.enum(nonRelationFields as any), true) : z.never();
    }

    private makeCursorSchema(model: string) {
        // `makeWhereSchema` is already cached
        return this.makeWhereSchema(model, true, true).optional();
    }

    // #endregion

    // #region Create

    @cache()
    makeCreateSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<CreateArgs<Schema, Model, Options, ExtQueryArgs>> {
        const dataSchema = this.makeCreateDataSchema(model, false);
        const baseSchema = z.strictObject({
            data: dataSchema,
            select: this.makeSelectSchema(model).optional().nullable(),
            include: this.makeIncludeSchema(model).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'create');
        schema = this.refineForSelectIncludeMutuallyExclusive(schema);
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        return schema as ZodType<CreateArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeCreateManySchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<CreateManyArgs<Schema, Model, Options, ExtQueryArgs>> {
        return this.mergePluginArgsSchema(
            this.makeCreateManyPayloadSchema(model, []),
            'createMany',
        ) as unknown as ZodType<CreateManyArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeCreateManyAndReturnSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<CreateManyAndReturnArgs<Schema, Model, Options, ExtQueryArgs>> {
        const base = this.makeCreateManyPayloadSchema(model, []);
        let result: ZodObject = base.extend({
            select: this.makeSelectSchema(model).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        result = this.mergePluginArgsSchema(result, 'createManyAndReturn');
        return this.refineForSelectOmitMutuallyExclusive(result).optional() as ZodType<
            CreateManyAndReturnArgs<Schema, Model, Options, ExtQueryArgs>
        >;
    }

    @cache()
    private makeCreateDataSchema(
        model: string,
        canBeArray: boolean,
        withoutFields: string[] = [],
        withoutRelationFields = false,
    ) {
        const uncheckedVariantFields: Record<string, ZodType> = {};
        const checkedVariantFields: Record<string, ZodType> = {};
        const modelDef = requireModel(this.schema, model);
        const hasRelation =
            !withoutRelationFields &&
            Object.entries(modelDef.fields).some(([f, def]) => !withoutFields.includes(f) && def.relation);

        Object.keys(modelDef.fields).forEach((field) => {
            if (withoutFields.includes(field)) {
                return;
            }
            const fieldDef = requireField(this.schema, model, field);
            if (fieldDef.computed) {
                return;
            }

            if (this.isDelegateDiscriminator(fieldDef)) {
                // discriminator field is auto-assigned
                return;
            }

            if (fieldDef.relation) {
                if (withoutRelationFields) {
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
                    this.makeRelationManipulationSchema(model, field, excludeFields, 'create'),
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

        if (!hasRelation) {
            return this.orArray(uncheckedCreateSchema, canBeArray);
        } else {
            return z.union([
                uncheckedCreateSchema,
                checkedCreateSchema,
                ...(canBeArray ? [z.array(uncheckedCreateSchema)] : []),
                ...(canBeArray ? [z.array(checkedCreateSchema)] : []),
            ]);
        }
    }

    private isDelegateDiscriminator(fieldDef: FieldDef) {
        if (!fieldDef.originModel) {
            // not inherited from a delegate
            return false;
        }
        const discriminatorField = getDiscriminatorField(this.schema, fieldDef.originModel);
        return discriminatorField === fieldDef.name;
    }

    @cache()
    private makeRelationManipulationSchema(
        model: string,
        field: string,
        withoutFields: string[],
        mode: 'create' | 'update',
    ) {
        const fieldDef = requireField(this.schema, model, field);
        const fieldType = fieldDef.type;
        const array = !!fieldDef.array;
        const fields: Record<string, ZodType> = {
            create: this.makeCreateDataSchema(fieldDef.type, !!fieldDef.array, withoutFields).optional(),

            connect: this.makeConnectDataSchema(fieldType, array).optional(),

            connectOrCreate: this.makeConnectOrCreateDataSchema(fieldType, array, withoutFields).optional(),
        };

        if (array) {
            fields['createMany'] = this.makeCreateManyPayloadSchema(fieldType, withoutFields).optional();
        }

        if (mode === 'update') {
            if (fieldDef.optional || fieldDef.array) {
                // disconnect and delete are only available for optional/to-many relations
                fields['disconnect'] = this.makeDisconnectDataSchema(fieldType, array).optional();

                fields['delete'] = this.makeDeleteRelationDataSchema(fieldType, array, true).optional();
            }

            fields['update'] = array
                ? this.orArray(
                      z.strictObject({
                          where: this.makeWhereSchema(fieldType, true),
                          data: this.makeUpdateDataSchema(fieldType, withoutFields),
                      }),
                      true,
                  ).optional()
                : z
                      .union([
                          z.strictObject({
                              where: this.makeWhereSchema(fieldType, false).optional(),
                              data: this.makeUpdateDataSchema(fieldType, withoutFields),
                          }),
                          this.makeUpdateDataSchema(fieldType, withoutFields),
                      ])
                      .optional();

            let upsertWhere = this.makeWhereSchema(fieldType, true);
            if (!fieldDef.array) {
                // to-one relation, can upsert without where clause
                upsertWhere = upsertWhere.optional();
            }
            fields['upsert'] = this.orArray(
                z.strictObject({
                    where: upsertWhere,
                    create: this.makeCreateDataSchema(fieldType, false, withoutFields),
                    update: this.makeUpdateDataSchema(fieldType, withoutFields),
                }),
                true,
            ).optional();

            if (array) {
                // to-many relation specifics
                fields['set'] = this.makeSetDataSchema(fieldType, true).optional();

                fields['updateMany'] = this.orArray(
                    z.strictObject({
                        where: this.makeWhereSchema(fieldType, false, true),
                        data: this.makeUpdateDataSchema(fieldType, withoutFields),
                    }),
                    true,
                ).optional();

                fields['deleteMany'] = this.makeDeleteRelationDataSchema(fieldType, true, false).optional();
            }
        }

        return z.strictObject(fields);
    }

    @cache()
    private makeSetDataSchema(model: string, canBeArray: boolean) {
        return this.orArray(this.makeWhereSchema(model, true), canBeArray);
    }

    @cache()
    private makeConnectDataSchema(model: string, canBeArray: boolean) {
        return this.orArray(this.makeWhereSchema(model, true), canBeArray);
    }

    @cache()
    private makeDisconnectDataSchema(model: string, canBeArray: boolean) {
        if (canBeArray) {
            // to-many relation, must be unique filters
            return this.orArray(this.makeWhereSchema(model, true), canBeArray);
        } else {
            // to-one relation, can be boolean or a regular filter - the entity
            // being disconnected is already uniquely identified by its parent
            return z.union([z.boolean(), this.makeWhereSchema(model, false)]);
        }
    }

    @cache()
    private makeDeleteRelationDataSchema(model: string, toManyRelation: boolean, uniqueFilter: boolean) {
        return toManyRelation
            ? this.orArray(this.makeWhereSchema(model, uniqueFilter), true)
            : z.union([z.boolean(), this.makeWhereSchema(model, uniqueFilter)]);
    }

    @cache()
    private makeConnectOrCreateDataSchema(model: string, canBeArray: boolean, withoutFields: string[]) {
        const whereSchema = this.makeWhereSchema(model, true);
        const createSchema = this.makeCreateDataSchema(model, false, withoutFields);
        return this.orArray(
            z.strictObject({
                where: whereSchema,
                create: createSchema,
            }),
            canBeArray,
        );
    }

    @cache()
    private makeCreateManyPayloadSchema(model: string, withoutFields: string[]) {
        return z.strictObject({
            data: this.makeCreateDataSchema(model, true, withoutFields, true),
            skipDuplicates: z.boolean().optional(),
        });
    }

    // #endregion

    // #region Update

    @cache()
    makeUpdateSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<UpdateArgs<Schema, Model, Options, ExtQueryArgs>> {
        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, true),
            data: this.makeUpdateDataSchema(model),
            select: this.makeSelectSchema(model).optional().nullable(),
            include: this.makeIncludeSchema(model).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'update');
        schema = this.refineForSelectIncludeMutuallyExclusive(schema);
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        return schema as ZodType<UpdateArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeUpdateManySchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<UpdateManyArgs<Schema, Model, Options, ExtQueryArgs>> {
        return this.mergePluginArgsSchema(
            z.strictObject({
                where: this.makeWhereSchema(model, false).optional(),
                data: this.makeUpdateDataSchema(model, [], true),
                limit: z.number().int().nonnegative().optional(),
            }),
            'updateMany',
        ) as unknown as ZodType<UpdateManyArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeUpdateManyAndReturnSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<UpdateManyAndReturnArgs<Schema, Model, Options, ExtQueryArgs>> {
        // plugin extended args schema is merged in `makeUpdateManySchema`
        const baseSchema = this.makeUpdateManySchema(model) as unknown as ZodObject;
        let schema: ZodType = baseSchema.extend({
            select: this.makeSelectSchema(model).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        return schema as ZodType<UpdateManyAndReturnArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeUpsertSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<UpsertArgs<Schema, Model, Options, ExtQueryArgs>> {
        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, true),
            create: this.makeCreateDataSchema(model, false),
            update: this.makeUpdateDataSchema(model),
            select: this.makeSelectSchema(model).optional().nullable(),
            include: this.makeIncludeSchema(model).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'upsert');
        schema = this.refineForSelectIncludeMutuallyExclusive(schema);
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        return schema as ZodType<UpsertArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    private makeUpdateDataSchema(model: string, withoutFields: string[] = [], withoutRelationFields = false) {
        const uncheckedVariantFields: Record<string, ZodType> = {};
        const checkedVariantFields: Record<string, ZodType> = {};
        const modelDef = requireModel(this.schema, model);
        const hasRelation = Object.entries(modelDef.fields).some(
            ([key, value]) => value.relation && !withoutFields.includes(key),
        );

        Object.keys(modelDef.fields).forEach((field) => {
            if (withoutFields.includes(field)) {
                return;
            }
            const fieldDef = requireField(this.schema, model, field);

            if (fieldDef.relation) {
                if (withoutRelationFields) {
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
                    .lazy(() => this.makeRelationManipulationSchema(model, field, excludeFields, 'update'))
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
        if (!hasRelation) {
            return uncheckedUpdateSchema;
        } else {
            return z.union([uncheckedUpdateSchema, checkedUpdateSchema]);
        }
    }

    // #endregion

    // #region Delete

    @cache()
    makeDeleteSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<DeleteArgs<Schema, Model, Options, ExtQueryArgs>> {
        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, true),
            select: this.makeSelectSchema(model).optional().nullable(),
            include: this.makeIncludeSchema(model).optional().nullable(),
            omit: this.makeOmitSchema(model).optional().nullable(),
        });
        let schema: ZodType = this.mergePluginArgsSchema(baseSchema, 'delete');
        schema = this.refineForSelectIncludeMutuallyExclusive(schema);
        schema = this.refineForSelectOmitMutuallyExclusive(schema);
        return schema as ZodType<DeleteArgs<Schema, Model, Options, ExtQueryArgs>>;
    }

    @cache()
    makeDeleteManySchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<DeleteManyArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        return this.mergePluginArgsSchema(
            z.strictObject({
                where: this.makeWhereSchema(model, false).optional(),
                limit: z.number().int().nonnegative().optional(),
            }),
            'deleteMany',
        ).optional() as unknown as ZodType<DeleteManyArgs<Schema, Model, Options, ExtQueryArgs> | undefined>;
    }

    // #endregion

    // #region Count

    @cache()
    makeCountSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<CountArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        return this.mergePluginArgsSchema(
            z.strictObject({
                where: this.makeWhereSchema(model, false).optional(),
                skip: this.makeSkipSchema().optional(),
                take: this.makeTakeSchema().optional(),
                orderBy: this.orArray(this.makeOrderBySchema(model, true, false), true).optional(),
                select: this.makeCountAggregateInputSchema(model).optional(),
            }),
            'count',
        ).optional() as ZodType<CountArgs<Schema, Model, Options, ExtQueryArgs> | undefined>;
    }

    @cache()
    private makeCountAggregateInputSchema(model: string) {
        const modelDef = requireModel(this.schema, model);
        return z.union([
            z.literal(true),
            z.strictObject({
                _all: z.literal(true).optional(),
                ...Object.keys(modelDef.fields).reduce(
                    (acc, field) => {
                        acc[field] = z.literal(true).optional();
                        return acc;
                    },
                    {} as Record<string, ZodType>,
                ),
            }),
        ]);
    }

    // #endregion

    // #region Aggregate

    @cache()
    makeAggregateSchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<AggregateArgs<Schema, Model, Options, ExtQueryArgs> | undefined> {
        return this.mergePluginArgsSchema(
            z.strictObject({
                where: this.makeWhereSchema(model, false).optional(),
                skip: this.makeSkipSchema().optional(),
                take: this.makeTakeSchema().optional(),
                orderBy: this.orArray(this.makeOrderBySchema(model, true, false), true).optional(),
                _count: this.makeCountAggregateInputSchema(model).optional(),
                _avg: this.makeSumAvgInputSchema(model).optional(),
                _sum: this.makeSumAvgInputSchema(model).optional(),
                _min: this.makeMinMaxInputSchema(model).optional(),
                _max: this.makeMinMaxInputSchema(model).optional(),
            }),
            'aggregate',
        ).optional() as ZodType<AggregateArgs<Schema, Model, Options, ExtQueryArgs> | undefined>;
    }

    @cache()
    private makeSumAvgInputSchema(model: string) {
        const modelDef = requireModel(this.schema, model);
        return z.strictObject(
            Object.keys(modelDef.fields).reduce(
                (acc, field) => {
                    const fieldDef = requireField(this.schema, model, field);
                    if (this.isNumericField(fieldDef)) {
                        acc[field] = z.literal(true).optional();
                    }
                    return acc;
                },
                {} as Record<string, ZodType>,
            ),
        );
    }

    @cache()
    private makeMinMaxInputSchema(model: string) {
        const modelDef = requireModel(this.schema, model);
        return z.strictObject(
            Object.keys(modelDef.fields).reduce(
                (acc, field) => {
                    const fieldDef = requireField(this.schema, model, field);
                    if (!fieldDef.relation && !fieldDef.array) {
                        acc[field] = z.literal(true).optional();
                    }
                    return acc;
                },
                {} as Record<string, ZodType>,
            ),
        );
    }

    // #endregion

    // #region Group By

    @cache()
    makeGroupBySchema<Model extends GetModels<Schema>>(
        model: Model,
    ): ZodType<GroupByArgs<Schema, Model, Options, ExtQueryArgs>> {
        const modelDef = requireModel(this.schema, model);
        const nonRelationFields = Object.keys(modelDef.fields).filter((field) => !modelDef.fields[field]?.relation);
        const bySchema =
            nonRelationFields.length > 0
                ? this.orArray(z.enum(nonRelationFields as [string, ...string[]]), true)
                : z.never();

        const baseSchema = z.strictObject({
            where: this.makeWhereSchema(model, false).optional(),
            orderBy: this.orArray(this.makeOrderBySchema(model, false, true), true).optional(),
            by: bySchema,
            having: this.makeHavingSchema(model).optional(),
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

    private makeHavingSchema(model: string) {
        // `makeWhereSchema` is cached
        return this.makeWhereSchema(model, false, true, true);
    }

    // #endregion

    // #region Procedures

    @cache()
    makeProcedureParamSchema(param: { type: string; array?: boolean; optional?: boolean }): ZodType {
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

    /**
     * Checks if a model is included in the slicing configuration.
     * Returns true if the model is allowed, false if it's excluded.
     */
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

    // #endregion
}

export function createSchemaFactory<Schema extends SchemaDef, Client extends ClientContract<Schema, any, any>>(
    client: Client,
): Client extends ClientContract<Schema, infer Options, infer ExtQueryArgs>
    ? ZodSchemaFactory<Schema, Options, ExtQueryArgs>
    : never {
    return new ZodSchemaFactory(client) as any;
}
