// Inspired by: https://github.com/omar-dulaimi/prisma-trpc-generator

import { DMMF } from '@prisma/generator-helper';
import { AUXILIARY_FIELDS, PluginError, getDataModels, isIdField } from '@zenstackhq/sdk';
import { BuiltinType, DataModel, DataModelField, Enum, isDataModel, isEnum } from '@zenstackhq/sdk/ast';
import * as fs from 'fs';
import { lowerCaseFirst } from 'lower-case-first';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';
import * as path from 'path';
import invariant from 'tiny-invariant';
import YAML from 'yaml';
import { fromZodError } from 'zod-validation-error';
import { OpenAPIGeneratorBase } from './generator-base';
import { getModelResourceMeta } from './meta';
import { SecuritySchemesSchema } from './schema';

/**
 * Generates RESTful style OpenAPI specification.
 */
export class RESTfulOpenAPIGenerator extends OpenAPIGeneratorBase {
    private warnings: string[] = [];

    generate() {
        const output = this.getOption('output', '');
        if (!output) {
            throw new PluginError('"output" option is required');
        }

        const components = this.generateComponents();
        const paths = this.generatePaths();

        // generate security schemes, and root-level security
        this.generateSecuritySchemes(components);
        let security: OAPI.Document['security'] | undefined = undefined;
        if (components.securitySchemes && Object.keys(components.securitySchemes).length > 0) {
            security = Object.keys(components.securitySchemes).map((scheme) => ({ [scheme]: [] }));
        }

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
                    name: lowerCaseFirst(model.name),
                    description: meta?.tagDescription ?? `${model.name} operations`,
                };
            }),
            paths,
            components,
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

    private generatePaths(): OAPI.PathsObject {
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
                        ...this.generatePathsForModel(model, zmodel),
                    } as OAPI.PathsObject;
                } else {
                    this.warnings.push(`Unable to load ZModel definition for: ${model.name}}`);
                }
            }
        }
        return result;
    }

    private generatePathsForModel(model: DMMF.Model, zmodel: DataModel): OAPI.PathItemObject | undefined {
        const result: Record<string, OAPI.PathItemObject> = {};

        let prefix = this.getOption('prefix', '');
        if (prefix.endsWith('/')) {
            prefix = prefix.substring(0, prefix.length - 1);
        }

        // GET /resource
        // POST /resource
        result[`${prefix}/${lowerCaseFirst(model.name)}`] = {
            get: this.makeResourceList(zmodel),
            post: this.makeResourceCreate(zmodel),
        };

        // GET /resource/{id}
        // PATCH /resource/{id}
        // DELETE /resource/{id}
        result[`${prefix}/${lowerCaseFirst(model.name)}/{id}`] = {
            get: this.makeResourceFetch(zmodel),
            patch: this.makeResourceUpdate(zmodel),
            delete: this.makeResourceDelete(zmodel),
        };

        // paths for related resources and relationships
        for (const field of zmodel.fields) {
            const relationDecl = field.type.reference?.ref;
            if (!isDataModel(relationDecl)) {
                continue;
            }

            // GET /resource/{id}/field
            const relatedDataPath = `${prefix}/${lowerCaseFirst(model.name)}/{id}/${field.name}`;
            let container = result[relatedDataPath];
            if (!container) {
                container = result[relatedDataPath] = {};
            }
            container.get = this.makeRelatedFetch(zmodel, field, relationDecl);

            const relationshipPath = `${prefix}/${lowerCaseFirst(model.name)}/{id}/relationships/${field.name}`;
            container = result[relationshipPath];
            if (!container) {
                container = result[relationshipPath] = {};
            }
            // GET /resource/{id}/relationships/field
            container.get = this.makeRelationshipFetch(zmodel, field);
            // PATCH /resource/{id}/relationships/field
            container.patch = this.makeRelationshipUpdate(zmodel, field);
            if (field.type.array) {
                // POST /resource/{id}/relationships/field
                container.post = this.makeRelationshipCreate(zmodel, field);
            }
        }

        return result;
    }

    private makeResourceList(model: DataModel) {
        return {
            operationId: `list-${model.name}`,
            description: `List ${model.name} resources`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [
                this.parameter('include'),
                this.parameter('sort'),
                this.parameter('page-offset'),
                this.parameter('page-limit'),
                ...this.generateFilterParameters(model),
            ],
            responses: {
                '200': this.success(`${model.name}ListResponse`),
                '403': this.forbidden(),
            },
        };
    }

    private makeResourceCreate(model: DataModel) {
        return {
            operationId: `create-${model.name}`,
            description: `Create a ${model.name} resource`,
            tags: [lowerCaseFirst(model.name)],
            requestBody: {
                content: {
                    'application/vnd.api+json': {
                        schema: this.ref(`${model.name}CreateRequest`),
                    },
                },
            },
            responses: {
                '201': this.success(`${model.name}Response`),
                '403': this.forbidden(),
            },
        };
    }

    private makeResourceFetch(model: DataModel) {
        return {
            operationId: `fetch-${model.name}`,
            description: `Fetch one ${model.name} resource`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id'), this.parameter('include'), ...this.generateFilterParameters(model)],
            responses: {
                '200': this.success(`${model.name}Response`),
                '403': this.forbidden(),
            },
        };
    }

    private makeRelatedFetch(model: DataModel, field: DataModelField, relationDecl: DataModel) {
        return {
            operationId: `fetch-${model.name}-related-${field.name}`,
            description: `Fetch the related ${field.name} resource for ${model.name}`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id'), this.parameter('include'), ...this.generateFilterParameters(model)],
            responses: {
                '200': this.success(
                    field.type.array ? `${relationDecl.name}ListResponse` : `${relationDecl.name}Response`
                ),
                '403': this.forbidden(),
            },
        };
    }

    private makeResourceUpdate(model: DataModel) {
        return {
            operationId: `update-${model.name}`,
            description: `Update one ${model.name} resource`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id')],
            requestBody: {
                content: {
                    'application/vnd.api+json': {
                        schema: this.ref(`${model.name}UpdateRequest`),
                    },
                },
            },
            responses: {
                '200': this.success(`${model.name}Response`),
                '403': this.forbidden(),
            },
        };
    }

    private makeResourceDelete(model: DataModel) {
        return {
            operationId: `delete-${model.name}`,
            description: `Delete one ${model.name} resource`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id')],
            responses: {
                '200': this.success(),
                '403': this.forbidden(),
            },
        };
    }

    private makeRelationshipFetch(model: DataModel, field: DataModelField) {
        const parameters: OAPI.OperationObject['parameters'] = [this.parameter('id')];
        if (field.type.array) {
            parameters.push(
                this.parameter('sort'),
                this.parameter('page-offset'),
                this.parameter('page-limit'),
                ...this.generateFilterParameters(model)
            );
        }
        return {
            operationId: `fetch-${model.name}-relationship-${field.name}`,
            description: `Fetch${field.name} relationships for ${model.name}`,
            tags: [lowerCaseFirst(model.name)],
            parameters,
            responses: {
                '200': field.type.array
                    ? this.success('toManyRelationshipResponse')
                    : this.success('toOneRelationshipResponse'),
                '403': this.forbidden(),
            },
        };
    }

    private makeRelationshipCreate(model: DataModel, field: DataModelField) {
        return {
            operationId: `create-${model.name}-relationship-${field.name}`,
            description: `Create new ${field.name} relationships for ${model.name}`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id')],
            requestBody: {
                content: {
                    'application/vnd.api+json': {
                        schema: this.ref('toManyRelationshipRequest'),
                    },
                },
            },
            responses: {
                '200': this.success('toManyRelationshipResponse'),
                '403': this.forbidden(),
            },
        };
    }

    private makeRelationshipUpdate(model: DataModel, field: DataModelField) {
        return {
            operationId: `update-${model.name}-relationship-${field.name}`,
            description: `Update ${field.name} relationships for ${model.name}`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id')],
            requestBody: {
                content: {
                    'application/vnd.api+json': {
                        schema: field.type.array
                            ? this.ref('toManyRelationshipRequest')
                            : this.ref('toOneRelationshipRequest'),
                    },
                },
            },
            responses: {
                '200': field.type.array
                    ? this.success('toManyRelationshipResponse')
                    : this.success('toOneRelationshipResponse'),
                '403': this.forbidden(),
            },
        };
    }

    private generateFilterParameters(zmodel: DataModel) {
        const result: OAPI.ParameterObject[] = [];

        for (const field of zmodel.fields) {
            if (isIdField(field)) {
                result.push(this.makeParameter('filter[id]'));
                continue;
            }
            switch (field.type.type) {
                case 'Int':
                case 'BigInt':
                case 'Float':
                case 'Decimal':
                case 'DateTime': {
                    result.push(this.makeParameter(`filter[${field.name}$lt]`));
                    result.push(this.makeParameter(`filter[${field.name}$lte]`));
                    result.push(this.makeParameter(`filter[${field.name}$gt]`));
                    result.push(this.makeParameter(`filter[${field.name}$gte]`));
                    break;
                }
                case 'String': {
                    result.push(this.makeParameter(`filter[${field.name}$contains]`));
                    result.push(this.makeParameter(`filter[${field.name}$icontains]`));
                    result.push(this.makeParameter(`filter[${field.name}$search]`));
                    result.push(this.makeParameter(`filter[${field.name}$startsWith]`));
                    result.push(this.makeParameter(`filter[${field.name}$endsWith]`));
                    break;
                }
            }

            if (field.type.array) {
                result.push(this.makeParameter(`filter[${field.name}$has]`));
                result.push(this.makeParameter(`filter[${field.name}$hasEvery]`));
                result.push(this.makeParameter(`filter[${field.name}$hasSome]`));
                result.push(this.makeParameter(`filter[${field.name}$isEmpty]`));
            }
        }

        return result;
    }

    private makeParameter(name: string): OAPI.ParameterObject {
        return {
            name,
            required: false,
            in: 'query',
            schema: { type: 'string' },
        };
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
        const parameters: Record<string, OAPI.ParameterObject> = {};
        const components: OAPI.ComponentsObject = {
            schemas,
            parameters,
        };

        for (const [name, value] of Object.entries(this.generateSharedComponents())) {
            schemas[name] = value;
        }

        for (const [name, value] of Object.entries(this.generateParameters())) {
            parameters[name] = value;
        }

        for (const _enum of this.model.declarations.filter((d): d is Enum => isEnum(d))) {
            schemas[_enum.name] = this.generateEnumComponent(_enum);
        }

        // data models
        for (const model of getDataModels(this.model)) {
            if (!this.includedModels.includes(model)) {
                continue;
            }
            for (const [name, value] of Object.entries(this.generateDataModelComponents(model))) {
                schemas[name] = value;
            }
        }

        return components;
    }

    private generateSharedComponents(): Record<string, OAPI.SchemaObject> {
        return {
            jsonapi: {
                type: 'object',
                description: 'an object describing the server’s implementation',
                properties: {
                    version: { type: 'string' },
                    meta: this.ref('meta'),
                },
            },
            meta: {
                type: 'object',
                additionalProperties: true,
            },
            resourceIdentifier: {
                type: 'object',
                required: ['type', 'id'],
                properties: {
                    type: { type: 'string' },
                    id: { type: 'string' },
                },
            },
            resource: this.allOf(this.ref('resourceIdentifier'), {
                type: 'object',
                properties: {
                    attributes: { type: 'object' },
                    relationships: { type: 'object' },
                },
            }),
            links: {
                type: 'object',
                properties: { self: { type: 'string' } },
            },
            pagination: {
                type: 'object',
                properties: {
                    first: this.nullable({ type: 'string' }),
                    last: this.nullable({ type: 'string' }),
                    prev: this.nullable({ type: 'string' }),
                    next: this.nullable({ type: 'string' }),
                },
            },
            errors: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        code: { type: 'string' },
                        title: { type: 'string' },
                        detail: { type: 'string' },
                    },
                },
            },
            errorResponse: {
                type: 'object',
                properties: {
                    jsonapi: this.ref('jsonapi'),
                    errors: this.ref('errors'),
                },
            },
            relationLinks: {
                type: 'object',
                properties: {
                    self: { type: 'string' },
                    related: { type: 'string' },
                },
            },
            toOneRelationship: {
                type: 'object',
                properties: {
                    data: this.ref('resourceIdentifier'),
                },
            },
            toOneRelationshipWithLinks: {
                type: 'object',
                properties: {
                    links: this.ref('relationLinks'),
                    data: this.ref('resourceIdentifier'),
                },
            },
            toManyRelationship: {
                type: 'object',
                properties: {
                    data: this.array(this.ref('resourceIdentifier')),
                },
            },
            toManyRelationshipWithLinks: {
                type: 'object',
                properties: {
                    links: this.ref('pagedRelationLinks'),
                    data: this.array(this.ref('resourceIdentifier')),
                },
            },
            pagedRelationLinks: this.allOf(this.ref('pagination'), this.ref('relationLinks')),
            toManyRelationshipRequest: {
                type: 'object',
                properties: {
                    data: {
                        type: 'array',
                        items: this.ref('resourceIdentifier'),
                    },
                },
            },
            toOneRelationshipRequest: this.nullable({
                type: 'object',
                properties: {
                    data: this.ref('resourceIdentifier'),
                },
            }),
            toManyRelationshipResponse: this.allOf(this.ref('toManyRelationshipWithLinks'), {
                type: 'object',
                properties: {
                    jsonapi: this.ref('jsonapi'),
                },
            }),
            toOneRelationshipResponse: this.nullable(
                this.allOf(this.ref('toOneRelationshipWithLinks'), {
                    type: 'object',
                    properties: {
                        jsonapi: this.ref('jsonapi'),
                    },
                })
            ),
        };
    }

    private generateParameters(): Record<string, OAPI.ParameterObject> {
        return {
            id: {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
            },
            include: {
                name: 'include',
                in: 'query',
                required: false,
                style: 'form',
                schema: { type: 'string' },
            },
            sort: {
                name: 'sort',
                in: 'query',
                required: false,
                style: 'form',
                schema: { type: 'string' },
            },
            'page-offset': {
                name: 'page[offset]',
                in: 'query',
                required: false,
                style: 'form',
                schema: { type: 'integer' },
            },
            'page-limit': {
                name: 'page[limit]',
                in: 'query',
                required: false,
                style: 'form',
                schema: { type: 'integer' },
            },
        };
    }

    private generateEnumComponent(_enum: Enum): OAPI.SchemaObject {
        const schema: OAPI.SchemaObject = {
            type: 'string',
            enum: _enum.fields.map((f) => f.name),
        };
        return schema;
    }

    private generateDataModelComponents(model: DataModel) {
        const result: Record<string, OAPI.SchemaObject> = {};
        result[`${model.name}`] = this.generateModelEntity(model, 'output');

        result[`${model.name}CreateRequest`] = {
            type: 'object',
            required: ['data'],
            properties: {
                data: this.generateModelEntity(model, 'input'),
            },
        };

        result[`${model.name}UpdateRequest`] = {
            type: 'object',
            required: ['data'],
            properties: { data: this.generateModelEntity(model, 'input') },
        };

        const relationships: Record<string, OAPI.ReferenceObject> = {};
        for (const field of model.fields) {
            if (this.isRelationshipField(field)) {
                if (field.type.array) {
                    relationships[field.name] = this.ref('toManyRelationship');
                } else {
                    relationships[field.name] = this.ref('toOneRelationship');
                }
            }
        }

        result[`${model.name}Response`] = {
            type: 'object',
            required: ['data'],
            properties: {
                jsonapi: this.ref('jsonapi'),
                data: this.allOf(this.ref(`${model.name}`), {
                    type: 'object',
                    properties: { relationships: { type: 'object', properties: relationships } },
                }),

                included: {
                    type: 'array',
                    items: this.ref('resource'),
                },
                links: this.ref('links'),
            },
        };

        result[`${model.name}ListResponse`] = {
            type: 'object',
            required: ['data'],
            properties: {
                jsonapi: this.ref('jsonapi'),
                data: this.array(
                    this.allOf(this.ref(`${model.name}`), {
                        type: 'object',
                        properties: { relationships: { type: 'object', properties: relationships } },
                    })
                ),
                included: {
                    type: 'array',
                    items: this.ref('resource'),
                },
                links: this.allOf(this.ref('links'), this.ref('pagination')),
            },
        };

        return result;
    }

    private generateModelEntity(model: DataModel, mode: 'input' | 'output'): OAPI.SchemaObject {
        const fields = model.fields.filter((f) => !AUXILIARY_FIELDS.includes(f.name) && !isIdField(f));

        const attributes: Record<string, OAPI.SchemaObject> = {};
        const relationships: Record<string, OAPI.ReferenceObject> = {};

        const required: string[] = [];

        for (const field of fields) {
            if (this.isRelationshipField(field)) {
                let relType: string;
                if (mode === 'input') {
                    relType = field.type.array ? 'toManyRelationship' : 'toOneRelationship';
                } else {
                    relType = field.type.array ? 'toManyRelationshipWithLinks' : 'toOneRelationshipWithLinks';
                }
                relationships[field.name] = this.ref(relType);
            } else {
                attributes[field.name] = this.generateField(field);
                if (
                    !field.type.optional &&
                    // collection relation fields are implicitly optional
                    !(isDataModel(field.$resolvedType?.decl) && field.type.array)
                ) {
                    required.push(field.name);
                }
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = {
            type: 'object',
            required: ['id', 'type', 'attributes'],
            properties: {
                type: { type: 'string' },
                id: { type: 'string' },
                attributes: {
                    type: 'object',
                    required: required.length > 0 ? required : undefined,
                    properties: attributes,
                },
            },
        } satisfies OAPI.SchemaObject;

        if (Object.keys(relationships).length > 0) {
            result.properties.relationships = {
                type: 'object',
                properties: relationships,
            };
        }

        return result;
    }

    private isRelationshipField(field: DataModelField) {
        return isDataModel(field.type.reference?.ref);
    }

    private generateField(field: DataModelField) {
        const resolvedDecl = field.type.reference?.ref;
        if (resolvedDecl && isEnum(resolvedDecl)) {
            return this.wrapArray(this.ref(resolvedDecl.name), field.type.array);
        }
        invariant(field?.type?.type);
        return this.wrapArray(this.modelTypeToOpenAPIType(field.type.type), field.type.array);
    }

    private get specVersion() {
        return this.getOption('specVersion', '3.0.0');
    }

    private modelTypeToOpenAPIType(type: BuiltinType): OAPI.ReferenceObject | OAPI.SchemaObject {
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
            case 'Json':
                return {};
            default:
                return { $ref: `#/components/schemas/${type}` };
        }
    }

    private ref(type: string) {
        return { $ref: `#/components/schemas/${type}` };
    }

    private nullable(schema: OAPI.SchemaObject | OAPI.ReferenceObject) {
        return this.specVersion === '3.0.0' ? { ...schema, nullable: true } : this.oneOf(schema, { type: 'null' });
    }

    private parameter(type: string) {
        return { $ref: `#/components/parameters/${type}` };
    }

    private forbidden() {
        return {
            description: 'Forbidden',
            content: {
                'application/vnd.api+json': {
                    schema: this.ref('errorResponse'),
                },
            },
        };
    }

    private success(responseComponent?: string) {
        return {
            description: 'Successful operation',
            content: responseComponent
                ? {
                      'application/vnd.api+json': {
                          schema: this.ref(responseComponent),
                      },
                  }
                : undefined,
        };
    }
}
