// Inspired by: https://github.com/omar-dulaimi/prisma-trpc-generator

import { DMMF } from '@prisma/generator-helper';
import {
    analyzePolicies,
    AUXILIARY_FIELDS,
    getDataModels,
    hasAttribute,
    PluginError,
    PluginOptions,
} from '@zenstackhq/sdk';
import { DataModel, isDataModel, type Model } from '@zenstackhq/sdk/ast';
import {
    addMissingInputObjectTypesForAggregate,
    addMissingInputObjectTypesForInclude,
    addMissingInputObjectTypesForModelArgs,
    addMissingInputObjectTypesForSelect,
    AggregateOperationSupport,
    resolveAggregateOperationSupport,
} from '@zenstackhq/sdk/dmmf-helpers';
import { camelCase } from 'change-case';
import * as fs from 'fs';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';
import * as path from 'path';
import invariant from 'tiny-invariant';
import YAML from 'yaml';
import { fromZodError } from 'zod-validation-error';
import { getModelResourceMeta } from './meta';
import { SecuritySchemesSchema } from './schema';

/**
 * Generates OpenAPI specification.
 */
export class OpenAPIGenerator {
    private inputObjectTypes: DMMF.InputType[] = [];
    private outputObjectTypes: DMMF.OutputType[] = [];
    private usedComponents: Set<string> = new Set<string>();
    private aggregateOperationSupport: AggregateOperationSupport;
    private includedModels: DataModel[];
    private warnings: string[] = [];

    constructor(private model: Model, private options: PluginOptions, private dmmf: DMMF.Document) {}

