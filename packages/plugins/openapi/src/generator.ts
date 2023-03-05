import { DMMF } from '@prisma/generator-helper';
import { PluginError, PluginOptions } from '@zenstackhq/sdk';
import { type Model } from '@zenstackhq/sdk/ast';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';
import * as fs from 'fs';

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
        const paths = this.generatePaths();

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

    private generatePaths(): OAPI.PathsObject {
        throw new Error('Method not implemented.');
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
        for (const input of this.dmmf.schema.inputObjectTypes.prisma) {
            schemas[input.name] = this.generateInputComponent(input);
        }

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

        for (const field of model.fields) {
            properties[field.name] = this.generateField(field);
        }

        const result: OAPI.SchemaObject = { type: 'object', properties };
        this.setRequired(model.fields, result);
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
        for (const field of input.fields) {
            const options = field.inputTypes.map((f) => {
                return this.wrapArray(this.prismaTypeToOpenAPIType(f.type), f.isList);
            });
            properties[field.name] = options.length > 1 ? { oneOf: options } : options[0];
        }

        const result: OAPI.SchemaObject = { type: 'object', properties };
        this.setRequired(input.fields, result);
        return result;
    }

    private setRequired(fields: { name: string; isRequired: boolean }[], result: OAPI.NonArraySchemaObject) {
        const required = fields.filter((f) => f.isRequired).map((f) => f.name);
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
                return { type: 'boolean' };
            case 'DateTime':
                return { type: 'string', format: 'date-time' };
            case 'JSON':
                return { type: 'object' };
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
}
