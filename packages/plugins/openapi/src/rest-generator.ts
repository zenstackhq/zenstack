// Inspired by: https://github.com/omar-dulaimi/prisma-trpc-generator

import { DMMF } from '@prisma/generator-helper';
import {
    AUXILIARY_FIELDS,
    analyzePolicies,
    getDataModels,
    hasAttribute,
    isForeignKeyField,
    isIdField,
    isRelationshipField,
    requireOption,
    resolvePath,
} from '@zenstackhq/sdk';
import { DataModel, DataModelField, DataModelFieldType, Enum, isDataModel, isEnum } from '@zenstackhq/sdk/ast';
import * as fs from 'fs';
import { lowerCaseFirst } from 'lower-case-first';
import type { OpenAPIV3_1 as OAPI } from 'openapi-types';
import * as path from 'path';
import pluralize from 'pluralize';
import invariant from 'tiny-invariant';
import YAML from 'yaml';
import { OpenAPIGeneratorBase } from './generator-base';
import { getModelResourceMeta } from './meta';

type Policies = ReturnType<typeof analyzePolicies>;

/**
 * Generates RESTful style OpenAPI specification.
 */
export class RESTfulOpenAPIGenerator extends OpenAPIGeneratorBase {
    private warnings: string[] = [];

    generate() {
        let output = requireOption<string>(this.options, 'output');
        output = resolvePath(output, this.options);

        const components = this.generateComponents();
        const paths = this.generatePaths();

        // prune unused component schemas
        this.pruneComponents(paths, components);

        // generate security schemes, and root-level security
        components.securitySchemes = this.generateSecuritySchemes();
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

        // analyze access policies to determine default security
        const policies = analyzePolicies(zmodel);

        let prefix = this.getOption('prefix', '');
        if (prefix.endsWith('/')) {
            prefix = prefix.substring(0, prefix.length - 1);
        }

        const resourceMeta = getModelResourceMeta(zmodel);

        // GET /resource
        // POST /resource
        result[`${prefix}/${lowerCaseFirst(model.name)}`] = {
            get: this.makeResourceList(zmodel, policies, resourceMeta),
            post: this.makeResourceCreate(zmodel, policies, resourceMeta),
        };

        // GET /resource/{id}
        // PUT /resource/{id}
        // PATCH /resource/{id}
        // DELETE /resource/{id}
        result[`${prefix}/${lowerCaseFirst(model.name)}/{id}`] = {
            get: this.makeResourceFetch(zmodel, policies, resourceMeta),
            put: this.makeResourceUpdate(zmodel, policies, `update-${model.name}-put`, resourceMeta),
            patch: this.makeResourceUpdate(zmodel, policies, `update-${model.name}-patch`, resourceMeta),
            delete: this.makeResourceDelete(zmodel, policies, resourceMeta),
        };

        // paths for related resources and relationships
        for (const field of zmodel.fields) {
            const relationDecl = field.type.reference?.ref;
            if (!isDataModel(relationDecl)) {
                continue;
            }

            // GET /resource/{id}/{relationship}
            const relatedDataPath = `${prefix}/${lowerCaseFirst(model.name)}/{id}/${field.name}`;
            let container = result[relatedDataPath];
            if (!container) {
                container = result[relatedDataPath] = {};
            }
            container.get = this.makeRelatedFetch(zmodel, field, relationDecl, resourceMeta);

            const relationshipPath = `${prefix}/${lowerCaseFirst(model.name)}/{id}/relationships/${field.name}`;
            container = result[relationshipPath];
            if (!container) {
                container = result[relationshipPath] = {};
            }
            // GET /resource/{id}/relationships/{relationship}
            container.get = this.makeRelationshipFetch(zmodel, field, policies, resourceMeta);

            // PUT /resource/{id}/relationships/{relationship}
            container.put = this.makeRelationshipUpdate(
                zmodel,
                field,
                policies,
                `update-${model.name}-relationship-${field.name}-put`,
                resourceMeta
            );
            // PATCH /resource/{id}/relationships/{relationship}
            container.patch = this.makeRelationshipUpdate(
                zmodel,
                field,
                policies,
                `update-${model.name}-relationship-${field.name}-patch`,
                resourceMeta
            );

            if (field.type.array) {
                // POST /resource/{id}/relationships/{relationship}
                container.post = this.makeRelationshipCreate(zmodel, field, policies, resourceMeta);
            }
        }

        return result;
    }

