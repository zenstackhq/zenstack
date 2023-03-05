import { DMMF } from '@prisma/generator-helper';
import { AUXILIARY_FIELDS, PluginError, PluginOptions } from '@zenstackhq/sdk';
import { type Model } from '@zenstackhq/sdk/ast';
import { camelCase } from 'change-case';
import * as fs from 'fs';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';
import invariant from 'tiny-invariant';
// TODO: move these to SDK
import { addMissingInputObjectTypesForAggregate } from './utils/aggregate-helpers';
import { addMissingInputObjectTypesForInclude } from './utils/include-helpers';
import { addMissingInputObjectTypesForModelArgs } from './utils/modelArgs-helpers';
import { addMissingInputObjectTypesForSelect } from './utils/select-helpers';

export class OpenAPIGenerator {
    constructor(private model: Model, private options: PluginOptions, private dmmf: DMMF.Document) {
        console.log(this.model);
    }

    generate() {
        const output = this.getOption('output', '');
        if (!output) {
            throw new PluginError('"output" option is required');
        }

        const components = this.generateComponents();
        const paths = this.generatePaths(components);

        const openapi: OAPI.Document = {
            openapi: '3.1.0',
            info: {
                title: this.getOption('title', 'ZenStack Generated API'),
                version: this.getOption('version', '1.0.0'),
            },
            components,
            paths,
        };

        fs.writeFileSync(output, JSON.stringify(openapi, undefined, 2));
    }

    private generatePaths(components: OAPI.ComponentsObject): OAPI.PathsObject {
        let result: OAPI.PathsObject = {};
        for (const model of this.dmmf.datamodel.models) {
            result = { ...result, ...this.generatePathsForModel(model, components) } as OAPI.PathsObject;
        }
        return result;
    }

    private generatePathsForModel(model: DMMF.Model, components: OAPI.ComponentsObject): OAPI.PathItemObject {
        const result: OAPI.PathItemObject & Record<string, unknown> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ops: (DMMF.ModelMapping & { createOne?: string | null } & Record<string, any>) | undefined =
            this.dmmf.mappings.modelOperations.find((ops) => ops.model === model.name);
        if (!ops) {
            throw new PluginError(`No operations found for model ${model.name}`);
        }

        type OperationDefinition = {
            key: string;
            method: 'get' | 'post' | 'put' | 'patch' | 'delete';
            operation?: string;
            description: string;
            inputType: object;
            outputType: object;
        };

        const definitions: OperationDefinition[] = [
            {
                key: 'createOne',
                method: 'post',
                operation: 'create',
                inputType: this.component(
                    `${model.name}CreateArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: this.ref(`${model.name}Include`),
                            data: this.ref(`${model.name}CreateInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref(model.name),
                description: `Create a new ${model.name}`,
            },
            {
                key: 'createMany',
                method: 'post',
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
            },
            {
                key: 'findUnique',
                method: 'get',
                inputType: this.component(
                    `${model.name}FindUniqueArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: this.ref(`${model.name}Include`),
                            where: this.ref(`${model.name}WhereUniqueInput`),
                        },
                    },
                    components
                ),
                outputType: this.ref(model.name),
                description: `Find one unique ${model.name}`,
            },
            {
                key: 'findMany',
                method: 'get',
                inputType: this.component(
                    `${model.name}FindManyArgs`,
                    {
                        type: 'object',
                        properties: {
                            select: this.ref(`${model.name}Select`),
                            include: this.ref(`${model.name}Include`),
                            where: this.ref(`${model.name}WhereInput`),
                        },
                    },
                    components
                ),
                outputType: this.array(this.ref(model.name)),
                description: `Find a list of ${model.name}`,
            },
        ];

        for (const { key, method, operation, description, inputType, outputType } of definitions) {
            if (ops[key]) {
                const op = operation ?? key;
                result[`/${camelCase(model.name)}/${op}`] = {
                    [method]: {
                        operationId: `${op}${model.name}`,
                        requestBody: {
                            description,
                            content: {
                                'application/json': {
                                    schema: inputType,
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'Successful operation',
                                content: {
                                    'application/json': {
                                        schema: outputType,
                                    },
                                },
                            },
                        },
                    },
                };
            }
        }
        return result;
    }

    private component(name: string, def: object, components: OAPI.ComponentsObject): object {
        invariant(components.schemas);
        components.schemas[name] = def;
        return this.ref(name);
    }

    private getOption(name: string, defaultValue: string) {
        return this.options[name] ? (this.options[name] as string) : defaultValue;
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

        // input types
        const inputObjectTypes = [...this.dmmf.schema.inputObjectTypes.prisma];
        const outputObjectTypes = [...this.dmmf.schema.outputObjectTypes.prisma];

        addMissingInputObjectTypesForModelArgs(inputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForInclude(inputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForSelect(inputObjectTypes, outputObjectTypes, this.dmmf.datamodel.models);
        addMissingInputObjectTypesForAggregate(inputObjectTypes, outputObjectTypes);

        for (const input of inputObjectTypes) {
            schemas[input.name] = this.generateInputComponent(input);
        }

        for (const output of outputObjectTypes.filter((t) => !['Query', 'Mutation'].includes(t.name))) {
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
            enum: _enum.values,
        };
        return schema;
    }

    private generateEntityComponent(model: DMMF.Model): OAPI.SchemaObject {
        const properties: Record<string, OAPI.ReferenceObject | OAPI.SchemaObject> = {};

        const fields = model.fields.filter((f) => !AUXILIARY_FIELDS.includes(f.name));
        for (const field of fields) {
            properties[field.name] = this.generateField(field);
        }

        const result: OAPI.SchemaObject = { type: 'object', properties };
        this.setInputRequired(fields, result);
        return result;
    }

    private generateField(def: { kind: DMMF.FieldKind; type: string; isList: boolean }) {
        switch (def.kind) {
            case 'scalar':
                return this.wrapArray(this.prismaTypeToOpenAPIType(def.type), def.isList);

            case 'enum':
            case 'object':
                return this.wrapArray(
                    {
                        $ref: `#/components/schemas/${def.type}`,
                    },
                    def.isList
                );

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

    private setOutputRequired(fields: { name: string; isNullable?: boolean }[], result: OAPI.NonArraySchemaObject) {
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
                return { $ref: `#/components/schemas/${type}` };
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

    private ref(type: string) {
        return { $ref: `$/components/schemas/${type}` };
    }

    private array(itemType: unknown) {
        return { type: 'array', items: itemType };
    }
}