    generate() {
        const output = this.getOption('output', '');
        if (!output) {
            throw new PluginError('"output" option is required');
        }

        // input types
        this.inputObjectTypes.push(...this.dmmf.schema.inputObjectTypes.prisma);
        this.outputObjectTypes.push(...this.dmmf.schema.outputObjectTypes.prisma);
        this.includedModels = getDataModels(this.model).filter((d) => !hasAttribute(d, '@@openapi.ignore'));

        // add input object types that are missing from Prisma dmmf
        addMissingInputObjectTypesForModelArgs(this.inputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForInclude(this.inputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForSelect(this.inputObjectTypes, this.outputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForAggregate(this.inputObjectTypes, this.outputObjectTypes);

        this.aggregateOperationSupport = resolveAggregateOperationSupport(this.inputObjectTypes);

        const components = this.generateComponents();
        const paths = this.generatePaths(components);

        // generate security schemes, and root-level security
        this.generateSecuritySchemes(components);
        let security: OAPI.Document['security'] | undefined = undefined;
        if (components.securitySchemes && Object.keys(components.securitySchemes).length > 0) {
            security = Object.keys(components.securitySchemes).map((scheme) => ({ [scheme]: [] }));
        }

        // prune unused component schemas
        this.pruneComponents(components);

        const openapi: OAPI.Document = {
            openapi: this.getOption('specVersion', '3.1.0'),
            info: {
                title: this.getOption('title', 'ZenStack Generated API'),
                version: this.getOption('version', '1.0.0'),
                description: this.getOption('description'),
                summary: this.getOption('summary'),
            },
            tags: this.includedModels.map((model) => {
                const meta = getModelResourceMeta(model);
                return {
                    name: camelCase(model.name),
                    description: meta?.tagDescription ?? `${model.name} operations`,
                };
            }),
            components,
            paths,
            security,
        };

        const ext = path.extname(output);
        if (ext && (ext.toLowerCase() === '.yaml' || ext.toLowerCase() === '.yml')) {
            fs.writeFileSync(output, YAML.stringify(openapi));
        } else {
            fs.writeFileSync(output, JSON.stringify(openapi, undefined, 2));
        }

        return this.warnings;
    }

    private generateSecuritySchemes(components: OAPI.ComponentsObject) {
        const securitySchemes = this.getOption<Record<string, string>[]>('securitySchemes');
        if (securitySchemes) {
            const parsed = SecuritySchemesSchema.safeParse(securitySchemes);
            if (!parsed.success) {
                throw new PluginError(`"securitySchemes" option is invalid: ${fromZodError(parsed.error)}`);
            }
            components.securitySchemes = parsed.data;
        }
    }

    private pruneComponents(components: OAPI.ComponentsObject) {
        const schemas = components.schemas;
        if (schemas) {
            // build a transitive closure for all reachable schemas from roots
            const allUsed = new Set<string>(this.usedComponents);

            let todo = [...allUsed];
            while (todo.length > 0) {
                const curr = new Set<string>(allUsed);
                Object.entries(schemas)
                    .filter(([key]) => todo.includes(key))
                    .forEach(([, value]) => {
                        this.collectUsedComponents(value, allUsed);
                    });
                todo = [...allUsed].filter((e) => !curr.has(e));
            }

            // prune unused schemas
            Object.keys(schemas).forEach((key) => {
                if (!allUsed.has(key)) {
                    delete schemas[key];
                }
            });
        }
    }

    private collectUsedComponents(value: unknown, allUsed: Set<string>) {
        if (!value) {
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => {
                this.collectUsedComponents(item, allUsed);
            });
        } else if (typeof value === 'object') {
            Object.entries(value).forEach(([subKey, subValue]) => {
                if (subKey === '$ref') {
                    const ref = subValue as string;
                    const name = ref.split('/').pop();
                    if (name && !allUsed.has(name)) {
                        allUsed.add(name);
                    }
                } else {
                    this.collectUsedComponents(subValue, allUsed);
                }
            });
        }
    }

    private generatePaths(components: OAPI.ComponentsObject): OAPI.PathsObject {
        let result: OAPI.PathsObject = {};

        const includeModelNames = this.includedModels.map((d) => d.name);

        for (const model of this.dmmf.datamodel.models) {
            if (includeModelNames.includes(model.name)) {
                const zmodel = this.model.declarations.find(
                    (d) => isDataModel(d) && d.name === model.name
                ) as DataModel;
                if (zmodel) {
                    result = {
                        ...result,
                        ...this.generatePathsForModel(model, zmodel, components),
                    } as OAPI.PathsObject;
                } else {
                    this.warnings.push(`Unable to load ZModel definition for: ${model.name}}`);
                }
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

        if (ops['createOne']) {
            definitions.push({
                method: 'post',
                operation: 'create',
                inputType: this.component(
                    `${model.name}CreateArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: hasRelation ? this.ref(`${model.name}Include`) : undefined,
                            data: this.ref(`${model.name}CreateInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref(model.name),
                description: `Create a new ${model.name}`,
                successCode: 201,
                security: create === true ? [] : undefined,
            });
        }

        if (ops['createMany']) {
            definitions.push({
                method: 'post',
                operation: 'createMany',
                inputType: this.component(
                    `${model.name}CreateManyArgs`,
                    {
                        type: 'object',
                        properties: {
                            data: this.ref(`${model.name}CreateManyInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref('BatchPayload'),
                description: `Create several ${model.name}`,
                successCode: 201,
                security: create === true ? [] : undefined,
            });
        }

        if (ops['findUnique']) {
            definitions.push({
                method: 'get',
                operation: 'findUnique',
                inputType: this.component(
                    `${model.name}FindUniqueArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: hasRelation ? this.ref(`${model.name}Include`) : undefined,
                            where: this.ref(`${model.name}WhereUniqueInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref(model.name),
                description: `Find one unique ${model.name}`,
                security: read === true ? [] : undefined,
            });
        }

        if (ops['findFirst']) {
            definitions.push({
                method: 'get',
                operation: 'findFirst',
                inputType: this.component(
                    `${model.name}FindFirstArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: hasRelation ? this.ref(`${model.name}Include`) : undefined,
                            where: this.ref(`${model.name}WhereInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref(model.name),
                description: `Find the first ${model.name} matching the given condition`,
                security: read === true ? [] : undefined,
            });
        }

        if (ops['findMany']) {
            definitions.push({
                method: 'get',
                operation: 'findMany',
                inputType: this.component(
                    `${model.name}FindManyArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: hasRelation ? this.ref(`${model.name}Include`) : undefined,
                            where: this.ref(`${model.name}WhereInput`),
                        },
                    },
                    components
                ),
                outputType: this.array(this.ref(model.name)),
                description: `Find a list of ${model.name}`,
                security: read === true ? [] : undefined,
            });
        }

        if (ops['updateOne']) {
            definitions.push({
                method: 'patch',
                operation: 'update',
                inputType: this.component(
                    `${model.name}UpdateArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: hasRelation ? this.ref(`${model.name}Include`) : undefined,
                            where: this.ref(`${model.name}WhereUniqueInput`),
                            data: this.ref(`${model.name}UpdateInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref(model.name),
                description: `Update a ${model.name}`,
                security: update === true ? [] : undefined,
            });
        }

        if (ops['updateMany']) {
            definitions.push({
                operation: 'updateMany',
                method: 'patch',
                inputType: this.component(
                    `${model.name}UpdateManyArgs`,
                    {
                        type: 'object',
                        properties: {
                            where: this.ref(`${model.name}WhereInput`),
                            data: this.ref(`${model.name}UpdateManyMutationInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref('BatchPayload'),
                description: `Update ${model.name}s matching the given condition`,
                security: update === true ? [] : undefined,
            });
        }

        if (ops['upsertOne']) {
            definitions.push({
                method: 'post',
                operation: 'upsert',
                inputType: this.component(
                    `${model.name}UpsertArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: hasRelation ? this.ref(`${model.name}Include`) : undefined,
                            where: this.ref(`${model.name}WhereUniqueInput`),
                            create: this.ref(`${model.name}CreateInput`),
                            update: this.ref(`${model.name}UpdateInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref(model.name),
                description: `Upsert a ${model.name}`,
                security: create === true && update == true ? [] : undefined,
            });
        }

        if (ops['deleteOne']) {
            definitions.push({
                method: 'delete',
                operation: 'delete',
                inputType: this.component(
                    `${model.name}DeleteUniqueArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: hasRelation ? this.ref(`${model.name}Include`) : undefined,
                            where: this.ref(`${model.name}WhereUniqueInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref(model.name),
                description: `Delete one unique ${model.name}`,
                security: del === true ? [] : undefined,
            });
        }

        if (ops['deleteMany']) {
            definitions.push({
                method: 'delete',
                operation: 'deleteMany',
                inputType: this.component(
                    `${model.name}DeleteManyArgs`,
                    {
                        type: 'object',
                        properties: {
                            where: this.ref(`${model.name}WhereInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref('BatchPayload'),
                description: `Delete ${model.name}s matching the given condition`,
                security: del === true ? [] : undefined,
            });
        }

        // somehow dmmf doesn't contain "count" operation, so we unconditionally add it here
        definitions.push({
            method: 'get',
            operation: 'count',
            inputType: this.component(
                `${model.name}CountArgs`,
                {
                    type: 'object',
                    properties: {
                        select: this.ref(`${model.name}Select`),
                        where: this.ref(`${model.name}WhereInput`),
                    },
                },
                components
            ),
            outputType: this.oneOf({ type: 'integer' }, this.ref(`${model.name}CountAggregateOutputType`)),
            description: `Find a list of ${model.name}`,
            security: read === true ? [] : undefined,
        });

        if (ops['aggregate']) {
            definitions.push({
                method: 'get',
                operation: 'aggregate',
                inputType: this.component(
                    `${model.name}AggregateArgs`,
                    {
                        type: 'object',
                        properties: {
                            where: this.ref(`${model.name}WhereInput`),
                            orderBy: this.ref(`${model.name}OrderByWithRelationInput`),
                            cursor: this.ref(`${model.name}WhereUniqueInput`),
                            take: { type: 'integer' },
                            skip: { type: 'integer' },
                            ...this.aggregateFields(model),
                        },
                    },
                    components
                ),
                outputType: this.ref(`Aggregate${model.name}`),
                description: `Aggregate ${model.name}s`,
                security: read === true ? [] : undefined,
            });
        }

        if (ops['groupBy']) {
            definitions.push({
                method: 'get',
                operation: 'groupBy',
                inputType: this.component(
                    `${model.name}GroupByArgs`,
                    {
                        type: 'object',
                        properties: {
                            where: this.ref(`${model.name}WhereInput`),
                            orderBy: this.ref(`${model.name}OrderByWithRelationInput`),
                            by: this.ref(`${model.name}ScalarFieldEnum`),
                            having: this.ref(`${model.name}ScalarWhereWithAggregatesInput`),
                            take: { type: 'integer' },
                            skip: { type: 'integer' },
                            ...this.aggregateFields(model),
                        },
                    },
                    components
                ),
                outputType: this.array(this.ref(`${model.name}GroupByOutputType`)),
                description: `Group ${model.name}s by fields`,
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
                operationId: `${operation}${model.name}`,
                description: meta?.description ?? description,
                tags: meta?.tags || [camelCase(model.name)],
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
                        description: 'Invalid request',
                    },
                    '403': {
                        description: 'Forbidden',
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
                            content: {
                                'application/json': {
                                    schema: inputType,
                                },
                            },
                        },
                    ] satisfies OAPI.ParameterObject[];
                }
            }

            result[`${prefix}/${camelCase(model.name)}/${resolvedPath}`] = {
                [resolvedMethod]: def,
            };
        }
        return result;
    }

    private aggregateFields(model: DMMF.Model) {
        const result: Record<string, unknown> = {};
        const supportedOps = this.aggregateOperationSupport[model.name];
        if (supportedOps) {
            if (supportedOps.count) {
                result._count = this.oneOf({ type: 'boolean' }, this.ref(`${model.name}CountAggregateInput`));
            }
            if (supportedOps.min) {
                result._min = this.ref(`${model.name}MinAggregateInput`);
            }
            if (supportedOps.max) {
                result._max = this.ref(`${model.name}MaxAggregateInput`);
            }
            if (supportedOps.sum) {
                result._sum = this.ref(`${model.name}SumAggregateInput`);
            }
            if (supportedOps.avg) {
                result._avg = this.ref(`${model.name}AvgAggregateInput`);
            }
        }
        return result;
    }

    private component(name: string, def: object, components: OAPI.ComponentsObject): object {
        invariant(components.schemas);
        components.schemas[name] = def;
        return this.ref(name);
    }

    private getOption<T = string>(name: string): T | undefined;
    private getOption<T = string, D extends T = T>(name: string, defaultValue: D): T;
    private getOption<T = string>(name: string, defaultValue?: T): T | undefined {
        const value = this.options[name];
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        return value === undefined ? defaultValue : value;
    }

    private generateComponents() {
        const schemas: Record<string, OAPI.SchemaObject> = {};
        const components: OAPI.ComponentsObject = {
            schemas,
        };

        // user-defined and built-in enums
        for (const _enum of [...(this.dmmf.schema.enumTypes.model ?? []), ...this.dmmf.schema.enumTypes.prisma]) {
            schemas[_enum.name] = this.generateEnumComponent(_enum);
        }

        // data models
        for (const model of this.dmmf.datamodel.models) {
            schemas[model.name] = this.generateEntityComponent(model);
        }

        for (const input of this.inputObjectTypes) {
            schemas[input.name] = this.generateInputComponent(input);
        }

        for (const output of this.outputObjectTypes.filter((t) => !['Query', 'Mutation'].includes(t.name))) {
            schemas[output.name] = this.generateOutputComponent(output);
        }

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
            enum: _enum.values.filter((f) => !AUXILIARY_FIELDS.includes(f)),
        };
        return schema;
    }

    private generateEntityComponent(model: DMMF.Model): OAPI.SchemaObject {
        const properties: Record<string, OAPI.ReferenceObject | OAPI.SchemaObject> = {};

        const fields = model.fields.filter((f) => !AUXILIARY_FIELDS.includes(f.name));
        const required: string[] = [];
        for (const field of fields) {
            properties[field.name] = this.generateField(field);
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

    private generateField(def: { kind: DMMF.FieldKind; type: string; isList: boolean }) {
        switch (def.kind) {
            case 'scalar':
                return this.wrapArray(this.prismaTypeToOpenAPIType(def.type), def.isList);

            case 'enum':
            case 'object':
                return this.wrapArray(this.ref(def.type, false), def.isList);

            default:
                throw new PluginError(`Unsupported field kind: ${def.kind}`);
        }
    }

    private generateInputComponent(input: DMMF.InputType): OAPI.SchemaObject {
        const properties: Record<string, OAPI.ReferenceObject | OAPI.SchemaObject> = {};
        const fields = input.fields.filter((f) => !AUXILIARY_FIELDS.includes(f.name));
        for (const field of fields) {
            const options = field.inputTypes
                .filter((f) => f.type !== 'Null')
                .map((f) => {
                    return this.wrapArray(this.prismaTypeToOpenAPIType(f.type), f.isList);
                });
            properties[field.name] = options.length > 1 ? { oneOf: options } : options[0];
        }

        const result: OAPI.SchemaObject = { type: 'object', properties };
        this.setInputRequired(fields, result);
        return result;
    }

    private generateOutputComponent(output: DMMF.OutputType): OAPI.SchemaObject {
        const properties: Record<string, OAPI.ReferenceObject | OAPI.SchemaObject> = {};
        const fields = output.fields.filter((f) => !AUXILIARY_FIELDS.includes(f.name));
        for (const field of fields) {
            let outputType: OAPI.ReferenceObject | OAPI.SchemaObject;
            switch (field.outputType.location) {
                case 'scalar':
                case 'enumTypes':
                    outputType = this.prismaTypeToOpenAPIType(field.outputType.type);
                    break;
                case 'outputObjectTypes':
                    outputType = this.prismaTypeToOpenAPIType(
                        typeof field.outputType.type === 'string' ? field.outputType.type : field.outputType.type.name
                    );
                    break;
            }
            field.outputType;
            properties[field.name] = this.wrapArray(outputType, field.outputType.isList);
        }

        const result: OAPI.SchemaObject = { type: 'object', properties };
        this.setOutputRequired(fields, result);
        return result;
    }

    private setInputRequired(fields: { name: string; isRequired: boolean }[], result: OAPI.NonArraySchemaObject) {
        const required = fields.filter((f) => f.isRequired).map((f) => f.name);
        if (required.length > 0) {
            result.required = required;
        }
    }

    private setOutputRequired(
        fields: { name: string; isNullable?: boolean; outputType: DMMF.OutputTypeRef }[],
        result: OAPI.NonArraySchemaObject
    ) {
        const required = fields.filter((f) => f.isNullable !== true).map((f) => f.name);
        if (required.length > 0) {
            result.required = required;
        }
    }

    private prismaTypeToOpenAPIType(type: DMMF.ArgType): OAPI.ReferenceObject | OAPI.SchemaObject {
        switch (type) {
            case 'String':
                return { type: 'string' };
            case 'Int':
            case 'BigInt':
                return { type: 'integer' };
            case 'Float':
            case 'Decimal':
                return { type: 'number' };
            case 'Boolean':
            case 'True':
                return { type: 'boolean' };
            case 'DateTime':
                return { type: 'string', format: 'date-time' };
            case 'JSON':
            case 'Json':
                return {};
            default:
                return this.ref(type.toString(), false);
        }
    }

    private wrapArray(
        schema: OAPI.ReferenceObject | OAPI.SchemaObject,
        isArray: boolean
    ): OAPI.ReferenceObject | OAPI.SchemaObject {
        if (isArray) {
            return { type: 'array', items: schema };
        } else {
            return schema;
        }
    }

    private ref(type: string, rooted = true) {
        if (rooted) {
            this.usedComponents.add(type);
        }
        return { $ref: `#/components/schemas/${type}` };
    }

    private array(itemType: unknown) {
        return { type: 'array', items: itemType };
    }

    private oneOf(...schemas: unknown[]) {
        return { oneOf: schemas };
    }
}