    private makeResourceList(model: DataModel, policies: Policies, resourceMeta: { security?: object } | undefined) {
        return {
            operationId: `list-${model.name}`,
            description: `List "${model.name}" resources`,
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
            security: resourceMeta?.security ?? policies.read === true ? [] : undefined,
        };
    }

    private makeResourceCreate(model: DataModel, policies: Policies, resourceMeta: { security?: object } | undefined) {
        return {
            operationId: `create-${model.name}`,
            description: `Create a "${model.name}" resource`,
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
            security: resourceMeta?.security ?? policies.create === true ? [] : undefined,
        };
    }

    private makeResourceFetch(model: DataModel, policies: Policies, resourceMeta: { security?: object } | undefined) {
        return {
            operationId: `fetch-${model.name}`,
            description: `Fetch a "${model.name}" resource`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id'), this.parameter('include')],
            responses: {
                '200': this.success(`${model.name}Response`),
                '403': this.forbidden(),
                '404': this.notFound(),
            },
            security: resourceMeta?.security ?? policies.read === true ? [] : undefined,
        };
    }

    private makeRelatedFetch(
        model: DataModel,
        field: DataModelField,
        relationDecl: DataModel,
        resourceMeta: { security?: object } | undefined
    ) {
        const policies = analyzePolicies(relationDecl);
        const parameters: OAPI.OperationObject['parameters'] = [this.parameter('id'), this.parameter('include')];
        if (field.type.array) {
            parameters.push(
                this.parameter('sort'),
                this.parameter('page-offset'),
                this.parameter('page-limit'),
                ...this.generateFilterParameters(model)
            );
        }
        const result = {
            operationId: `fetch-${model.name}-related-${field.name}`,
            description: `Fetch the related "${field.name}" resource for "${model.name}"`,
            tags: [lowerCaseFirst(model.name)],
            parameters,
            responses: {
                '200': this.success(
                    field.type.array ? `${relationDecl.name}ListResponse` : `${relationDecl.name}Response`
                ),
                '403': this.forbidden(),
                '404': this.notFound(),
            },
            security: resourceMeta?.security ?? policies.read === true ? [] : undefined,
        };
        return result;
    }

