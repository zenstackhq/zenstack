// Inspired by: https://github.com/omar-dulaimi/prisma-trpc-generator

import { PluginError, PluginOptions, analyzePolicies, requireOption, resolvePath } from '@zenstackhq/sdk';
import {
    DataModel,
    Model,
    TypeDef,
    TypeDefField,
    TypeDefFieldType,
    isDataModel,
    isEnum,
    isTypeDef,
} from '@zenstackhq/sdk/ast';
import {
    AggregateOperationSupport,
    addMissingInputObjectTypesForAggregate,
    addMissingInputObjectTypesForInclude,
    addMissingInputObjectTypesForModelArgs,
    addMissingInputObjectTypesForSelect,
    resolveAggregateOperationSupport,
} from '@zenstackhq/sdk/dmmf-helpers';
import { supportCreateMany, type DMMF } from '@zenstackhq/sdk/prisma';
import { lowerCaseFirst, upperCaseFirst, invariant } from '@zenstackhq/runtime/local-helpers';
import * as fs from 'fs';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';
import * as path from 'path';
import { P, match } from 'ts-pattern';
import YAML from 'yaml';
import { name } from '.';
import { OpenAPIGeneratorBase } from './generator-base';
import { getModelResourceMeta } from './meta';

const ANY_OBJECT = '_AnyObject';

/**
 * Generates OpenAPI specification.
 */
export class RPCOpenAPIGenerator extends OpenAPIGeneratorBase {
    private inputObjectTypes: DMMF.InputType[] = [];
    private outputObjectTypes: DMMF.OutputType[] = [];
    private usedComponents: Set<string> = new Set<string>();
    private aggregateOperationSupport: AggregateOperationSupport;
    private warnings: string[] = [];
    private omitInputDetails: boolean;

    constructor(protected model: Model, protected options: PluginOptions, protected dmmf: DMMF.Document) {
        super(model, options, dmmf);

        this.omitInputDetails = this.getOption<boolean>('omitInputDetails', false);
        if (this.omitInputDetails !== undefined && typeof this.omitInputDetails !== 'boolean') {
            throw new PluginError(name, `Invalid option value for "omitInputDetails", boolean expected`);
        }
    }

    generate() {
        let output = requireOption<string>(this.options, 'output', name);
        output = resolvePath(output, this.options);

        // input types
        this.inputObjectTypes.push(...(this.dmmf.schema.inputObjectTypes.prisma ?? []));
        this.outputObjectTypes.push(...this.dmmf.schema.outputObjectTypes.prisma);

        // add input object types that are missing from Prisma dmmf
        addMissingInputObjectTypesForModelArgs(this.inputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForInclude(this.inputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForSelect(this.inputObjectTypes, this.outputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForAggregate(this.inputObjectTypes, this.outputObjectTypes);

        this.aggregateOperationSupport = resolveAggregateOperationSupport(this.inputObjectTypes);

        const components = this.generateComponents();
        const paths = this.generatePaths(components);

        // generate security schemes, and root-level security
        components.securitySchemes = this.generateSecuritySchemes();
        let security: OAPI.Document['security'] | undefined = undefined;
        if (components.securitySchemes && Object.keys(components.securitySchemes).length > 0) {
            security = Object.keys(components.securitySchemes).map((scheme) => ({ [scheme]: [] }));
        }

        // prune unused component schemas
        this.pruneComponents(paths, components);

        const openapi: OAPI.Document = {
            openapi: this.getOption('specVersion', this.DEFAULT_SPEC_VERSION),
            info: {
                title: this.getOption('title', 'ZenStack Generated API'),
                version: this.getOption('version', '1.0.0'),
                description: this.getOption('description'),
                summary: this.getOption('summary'),
            },
            tags: this.includedModels.map((model) => {
                const meta = getModelResourceMeta(model);
                return {
                    name: lowerCaseFirst(model.name),
                    description: meta?.tagDescription ?? `${model.name} operations`,
                };
            }),
            components,
            paths,
            security,
        };

        // ensure output folder exists
        fs.mkdirSync(path.dirname(output), { recursive: true });

        const ext = path.extname(output);
        if (ext && (ext.toLowerCase() === '.yaml' || ext.toLowerCase() === '.yml')) {
            fs.writeFileSync(output, YAML.stringify(openapi));
        } else {
            fs.writeFileSync(output, JSON.stringify(openapi, undefined, 2));
        }

        return { warnings: this.warnings };
    }

    private generatePaths(components: OAPI.ComponentsObject): OAPI.PathsObject {
        let result: OAPI.PathsObject = {};

        for (const model of this.dmmf.datamodel.models) {
            const zmodel = this.model.declarations.find((d) => isDataModel(d) && d.name === model.name) as DataModel;
            if (zmodel) {
                result = {
                    ...result,
                    ...this.generatePathsForModel(model, zmodel, components),
                } as OAPI.PathsObject;
            } else {
                this.warnings.push(`Unable to load ZModel definition for: ${model.name}}`);
            }
        }
        return result;
    }

    private generatePathsForModel(
        model: DMMF.Model,
        zmodel: DataModel,
        components: OAPI.ComponentsObject
    ): OAPI.PathItemObject | undefined {
        const result: OAPI.PathItemObject & Record<string, unknown> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ops: (DMMF.ModelMapping & { createOne?: string | null } & Record<string, any>) | undefined =
            this.dmmf.mappings.modelOperations.find((ops) => ops.model === model.name);
        if (!ops) {
            this.warnings.push(`Unable to find mapping for model ${model.name}`);
            return undefined;
        }

        const modelName = upperCaseFirst(model.name);

        type OperationDefinition = {
            method: 'get' | 'post' | 'put' | 'patch' | 'delete';
            operation: string;
            description: string;
            inputType?: object;
            outputType: object;
            successCode?: number;
            security?: Array<Record<string, string[]>>;
        };

        const definitions: OperationDefinition[] = [];
        const hasRelation = zmodel.fields.some((f) => isDataModel(f.type.reference?.ref));

        // analyze access policies to determine default security
        const { create, read, update, delete: del } = analyzePolicies(zmodel);

        // OrderByWithRelationInput's name is different when "fullTextSearch" is enabled
        const orderByWithRelationInput = this.inputObjectTypes
            .map((o) => upperCaseFirst(o.name))
            .includes(`${modelName}OrderByWithRelationInput`)
            ? `${modelName}OrderByWithRelationInput`
            : `${modelName}OrderByWithRelationAndSearchRelevanceInput`;

        if (ops['createOne']) {
            definitions.push({
                method: 'post',
                operation: 'create',
                inputType: this.component(
                    `${modelName}CreateArgs`,
                    {
                        type: 'object',
                        required: ['data'],
                        properties: {
                            select: this.omittableRef(`${modelName}Select`),
                            include: hasRelation ? this.omittableRef(`${modelName}Include`) : undefined,
                            data: this.omittableRef(`${modelName}CreateInput`),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref(modelName)),
                description: `Create a new ${modelName}`,
                successCode: 201,
                security: create === true ? [] : undefined,
            });
        }

        if (ops['createMany'] && supportCreateMany(zmodel.$container)) {
            definitions.push({
                method: 'post',
                operation: 'createMany',
                inputType: this.component(
                    `${modelName}CreateManyArgs`,
                    {
                        type: 'object',
                        required: ['data'],
                        properties: {
                            data: this.oneOf(
                                this.omittableRef(`${modelName}CreateManyInput`),
                                this.array(this.omittableRef(`${modelName}CreateManyInput`))
                            ),
                            skipDuplicates: {
                                type: 'boolean',
                                description:
                                    'Do not insert records with unique fields or ID fields that already exist.',
                            },
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref('BatchPayload')),
                description: `Create several ${modelName}`,
                successCode: 201,
                security: create === true ? [] : undefined,
            });
        }

        if (ops['findUnique']) {
            definitions.push({
                method: 'get',
                operation: 'findUnique',
                inputType: this.component(
                    `${modelName}FindUniqueArgs`,
                    {
                        type: 'object',
                        required: ['where'],
                        properties: {
                            select: this.omittableRef(`${modelName}Select`),
                            include: hasRelation ? this.omittableRef(`${modelName}Include`) : undefined,
                            where: this.omittableRef(`${modelName}WhereUniqueInput`),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref(modelName)),
                description: `Find one unique ${modelName}`,
                security: read === true ? [] : undefined,
            });
        }

        if (ops['findFirst']) {
            definitions.push({
                method: 'get',
                operation: 'findFirst',
                inputType: this.component(
                    `${modelName}FindFirstArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.omittableRef(`${modelName}Select`),
                            include: hasRelation ? this.omittableRef(`${modelName}Include`) : undefined,
                            where: this.omittableRef(`${modelName}WhereInput`),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref(modelName)),
                description: `Find the first ${modelName} matching the given condition`,
                security: read === true ? [] : undefined,
            });
        }

        if (ops['findMany']) {
            definitions.push({
                method: 'get',
                operation: 'findMany',
                inputType: this.component(
                    `${modelName}FindManyArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.omittableRef(`${modelName}Select`),
                            include: hasRelation ? this.omittableRef(`${modelName}Include`) : undefined,
                            where: this.omittableRef(`${modelName}WhereInput`),
                            orderBy: this.oneOf(
                                this.omittableRef(orderByWithRelationInput),
                                this.array(this.omittableRef(orderByWithRelationInput))
                            ),
                            cursor: this.omittableRef(`${modelName}WhereUniqueInput`),
                            take: { type: 'integer' },
                            skip: { type: 'integer' },
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.array(this.ref(modelName))),
                description: `Find a list of ${modelName}`,
                security: read === true ? [] : undefined,
            });
        }

        if (ops['updateOne']) {
            definitions.push({
                method: 'patch',
                operation: 'update',
                inputType: this.component(
                    `${modelName}UpdateArgs`,
                    {
                        type: 'object',
                        required: ['where', 'data'],
                        properties: {
                            select: this.omittableRef(`${modelName}Select`),
                            include: hasRelation ? this.omittableRef(`${modelName}Include`) : undefined,
                            where: this.omittableRef(`${modelName}WhereUniqueInput`),
                            data: this.omittableRef(`${modelName}UpdateInput`),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref(modelName)),
                description: `Update a ${modelName}`,
                security: update === true ? [] : undefined,
            });
        }

        if (ops['updateMany']) {
            definitions.push({
                operation: 'updateMany',
                method: 'patch',
                inputType: this.component(
                    `${modelName}UpdateManyArgs`,
                    {
                        type: 'object',
                        required: ['data'],
                        properties: {
                            where: this.omittableRef(`${modelName}WhereInput`),
                            data: this.omittableRef(`${modelName}UpdateManyMutationInput`),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref('BatchPayload')),
                description: `Update ${modelName}s matching the given condition`,
                security: update === true ? [] : undefined,
            });
        }

        if (ops['upsertOne']) {
            definitions.push({
                method: 'post',
                operation: 'upsert',
                inputType: this.component(
                    `${modelName}UpsertArgs`,
                    {
                        type: 'object',
                        required: ['create', 'update', 'where'],
                        properties: {
                            select: this.omittableRef(`${modelName}Select`),
                            include: hasRelation ? this.omittableRef(`${modelName}Include`) : undefined,
                            where: this.omittableRef(`${modelName}WhereUniqueInput`),
                            create: this.omittableRef(`${modelName}CreateInput`),
                            update: this.omittableRef(`${modelName}UpdateInput`),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref(modelName)),
                description: `Upsert a ${modelName}`,
                security: create === true && update == true ? [] : undefined,
            });
        }

        if (ops['deleteOne']) {
            definitions.push({
                method: 'delete',
                operation: 'delete',
                inputType: this.component(
                    `${modelName}DeleteUniqueArgs`,
                    {
                        type: 'object',
                        required: ['where'],
                        properties: {
                            select: this.omittableRef(`${modelName}Select`),
                            include: hasRelation ? this.omittableRef(`${modelName}Include`) : undefined,
                            where: this.omittableRef(`${modelName}WhereUniqueInput`),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref(modelName)),
                description: `Delete one unique ${modelName}`,
                security: del === true ? [] : undefined,
            });
        }

        if (ops['deleteMany']) {
            definitions.push({
                method: 'delete',
                operation: 'deleteMany',
                inputType: this.component(
                    `${modelName}DeleteManyArgs`,
                    {
                        type: 'object',
                        properties: {
                            where: this.omittableRef(`${modelName}WhereInput`),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref('BatchPayload')),
                description: `Delete ${modelName}s matching the given condition`,
                security: del === true ? [] : undefined,
            });
        }

        // somehow dmmf doesn't contain "count" operation, so we unconditionally add it here
        definitions.push({
            method: 'get',
            operation: 'count',
            inputType: this.component(
                `${modelName}CountArgs`,
                {
                    type: 'object',
                    properties: {
                        select: this.omittableRef(`${modelName}Select`),
                        where: this.omittableRef(`${modelName}WhereInput`),
                        meta: this.ref('_Meta'),
                    },
                },
                components
            ),
            outputType: this.response(
                this.oneOf({ type: 'integer' }, this.ref(`${modelName}CountAggregateOutputType`))
            ),
            description: `Find a list of ${modelName}`,
            security: read === true ? [] : undefined,
        });

        if (ops['aggregate']) {
            definitions.push({
                method: 'get',
                operation: 'aggregate',
                inputType: this.component(
                    `${modelName}AggregateArgs`,
                    {
                        type: 'object',
                        properties: {
                            where: this.omittableRef(`${modelName}WhereInput`),
                            orderBy: this.omittableRef(orderByWithRelationInput),
                            cursor: this.omittableRef(`${modelName}WhereUniqueInput`),
                            take: { type: 'integer' },
                            skip: { type: 'integer' },
                            ...this.aggregateFields(model),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.ref(`Aggregate${modelName}`)),
                description: `Aggregate ${modelName}s`,
                security: read === true ? [] : undefined,
            });
        }

        if (ops['groupBy']) {
            definitions.push({
                method: 'get',
                operation: 'groupBy',
                inputType: this.component(
                    `${modelName}GroupByArgs`,
                    {
                        type: 'object',
                        properties: {
                            where: this.omittableRef(`${modelName}WhereInput`),
                            orderBy: this.omittableRef(orderByWithRelationInput),
                            by: this.omittableRef(`${modelName}ScalarFieldEnum`),
                            having: this.omittableRef(`${modelName}ScalarWhereWithAggregatesInput`),
                            take: { type: 'integer' },
                            skip: { type: 'integer' },
                            ...this.aggregateFields(model),
                            meta: this.ref('_Meta'),
                        },
                    },
                    components
                ),
                outputType: this.response(this.array(this.ref(`${modelName}GroupByOutputType`))),
                description: `Group ${modelName}s by fields`,
                security: read === true ? [] : undefined,
            });
        }

        // get meta specified with @@openapi.meta
        const resourceMeta = getModelResourceMeta(zmodel);

        for (const { method, operation, description, inputType, outputType, successCode, security } of definitions) {
            const meta = resourceMeta?.[operation];

            if (meta?.ignore === true) {
                continue;
            }

            const resolvedMethod = meta?.method ?? method;
            let resolvedPath = meta?.path ?? operation;
            if (resolvedPath.startsWith('/')) {
                resolvedPath = resolvedPath.substring(1);
            }

            let prefix = this.getOption('prefix', '');
            if (prefix.endsWith('/')) {
                prefix = prefix.substring(0, prefix.length - 1);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const def: OAPI.OperationObject = {
                operationId: `${operation}${modelName}`,
                description: meta?.description ?? description,
                tags: meta?.tags || [lowerCaseFirst(model.name)],
                summary: meta?.summary,
                // security priority: operation-level > model-level > inferred
                security: meta?.security ?? resourceMeta?.security ?? security,
                deprecated: meta?.deprecated,
                responses: {
                    [successCode !== undefined ? successCode : '200']: {
                        description: 'Successful operation',
                        content: {
                            'application/json': {
                                schema: outputType,
                            },
                        },
                    },
                    '400': {
                        content: {
                            'application/json': {
                                schema: this.ref('_Error'),
                            },
                        },
                        description: 'Invalid request',
                    },
                    '403': {
                        content: {
                            'application/json': {
                                schema: this.ref('_Error'),
                            },
                        },
                        description: 'Request is forbidden',
                    },
                    '422': {
                        content: {
                            'application/json': {
                                schema: this.ref('_Error'),
                            },
                        },
                        description: 'Request is unprocessable due to validation errors',
                    },
                },
            };

            if (inputType) {
                if (['post', 'put', 'patch'].includes(resolvedMethod)) {
                    def.requestBody = {
                        content: {
                            'application/json': {
                                schema: inputType,
                            },
                        },
                    };
                } else {
                    def.parameters = [
                        {
                            name: 'q',
                            in: 'query',
                            required: true,
                            description: 'Superjson-serialized Prisma query object',
                            content: {
                                'application/json': {
                                    schema: inputType,
                                },
                            },
                        },
                        {
                            name: 'meta',
                            in: 'query',
                            description: 'Superjson serialization metadata for parameter "q"',
                            content: {
                                'application/json': {
                                    schema: {},
                                },
                            },
                        },
                    ] satisfies OAPI.ParameterObject[];
                }
            }

            const includeModelNames = this.includedModels.map((d) => d.name);
            if (includeModelNames.includes(model.name)) {
                result[`${prefix}/${lowerCaseFirst(model.name)}/${resolvedPath}`] = {
                    [resolvedMethod]: def,
                };
            }
        }
        return result;
    }

    private aggregateFields(model: DMMF.Model) {
        const result: Record<string, unknown> = {};
        const supportedOps = this.aggregateOperationSupport[model.name];
        const modelName = upperCaseFirst(model.name);
        if (supportedOps) {
            if (supportedOps.count) {
                result._count = this.oneOf({ type: 'boolean' }, this.omittableRef(`${modelName}CountAggregateInput`));
            }
            if (supportedOps.min) {
                result._min = this.omittableRef(`${modelName}MinAggregateInput`);
            }
            if (supportedOps.max) {
                result._max = this.omittableRef(`${modelName}MaxAggregateInput`);
            }
            if (supportedOps.sum) {
                result._sum = this.omittableRef(`${modelName}SumAggregateInput`);
            }
            if (supportedOps.avg) {
                result._avg = this.omittableRef(`${modelName}AvgAggregateInput`);
            }
        }
        return result;
    }

    private component(name: string, def: object, components: OAPI.ComponentsObject): object {
        invariant(components.schemas);
        components.schemas[name] = def;
        return this.ref(name);
    }

    private generateComponents() {
        const schemas: Record<string, OAPI.SchemaObject> = {};
        const components: OAPI.ComponentsObject = {
            schemas,
        };

        if (this.omitInputDetails) {
            // generate a catch-all object type
            schemas[ANY_OBJECT] = {
                type: 'object',
                additionalProperties: true,
            };
        }

        // user-defined and built-in enums
        for (const _enum of [...(this.dmmf.schema.enumTypes.model ?? []), ...this.dmmf.schema.enumTypes.prisma]) {
            schemas[upperCaseFirst(_enum.name)] = this.generateEnumComponent(_enum);
        }

        // Also add enums from AST that might not be in DMMF (e.g., only used in TypeDefs)
        for (const enumDecl of this.model.declarations.filter(isEnum)) {
            if (!schemas[upperCaseFirst(enumDecl.name)]) {
                schemas[upperCaseFirst(enumDecl.name)] = {
                    type: 'string',
                    enum: enumDecl.fields.map((f) => f.name),
                };
            }
        }

        // data models
        for (const model of this.dmmf.datamodel.models) {
            schemas[upperCaseFirst(model.name)] = this.generateEntityComponent(model);
        }

        // type defs
        for (const typeDef of this.model.declarations.filter(isTypeDef)) {
            schemas[upperCaseFirst(typeDef.name)] = this.generateTypeDefComponent(typeDef);
        }

        for (const input of this.inputObjectTypes) {
            schemas[upperCaseFirst(input.name)] = this.generateInputComponent(input);
        }

        for (const output of this.outputObjectTypes.filter((t) => !['Query', 'Mutation'].includes(t.name))) {
            schemas[upperCaseFirst(output.name)] = this.generateOutputComponent(output);
        }

        schemas['_Meta'] = {
            type: 'object',
            description: 'Meta information about the request or response',
            properties: {
                serialization: {
                    description: 'Serialization metadata',
                },
            },
            additionalProperties: true,
        };

        schemas['_Error'] = {
            type: 'object',
            required: ['error'],
            properties: {
                error: {
                    type: 'object',
                    required: ['message'],
                    properties: {
                        prisma: {
                            type: 'boolean',
                            description: 'Indicates if the error occurred during a Prisma call',
                        },
                        rejectedByPolicy: {
                            type: 'boolean',
                            description: 'Indicates if the error was due to rejection by a policy',
                        },
                        code: {
                            type: 'string',
                            description: 'Prisma error code. Only available when "prisma" field is true.',
                        },
                        message: {
                            type: 'string',
                            description: 'Error message',
                        },
                        reason: {
                            type: 'string',
                            description: 'Detailed error reason',
                        },
                        zodErrors: {
                            type: 'object',
                            additionalProperties: true,
                            description: 'Zod validation errors if the error is due to data validation failure',
                        },
                    },
                    additionalProperties: true,
                },
            },
        };

        // misc types
        schemas['BatchPayload'] = {
            type: 'object',
            properties: {
                count: { type: 'integer' },
            },
        };

        return components;
    }

    private generateEnumComponent(_enum: DMMF.SchemaEnum): OAPI.SchemaObject {
        const schema: OAPI.SchemaObject = {
            type: 'string',
            enum: _enum.values as string[],
        };
        return schema;
    }

    private generateEntityComponent(model: DMMF.Model): OAPI.SchemaObject {
        const properties: Record<string, OAPI.ReferenceObject | OAPI.SchemaObject> = {};

        const required: string[] = [];
        for (const field of model.fields) {
            properties[field.name] = this.generateField(field, model.name);
            if (field.isRequired && !(field.relationName && field.isList)) {
                required.push(field.name);
            }
        }

        const result: OAPI.SchemaObject = { type: 'object', properties };
        if (required.length > 0) {
            result.required = required;
        }
        return result;
    }

    private generateField(
        def: { kind: DMMF.FieldKind; type: string; isList: boolean; isRequired: boolean; name?: string },
        modelName?: string
    ) {
        // For Json fields, check if there's a corresponding TypeDef in the original model
        if (def.kind === 'scalar' && def.type === 'Json' && modelName && def.name) {
            const dataModel = this.model.declarations.find((d) => isDataModel(d) && d.name === modelName) as DataModel;
            if (dataModel) {
                const field = dataModel.fields.find((f) => f.name === def.name);
                if (field?.type.reference?.ref && isTypeDef(field.type.reference.ref)) {
                    // This Json field references a TypeDef
                    // Use field.type.array from ZModel AST instead of def.isList from DMMF,
                    // since Prisma treats TypeDef fields as plain Json and doesn't know about arrays
                    return this.wrapArray(
                        this.wrapNullable(this.ref(field.type.reference.ref.name, true), !def.isRequired),
                        field.type.array
                    );
                }
            }
        }

        switch (def.kind) {
            case 'scalar':
                return this.wrapArray(this.prismaTypeToOpenAPIType(def.type, !def.isRequired), def.isList);

            case 'enum':
            case 'object':
                return this.wrapArray(this.wrapNullable(this.ref(def.type, false), !def.isRequired), def.isList);

            default:
                throw new PluginError(name, `Unsupported field kind: ${def.kind}`);
        }
    }

    private generateInputComponent(input: DMMF.InputType): OAPI.SchemaObject {
        const properties: Record<string, OAPI.ReferenceObject | OAPI.SchemaObject> = {};
        for (const field of input.fields) {
            const options = field.inputTypes
                .filter(
                    (f) =>
                        f.type !== 'Null' &&
                        // fieldRefTypes refer to other fields in the model and don't need to be generated as part of schema
                        f.location !== 'fieldRefTypes'
                )
                .map((f) => {
                    return this.wrapArray(this.prismaTypeToOpenAPIType(f.type, false), f.isList);
                });

            let prop = options.length > 1 ? { oneOf: options } : options[0];

            // if types include 'Null', make it nullable
            prop = this.wrapNullable(
                prop,
                field.inputTypes.some((f) => f.type === 'Null')
            );

            properties[field.name] = prop;
        }

        const result: OAPI.SchemaObject = { type: 'object', properties };
        this.setInputRequired(input.fields, result);
        return result;
    }

    private generateOutputComponent(output: DMMF.OutputType): OAPI.SchemaObject {
        const properties: Record<string, OAPI.ReferenceObject | OAPI.SchemaObject> = {};
        for (const field of output.fields) {
            let outputType: OAPI.ReferenceObject | OAPI.SchemaObject;
            switch (field.outputType.location) {
                case 'scalar':
                case 'enumTypes':
                    outputType = this.prismaTypeToOpenAPIType(field.outputType.type, !!field.isNullable);
                    break;
                case 'outputObjectTypes':
                    outputType = this.prismaTypeToOpenAPIType(field.outputType.type, !!field.isNullable);
                    break;
            }
            field.outputType;
            properties[field.name] = this.wrapArray(outputType, field.outputType.isList);
        }

        const result: OAPI.SchemaObject = { type: 'object', properties };
        this.setOutputRequired(output.fields, result);
        return result;
    }

    private generateTypeDefComponent(typeDef: TypeDef): OAPI.SchemaObject {
        const schema: OAPI.SchemaObject = {
            type: 'object',
            description: `The "${typeDef.name}" TypeDef`,
            properties: typeDef.fields.reduce((acc, field) => {
                acc[field.name] = this.generateTypeDefField(field);
                return acc;
            }, {} as Record<string, OAPI.ReferenceObject | OAPI.SchemaObject>),
        };

        const required = typeDef.fields.filter((f) => !f.type.optional).map((f) => f.name);
        if (required.length > 0) {
            schema.required = required;
        }

        return schema;
    }

    private generateTypeDefField(field: TypeDefField): OAPI.ReferenceObject | OAPI.SchemaObject {
        return this.wrapArray(
            this.wrapNullable(this.typeDefFieldTypeToOpenAPISchema(field.type), field.type.optional),
            field.type.array
        );
    }

    private typeDefFieldTypeToOpenAPISchema(type: TypeDefFieldType): OAPI.ReferenceObject | OAPI.SchemaObject {
        // For references to other types (TypeDef, Enum, Model)
        if (type.reference?.ref) {
            return this.ref(type.reference.ref.name, true);
        }

        // For scalar types, reuse the existing mapping logic
        // Note: Json type is handled as empty schema for consistency
        return match(type.type)
            .with('Json', () => ({} as OAPI.SchemaObject))
            .otherwise((t) => {
                // Delegate to prismaTypeToOpenAPIType for all other scalar types
                return this.prismaTypeToOpenAPIType(String(t), false);
            });
    }

    private setInputRequired(fields: readonly DMMF.SchemaArg[], result: OAPI.NonArraySchemaObject) {
        const required = fields.filter((f) => f.isRequired).map((f) => f.name);
        if (required.length > 0) {
            result.required = required;
        }
    }

    private setOutputRequired(fields: readonly DMMF.SchemaField[], result: OAPI.NonArraySchemaObject) {
        const required = fields.filter((f) => f.isNullable !== true).map((f) => f.name);
        if (required.length > 0) {
            result.required = required;
        }
    }

    private prismaTypeToOpenAPIType(type: string, nullable: boolean): OAPI.ReferenceObject | OAPI.SchemaObject {
        const result = match(type)
            .with('String', () => ({ type: 'string' }))
            .with(P.union('Int', 'BigInt'), () => ({ type: 'integer' }))
            .with('Float', () => ({ type: 'number' }))
            .with('Decimal', () => this.oneOf({ type: 'string' }, { type: 'number' }))
            .with(P.union('Boolean', 'True'), () => ({ type: 'boolean' }))
            .with('DateTime', () => ({ type: 'string', format: 'date-time' }))
            .with('Bytes', () => ({ type: 'string', format: 'byte' }))
            .with(P.union('JSON', 'Json'), () => {
                // For Json fields, check if there's a specific TypeDef reference
                // Otherwise, return empty schema for arbitrary JSON
                const isTypeDefType = this.model.declarations.some((d) => isTypeDef(d) && d.name === type);
                return isTypeDefType ? this.ref(type, false) : {};
            })
            .otherwise((type) => this.ref(type.toString(), false));

        return this.wrapNullable(result, nullable);
    }

    private ref(type: string, rooted = true, description?: string): OAPI.ReferenceObject {
        if (rooted) {
            this.usedComponents.add(type);
        }
        return { $ref: `#/components/schemas/${upperCaseFirst(type)}`, description };
    }

    private omittableRef(type: string, rooted = true, description?: string): OAPI.ReferenceObject {
        if (this.omitInputDetails) {
            return this.ref(ANY_OBJECT);
        } else {
            return this.ref(type, rooted, description);
        }
    }

    private response(schema: OAPI.SchemaObject): OAPI.SchemaObject {
        return {
            type: 'object',
            required: ['data'],
            properties: {
                data: { ...schema, description: 'The Prisma response data serialized with superjson' },
                meta: this.ref('_Meta', true, 'The superjson serialization metadata for the "data" field'),
            },
        };
    }
}