    private makeResourceUpdate(
        model: DataModel,
        policies: Policies,
        operationId: string,
        resourceMeta: { security?: object } | undefined
    ) {
        return {
            operationId,
            description: `Update a "${model.name}" resource`,
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
                '404': this.notFound(),
            },
            security: resourceMeta?.security ?? policies.update === true ? [] : undefined,
        };
    }

    private makeResourceDelete(model: DataModel, policies: Policies, resourceMeta: { security?: object } | undefined) {
        return {
            operationId: `delete-${model.name}`,
            description: `Delete a "${model.name}" resource`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id')],
            responses: {
                '200': this.success(),
                '403': this.forbidden(),
                '404': this.notFound(),
            },
            security: resourceMeta?.security ?? policies.delete === true ? [] : undefined,
        };
    }

    private makeRelationshipFetch(
        model: DataModel,
        field: DataModelField,
        policies: Policies,
        resourceMeta: { security?: object } | undefined
    ) {
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
            description: `Fetch the "${field.name}" relationships for a "${model.name}"`,
            tags: [lowerCaseFirst(model.name)],
            parameters,
            responses: {
                '200': field.type.array
                    ? this.success('_toManyRelationshipResponse')
                    : this.success('_toOneRelationshipResponse'),
                '403': this.forbidden(),
                '404': this.notFound(),
            },
            security: resourceMeta?.security ?? policies.read === true ? [] : undefined,
        };
    }

    private makeRelationshipCreate(
        model: DataModel,
        field: DataModelField,
        policies: Policies,
        resourceMeta: { security?: object } | undefined
    ) {
        return {
            operationId: `create-${model.name}-relationship-${field.name}`,
            description: `Create new "${field.name}" relationships for a "${model.name}"`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id')],
            requestBody: {
                content: {
                    'application/vnd.api+json': {
                        schema: this.ref('_toManyRelationshipRequest'),
                    },
                },
            },
            responses: {
                '200': this.success('_toManyRelationshipResponse'),
                '403': this.forbidden(),
                '404': this.notFound(),
            },
            security: resourceMeta?.security ?? policies.update === true ? [] : undefined,
        };
    }

    private makeRelationshipUpdate(
        model: DataModel,
        field: DataModelField,
        policies: Policies,
        operationId: string,
        resourceMeta: { security?: object } | undefined
    ) {
        return {
            operationId,
            description: `Update "${field.name}" ${pluralize('relationship', field.type.array ? 2 : 1)} for a "${
                model.name
            }"`,
            tags: [lowerCaseFirst(model.name)],
            parameters: [this.parameter('id')],
            requestBody: {
                content: {
                    'application/vnd.api+json': {
                        schema: field.type.array
                            ? this.ref('_toManyRelationshipRequest')
                            : this.ref('_toOneRelationshipRequest'),
                    },
                },
            },
            responses: {
                '200': field.type.array
                    ? this.success('_toManyRelationshipResponse')
                    : this.success('_toOneRelationshipResponse'),
                '403': this.forbidden(),
                '404': this.notFound(),
            },
            security: resourceMeta?.security ?? policies.update === true ? [] : undefined,
        };
    }

    private generateFilterParameters(model: DataModel) {
        const result: OAPI.ParameterObject[] = [];

        for (const field of model.fields) {
            if (isForeignKeyField(field)) {
                // no filtering with foreign keys because one can filter
                // directly on the relationship
                continue;
            }

            if (isIdField(field)) {
                // id filter
                result.push(this.makeFilterParameter(field, 'id', 'Id filter'));
                continue;
            }

            // equality filter
            result.push(this.makeFilterParameter(field, '', 'Equality filter', field.type.array));

            if (isRelationshipField(field)) {
                // TODO: how to express nested filters?
                continue;
            }

            if (field.type.array) {
                // collection filters
                result.push(this.makeFilterParameter(field, '$has', 'Collection contains filter'));
                result.push(this.makeFilterParameter(field, '$hasEvery', 'Collection contains-all filter', true));
                result.push(this.makeFilterParameter(field, '$hasSome', 'Collection contains-any filter', true));
                result.push(
                    this.makeFilterParameter(field, '$isEmpty', 'Collection is empty filter', false, {
                        type: 'boolean',
                    })
                );
            } else {
                if (field.type.type && ['Int', 'BigInt', 'Float', 'Decimal', 'DateTime'].includes(field.type.type)) {
                    // comparison filters
                    result.push(this.makeFilterParameter(field, '$lt', 'Less-than filter'));
                    result.push(this.makeFilterParameter(field, '$lte', 'Less-than or equal filter'));
                    result.push(this.makeFilterParameter(field, '$gt', 'Greater-than filter'));
                    result.push(this.makeFilterParameter(field, '$gte', 'Greater-than or equal filter'));
                }

                if (field.type.type === 'String') {
                    result.push(this.makeFilterParameter(field, '$contains', 'String contains filter'));
                    result.push(
                        this.makeFilterParameter(field, '$icontains', 'String case-insensitive contains filter')
                    );
                    result.push(this.makeFilterParameter(field, '$search', 'String full-text search filter'));
                    result.push(this.makeFilterParameter(field, '$startsWith', 'String startsWith filter'));
                    result.push(this.makeFilterParameter(field, '$endsWith', 'String endsWith filter'));
                }
            }
        }

        return result;
    }

    private makeFilterParameter(
        field: DataModelField,
        name: string,
        description: string,
        array = false,
        schemaOverride?: OAPI.SchemaObject
    ) {
        let schema: OAPI.SchemaObject | OAPI.ReferenceObject;

        if (schemaOverride) {
            schema = schemaOverride;
        } else {
            const fieldDecl = field.type.reference?.ref;
            if (isEnum(fieldDecl)) {
                schema = this.ref(fieldDecl.name);
            } else if (isDataModel(fieldDecl)) {
                schema = { type: 'string' };
            } else {
                invariant(field.type.type);
                schema = this.fieldTypeToOpenAPISchema(field.type);
            }
        }
        if (array) {
            schema = { type: 'array', items: schema };
        }

        return {
            name: name === 'id' ? 'filter[id]' : `filter[${field.name}${name}]`,
            required: false,
            description: name === 'id' ? description : `${description} for "${field.name}"`,
            in: 'query',
            style: 'form',
            explode: false,
            schema,
        } as OAPI.ParameterObject;
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
            for (const [name, value] of Object.entries(this.generateDataModelComponents(model))) {
                schemas[name] = value;
            }
        }

        return components;
    }

    private generateSharedComponents(): Record<string, OAPI.SchemaObject> {
        return {
            _jsonapi: {
                type: 'object',
                description: 'An object describing the server’s implementation',
                required: ['version'],
                properties: {
                    version: { type: 'string' },
                },
            },
            _meta: {
                type: 'object',
                description: 'Meta information about the request or response',
                properties: {
                    serialization: {
                        description: 'Superjson serialization metadata',
                    },
                },
                additionalProperties: true,
            },
            _resourceIdentifier: {
                type: 'object',
                description: 'Identifier for a resource',
                required: ['type', 'id'],
                properties: {
                    type: { type: 'string', description: 'Resource type' },
                    id: { type: 'string', description: 'Resource id' },
                },
            },
            _resource: this.allOf(this.ref('_resourceIdentifier'), {
                type: 'object',
                description: 'A resource with attributes and relationships',
                properties: {
                    attributes: { type: 'object', description: 'Resource attributes' },
                    relationships: { type: 'object', description: 'Resource relationships' },
                },
            }),
            _links: {
                type: 'object',
                required: ['self'],
                description: 'Links related to the resource',
                properties: { self: { type: 'string', description: 'Link for refetching the curent results' } },
            },
            _pagination: {
                type: 'object',
                description: 'Pagination information',
                required: ['first', 'last', 'prev', 'next'],
                properties: {
                    first: this.nullable({ type: 'string', description: 'Link to the first page' }),
                    last: this.nullable({ type: 'string', description: 'Link to the last page' }),
                    prev: this.nullable({ type: 'string', description: 'Link to the previous page' }),
                    next: this.nullable({ type: 'string', description: 'Link to the next page' }),
                },
            },
            _errors: {
                type: 'array',
                description: 'An array of error objects',
                items: {
                    type: 'object',
                    required: ['status', 'code'],
                    properties: {
                        status: { type: 'string', description: 'HTTP status' },
                        code: { type: 'string', description: 'Error code' },
                        prismaCode: {
                            type: 'string',
                            description: 'Prisma error code if the error is thrown by Prisma',
                        },
                        title: { type: 'string', description: 'Error title' },
                        detail: { type: 'string', description: 'Error detail' },
                    },
                },
            },
            _errorResponse: {
                type: 'object',
                required: ['errors'],
                description: 'An error response',
                properties: {
                    jsonapi: this.ref('_jsonapi'),
                    errors: this.ref('_errors'),
                },
            },
            _relationLinks: {
                type: 'object',
                required: ['self', 'related'],
                description: 'Links related to a relationship',
                properties: {
                    self: { type: 'string', description: 'Link for fetching this relationship' },
                    related: {
                        type: 'string',
                        description: 'Link for fetching the resource represented by this relationship',
                    },
                },
            },
            _toOneRelationship: {
                type: 'object',
                description: 'A to-one relationship',
                properties: {
                    data: this.nullable(this.ref('_resourceIdentifier')),
                },
            },
            _toOneRelationshipWithLinks: {
                type: 'object',
                required: ['links', 'data'],
                description: 'A to-one relationship with links',
                properties: {
                    links: this.ref('_relationLinks'),
                    data: this.nullable(this.ref('_resourceIdentifier')),
                },
            },
            _toManyRelationship: {
                type: 'object',
                required: ['data'],
                description: 'A to-many relationship',
                properties: {
                    data: this.array(this.ref('_resourceIdentifier')),
                },
            },
            _toManyRelationshipWithLinks: {
                type: 'object',
                required: ['links', 'data'],
                description: 'A to-many relationship with links',
                properties: {
                    links: this.ref('_pagedRelationLinks'),
                    data: this.array(this.ref('_resourceIdentifier')),
                },
            },
            _pagedRelationLinks: {
                description: 'Relationship links with pagination information',
                ...this.allOf(this.ref('_pagination'), this.ref('_relationLinks')),
            },
            _toManyRelationshipRequest: {
                type: 'object',
                required: ['data'],
                description: 'Input for manipulating a to-many relationship',
                properties: {
                    data: {
                        type: 'array',
                        items: this.ref('_resourceIdentifier'),
                    },
                },
            },
            _toOneRelationshipRequest: {
                description: 'Input for manipulating a to-one relationship',
                ...this.nullable({
                    type: 'object',
                    required: ['data'],
                    properties: {
                        data: this.ref('_resourceIdentifier'),
                    },
                }),
            },
            _toManyRelationshipResponse: {
                description: 'Response for a to-many relationship',
                ...this.allOf(this.ref('_toManyRelationshipWithLinks'), {
                    type: 'object',
                    properties: {
                        jsonapi: this.ref('_jsonapi'),
                    },
                }),
            },
            _toOneRelationshipResponse: {
                description: 'Response for a to-one relationship',
                ...this.allOf(this.ref('_toOneRelationshipWithLinks'), {
                    type: 'object',
                    properties: {
                        jsonapi: this.ref('_jsonapi'),
                    },
                }),
            },
        };
    }

    private generateParameters(): Record<string, OAPI.ParameterObject> {
        return {
            id: {
                name: 'id',
                in: 'path',
                description: 'The resource id',
                required: true,
                schema: { type: 'string' },
            },
            include: {
                name: 'include',
                in: 'query',
                description: 'Relationships to include',
                required: false,
                style: 'form',
                schema: { type: 'string' },
            },
            sort: {
                name: 'sort',
                in: 'query',
                description: 'Fields to sort by',
                required: false,
                style: 'form',
                schema: { type: 'string' },
            },
            'page-offset': {
                name: 'page[offset]',
                in: 'query',
                description: 'Offset for pagination',
                required: false,
                style: 'form',
                schema: { type: 'integer' },
            },
            'page-limit': {
                name: 'page[limit]',
                in: 'query',
                description: 'Limit for pagination',
                required: false,
                style: 'form',
                schema: { type: 'integer' },
            },
        };
    }

    private generateEnumComponent(_enum: Enum): OAPI.SchemaObject {
        const schema: OAPI.SchemaObject = {
            type: 'string',
            description: `The "${_enum.name}" Enum`,
            enum: _enum.fields.map((f) => f.name),
        };
        return schema;
    }

    private generateDataModelComponents(model: DataModel) {
        const result: Record<string, OAPI.SchemaObject> = {};
        result[`${model.name}`] = this.generateModelEntity(model, 'read');

        result[`${model.name}CreateRequest`] = {
            type: 'object',
            description: `Input for creating a "${model.name}"`,
            required: ['data'],
            properties: {
                data: this.generateModelEntity(model, 'create'),
                meta: this.ref('_meta'),
            },
        };

        result[`${model.name}UpdateRequest`] = {
            type: 'object',
            description: `Input for updating a "${model.name}"`,
            required: ['data'],
            properties: { data: this.generateModelEntity(model, 'update'), meta: this.ref('_meta') },
        };

        const relationships: Record<string, OAPI.ReferenceObject> = {};
        for (const field of model.fields) {
            if (isRelationshipField(field)) {
                if (field.type.array) {
                    relationships[field.name] = this.ref('_toManyRelationship');
                } else {
                    relationships[field.name] = this.ref('_toOneRelationship');
                }
            }
        }

        result[`${model.name}Response`] = {
            type: 'object',
            description: `Response for a "${model.name}"`,
            required: ['data'],
            properties: {
                jsonapi: this.ref('_jsonapi'),
                data: this.allOf(this.ref(`${model.name}`), {
                    type: 'object',
                    properties: { relationships: { type: 'object', properties: relationships } },
                }),
                meta: this.ref('_meta'),
                included: {
                    type: 'array',
                    items: this.ref('_resource'),
                },
                links: this.ref('_links'),
            },
        };

        result[`${model.name}ListResponse`] = {
            type: 'object',
            description: `Response for a list of "${model.name}"`,
            required: ['data', 'links'],
            properties: {
                jsonapi: this.ref('_jsonapi'),
                data: this.array(
                    this.allOf(this.ref(`${model.name}`), {
                        type: 'object',
                        properties: { relationships: { type: 'object', properties: relationships } },
                    })
                ),
                meta: this.ref('_meta'),
                included: {
                    type: 'array',
                    items: this.ref('_resource'),
                },
                links: this.allOf(this.ref('_links'), this.ref('_pagination')),
            },
        };

        return result;
    }

    private generateModelEntity(model: DataModel, mode: 'read' | 'create' | 'update'): OAPI.SchemaObject {
        const fields = model.fields.filter((f) => !AUXILIARY_FIELDS.includes(f.name) && !isIdField(f));

        const attributes: Record<string, OAPI.SchemaObject> = {};
        const relationships: Record<string, OAPI.ReferenceObject> = {};

        const required: string[] = [];

        for (const field of fields) {
            if (isRelationshipField(field)) {
                let relType: string;
                if (mode === 'create' || mode === 'update') {
                    relType = field.type.array ? '_toManyRelationship' : '_toOneRelationship';
                } else {
                    relType = field.type.array ? '_toManyRelationshipWithLinks' : '_toOneRelationshipWithLinks';
                }
                relationships[field.name] = this.ref(relType);
            } else {
                attributes[field.name] = this.generateField(field);
                if (
                    mode === 'create' &&
                    !field.type.optional &&
                    !hasAttribute(field, '@default') &&
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
            description: `The "${model.name}" model`,
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

    private generateField(field: DataModelField) {
        return this.wrapArray(this.fieldTypeToOpenAPISchema(field.type), field.type.array);
    }

    private get specVersion() {
        return this.getOption('specVersion', '3.0.0');
    }

    private fieldTypeToOpenAPISchema(type: DataModelFieldType): OAPI.ReferenceObject | OAPI.SchemaObject {
        switch (type.type) {
            case 'String':
                return { type: 'string' };
            case 'Int':
            case 'BigInt':
                return { type: 'integer' };
            case 'Float':
                return { type: 'number' };
            case 'Decimal':
                return this.oneOf({ type: 'number' }, { type: 'string' });
            case 'Boolean':
                return { type: 'boolean' };
            case 'DateTime':
                return { type: 'string', format: 'date-time' };
            case 'Bytes':
                return { type: 'string', format: 'byte' };
            case 'Json':
                return {};
            default: {
                const fieldDecl = type.reference?.ref;
                invariant(fieldDecl);
                return this.ref(fieldDecl?.name);
            }
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
            description: 'Request is forbidden',
            content: {
                'application/vnd.api+json': {
                    schema: this.ref('_errorResponse'),
                },
            },
        };
    }

    private notFound() {
        return {
            description: 'Resource is not found',
            content: {
                'application/vnd.api+json': {
                    schema: this.ref('_errorResponse'),
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
