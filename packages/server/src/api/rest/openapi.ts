import { lowerCaseFirst } from '@zenstackhq/common-helpers';
import type { AttributeApplication, EnumDef, FieldDef, ModelDef, SchemaDef, TypeDefDef } from '@zenstackhq/orm/schema';
import type { OpenAPIV3_1 } from 'openapi-types';
import { PROCEDURE_ROUTE_PREFIXES } from '../common/procedures';
import {
    getIncludedModels,
    getMetaDescription,
    isFieldOmitted,
    isFilterKindIncluded,
    isModelIncluded,
    isOperationIncluded,
    isProcedureIncluded,
} from '../common/spec-utils';
import type { OpenApiSpecOptions } from '../common/types';
import type { RestApiHandlerOptions } from '.';

type SchemaObject = OpenAPIV3_1.SchemaObject;
type ReferenceObject = OpenAPIV3_1.ReferenceObject;
type ParameterObject = OpenAPIV3_1.ParameterObject;

function errorResponse(description: string): OpenAPIV3_1.ResponseObject {
    return {
        description,
        content: {
            'application/vnd.api+json': {
                schema: { $ref: '#/components/schemas/_errorResponse' },
            },
        },
    };
}

const ERROR_400 = errorResponse('Error occurred while processing the request');
const ERROR_403 = errorResponse('Forbidden: insufficient permissions to perform this operation');
const ERROR_404 = errorResponse('Resource not found');
const ERROR_422 = errorResponse('Operation is unprocessable due to validation errors');

const SCALAR_STRING_OPS = ['$contains', '$icontains', '$search', '$startsWith', '$endsWith'];
const SCALAR_COMPARABLE_OPS = ['$lt', '$lte', '$gt', '$gte'];
const SCALAR_ARRAY_OPS = ['$has', '$hasEvery', '$hasSome', '$isEmpty'];

export class RestApiSpecGenerator<Schema extends SchemaDef = SchemaDef> {
    private specOptions?: OpenApiSpecOptions;

    constructor(private readonly handlerOptions: RestApiHandlerOptions<Schema>) {}

    private get schema(): SchemaDef {
        return this.handlerOptions.schema;
    }

    private get modelNameMapping(): Record<string, string> {
        const mapping: Record<string, string> = {};
        if (this.handlerOptions.modelNameMapping) {
            for (const [k, v] of Object.entries(this.handlerOptions.modelNameMapping)) {
                mapping[lowerCaseFirst(k)] = v;
            }
        }
        return mapping;
    }

    private get queryOptions() {
        return this.handlerOptions?.queryOptions;
    }

    private get nestedRoutes(): boolean {
        return this.handlerOptions.nestedRoutes ?? false;
    }

    generateSpec(options?: OpenApiSpecOptions): OpenAPIV3_1.Document {
        this.specOptions = options;
        return {
            openapi: '3.1.0',
            info: {
                title: options?.title ?? 'ZenStack Generated API',
                version: options?.version ?? '1.0.0',
                ...(options?.description && { description: options.description }),
                ...(options?.summary && { summary: options.summary }),
            },
            tags: this.generateTags(),
            paths: this.generatePaths(),
            components: {
                schemas: this.generateSchemas(),
                parameters: this.generateSharedParams(),
            },
        } as OpenAPIV3_1.Document;
    }

    private generateTags(): OpenAPIV3_1.TagObject[] {
        return getIncludedModels(this.schema, this.queryOptions).map((modelName) => ({
            name: lowerCaseFirst(modelName),
            description: `${modelName} operations`,
        }));
    }

    private getModelPath(modelName: string): string {
        const lower = lowerCaseFirst(modelName);
        return this.modelNameMapping[lower] ?? lower;
    }

    private generatePaths(): OpenAPIV3_1.PathsObject {
        const paths: OpenAPIV3_1.PathsObject = {};

        for (const modelName of getIncludedModels(this.schema, this.queryOptions)) {
            const modelDef = this.schema.models[modelName]!;
            const idFields = this.getIdFields(modelDef);
            if (idFields.length === 0) continue;

            const modelPath = this.getModelPath(modelName);
            const tag = lowerCaseFirst(modelName);

            // Collection: GET (list) + POST (create)
            const collectionPath = this.buildCollectionPath(modelName, modelDef, tag);
            if (Object.keys(collectionPath).length > 0) {
                paths[`/${modelPath}`] = collectionPath;
            }

            // Single resource: GET + PATCH + DELETE
            const singlePath = this.buildSinglePath(modelDef, tag);
            if (Object.keys(singlePath).length > 0) {
                paths[`/${modelPath}/{id}`] = singlePath;
            }

            // Relation paths
            for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
                if (!fieldDef.relation) continue;
                if (!isModelIncluded(fieldDef.type, this.queryOptions)) continue;
                const relModelDef = this.schema.models[fieldDef.type];
                if (!relModelDef) continue;
                const relIdFields = this.getIdFields(relModelDef);
                if (relIdFields.length === 0) continue;

                // GET /{model}/{id}/{field} — fetch related (+ nested create/update when nestedRoutes enabled)
                paths[`/${modelPath}/{id}/${fieldName}`] = this.buildRelatedPath(
                    modelName,
                    fieldName,
                    fieldDef,
                    tag,
                );

                // Nested single resource path: /{model}/{id}/{field}/{childId}
                if (this.nestedRoutes && fieldDef.array) {
                    const nestedSinglePath = this.buildNestedSinglePath(
                        modelName,
                        fieldName,
                        fieldDef,
                        relModelDef,
                        tag,
                    );
                    if (Object.keys(nestedSinglePath).length > 0) {
                        paths[`/${modelPath}/{id}/${fieldName}/{childId}`] = nestedSinglePath;
                    }
                }

                // Relationship management path
                paths[`/${modelPath}/{id}/relationships/${fieldName}`] = this.buildRelationshipPath(
                    modelDef,
                    fieldName,
                    fieldDef,
                    tag,
                );
            }
        }

        // Procedure paths
        if (this.schema.procedures) {
            for (const [procName, procDef] of Object.entries(this.schema.procedures)) {
                if (!isProcedureIncluded(procName, this.queryOptions)) continue;
                const isMutation = !!procDef.mutation;
                if (isMutation) {
                    paths[`/${PROCEDURE_ROUTE_PREFIXES}/${procName}`] = {
                        post: this.buildProcedureOperation(procName, 'post'),
                    } as OpenAPIV3_1.PathItemObject;
                } else {
                    paths[`/${PROCEDURE_ROUTE_PREFIXES}/${procName}`] = {
                        get: this.buildProcedureOperation(procName, 'get'),
                    } as OpenAPIV3_1.PathItemObject;
                }
            }
        }

        return paths;
    }

    private buildCollectionPath(modelName: string, modelDef: ModelDef, tag: string): Record<string, any> {
        const filterParams = this.buildFilterParams(modelName, modelDef);

        const listOp = {
            tags: [tag],
            summary: `List ${modelName} resources`,
            operationId: `list${modelName}`,
            parameters: [
                { $ref: '#/components/parameters/include' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/pageOffset' },
                { $ref: '#/components/parameters/pageLimit' },
                ...filterParams,
            ],
            responses: {
                '200': {
                    description: `List of ${modelName} resources`,
                    content: {
                        'application/vnd.api+json': {
                            schema: { $ref: `#/components/schemas/${modelName}ListResponse` },
                        },
                    },
                },
                '400': ERROR_400,
            },
        };

        const createOp = {
            tags: [tag],
            summary: `Create a ${modelName} resource`,
            operationId: `create${modelName}`,
            requestBody: {
                required: true,
                content: {
                    'application/vnd.api+json': {
                        schema: { $ref: `#/components/schemas/${modelName}CreateRequest` },
                    },
                },
            },
            responses: {
                '201': {
                    description: `Created ${modelName} resource`,
                    content: {
                        'application/vnd.api+json': {
                            schema: { $ref: `#/components/schemas/${modelName}Response` },
                        },
                    },
                },
                '400': ERROR_400,
                ...(this.mayDenyAccess(modelDef, 'create') && { '403': ERROR_403 }),
                '422': ERROR_422,
            },
        };

        const result: Record<string, any> = {};
        if (isOperationIncluded(modelName, 'findMany', this.queryOptions)) {
            result['get'] = listOp;
        }
        if (isOperationIncluded(modelName, 'create', this.queryOptions)) {
            result['post'] = createOp;
        }
        return result;
    }

    private buildSinglePath(modelDef: ModelDef, tag: string): Record<string, any> {
        const modelName = modelDef.name;
        const idParam = { $ref: '#/components/parameters/id' };
        const result: Record<string, any> = {};

        if (isOperationIncluded(modelName, 'findUnique', this.queryOptions)) {
            result['get'] = {
                tags: [tag],
                summary: `Get a ${modelName} resource by ID`,
                operationId: `get${modelName}`,
                parameters: [idParam, { $ref: '#/components/parameters/include' }],
                responses: {
                    '200': {
                        description: `${modelName} resource`,
                        content: {
                            'application/vnd.api+json': {
                                schema: { $ref: `#/components/schemas/${modelName}Response` },
                            },
                        },
                    },
                    '404': ERROR_404,
                },
            };
        }

        if (isOperationIncluded(modelName, 'update', this.queryOptions)) {
            result['patch'] = {
                tags: [tag],
                summary: `Update a ${modelName} resource`,
                operationId: `update${modelName}`,
                parameters: [idParam],
                requestBody: {
                    required: true,
                    content: {
                        'application/vnd.api+json': {
                            schema: { $ref: `#/components/schemas/${modelName}UpdateRequest` },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: `Updated ${modelName} resource`,
                        content: {
                            'application/vnd.api+json': {
                                schema: { $ref: `#/components/schemas/${modelName}Response` },
                            },
                        },
                    },
                    '400': ERROR_400,
                    ...(this.mayDenyAccess(modelDef, 'update') && { '403': ERROR_403 }),
                    '404': ERROR_404,
                    '422': ERROR_422,
                },
            };
        }

        if (isOperationIncluded(modelName, 'delete', this.queryOptions)) {
            result['delete'] = {
                tags: [tag],
                summary: `Delete a ${modelName} resource`,
                operationId: `delete${modelName}`,
                parameters: [idParam],
                responses: {
                    '200': { description: 'Deleted successfully' },
                    ...(this.mayDenyAccess(modelDef, 'delete') && { '403': ERROR_403 }),
                    '404': ERROR_404,
                },
            };
        }

        return result;
    }

    private buildRelatedPath(
        modelName: string,
        fieldName: string,
        fieldDef: FieldDef,
        tag: string,
    ): Record<string, any> {
        const isCollection = !!fieldDef.array;
        const relModelDef = this.schema.models[fieldDef.type];
        const params: any[] = [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/include' }];

        if (isCollection && relModelDef) {
            params.push(
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/pageOffset' },
                { $ref: '#/components/parameters/pageLimit' },
                ...this.buildFilterParams(fieldDef.type, relModelDef),
            );
        }

        const pathItem: Record<string, any> = {
            get: {
                tags: [tag],
                summary: `Fetch related ${fieldDef.type} for ${modelName}`,
                operationId: `get${modelName}_${fieldName}`,
                parameters: params,
                responses: {
                    '200': {
                        description: `Related ${fieldDef.type} resource(s)`,
                        content: {
                            'application/vnd.api+json': {
                                schema: isCollection
                                    ? { $ref: `#/components/schemas/${fieldDef.type}ListResponse` }
                                    : { $ref: `#/components/schemas/${fieldDef.type}Response` },
                            },
                        },
                    },
                    '404': ERROR_404,
                },
            },
        };

        if (this.nestedRoutes && relModelDef) {
            const mayDeny = this.mayDenyAccess(relModelDef, isCollection ? 'create' : 'update');
            if (isCollection && isOperationIncluded(fieldDef.type, 'create', this.queryOptions)) {
                // POST /{model}/{id}/{field} — nested create
                pathItem['post'] = {
                    tags: [tag],
                    summary: `Create a nested ${fieldDef.type} under ${modelName}`,
                    operationId: `create${modelName}_${fieldName}`,
                    parameters: [{ $ref: '#/components/parameters/id' }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/vnd.api+json': {
                                schema: { $ref: `#/components/schemas/${fieldDef.type}CreateRequest` },
                            },
                        },
                    },
                    responses: {
                        '201': {
                            description: `Created ${fieldDef.type} resource`,
                            content: {
                                'application/vnd.api+json': {
                                    schema: { $ref: `#/components/schemas/${fieldDef.type}Response` },
                                },
                            },
                        },
                        '400': ERROR_400,
                        ...(mayDeny && { '403': ERROR_403 }),
                        '422': ERROR_422,
                    },
                };
            } else if (!isCollection && isOperationIncluded(fieldDef.type, 'update', this.queryOptions)) {
                // PATCH /{model}/{id}/{field} — nested to-one update
                pathItem['patch'] = {
                    tags: [tag],
                    summary: `Update nested ${fieldDef.type} under ${modelName}`,
                    operationId: `update${modelName}_${fieldName}`,
                    parameters: [{ $ref: '#/components/parameters/id' }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/vnd.api+json': {
                                schema: { $ref: `#/components/schemas/${fieldDef.type}UpdateRequest` },
                            },
                        },
                    },
                    responses: {
                        '200': {
                            description: `Updated ${fieldDef.type} resource`,
                            content: {
                                'application/vnd.api+json': {
                                    schema: { $ref: `#/components/schemas/${fieldDef.type}Response` },
                                },
                            },
                        },
                        '400': ERROR_400,
                        ...(mayDeny && { '403': ERROR_403 }),
                        '404': ERROR_404,
                        '422': ERROR_422,
                    },
                };
            }
        }

        return pathItem;
    }

    private buildNestedSinglePath(
        modelName: string,
        fieldName: string,
        fieldDef: FieldDef,
        relModelDef: ModelDef,
        tag: string,
    ): Record<string, any> {
        const childIdParam = { name: 'childId', in: 'path', required: true, schema: { type: 'string' } };
        const idParam = { $ref: '#/components/parameters/id' };
        const mayDenyUpdate = this.mayDenyAccess(relModelDef, 'update');
        const mayDenyDelete = this.mayDenyAccess(relModelDef, 'delete');
        const result: Record<string, any> = {};

        if (isOperationIncluded(fieldDef.type, 'findUnique', this.queryOptions)) {
            result['get'] = {
                tags: [tag],
                summary: `Get a nested ${fieldDef.type} by ID under ${modelName}`,
                operationId: `get${modelName}_${fieldName}_single`,
                parameters: [idParam, childIdParam, { $ref: '#/components/parameters/include' }],
                responses: {
                    '200': {
                        description: `${fieldDef.type} resource`,
                        content: {
                            'application/vnd.api+json': {
                                schema: { $ref: `#/components/schemas/${fieldDef.type}Response` },
                            },
                        },
                    },
                    '404': ERROR_404,
                },
            };
        }

        if (isOperationIncluded(fieldDef.type, 'update', this.queryOptions)) {
            result['patch'] = {
                tags: [tag],
                summary: `Update a nested ${fieldDef.type} by ID under ${modelName}`,
                operationId: `update${modelName}_${fieldName}_single`,
                parameters: [idParam, childIdParam],
                requestBody: {
                    required: true,
                    content: {
                        'application/vnd.api+json': {
                            schema: { $ref: `#/components/schemas/${fieldDef.type}UpdateRequest` },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: `Updated ${fieldDef.type} resource`,
                        content: {
                            'application/vnd.api+json': {
                                schema: { $ref: `#/components/schemas/${fieldDef.type}Response` },
                            },
                        },
                    },
                    '400': ERROR_400,
                    ...(mayDenyUpdate && { '403': ERROR_403 }),
                    '404': ERROR_404,
                    '422': ERROR_422,
                },
            };
        }

        if (isOperationIncluded(fieldDef.type, 'delete', this.queryOptions)) {
            result['delete'] = {
                tags: [tag],
                summary: `Delete a nested ${fieldDef.type} by ID under ${modelName}`,
                operationId: `delete${modelName}_${fieldName}_single`,
                parameters: [idParam, childIdParam],
                responses: {
                    '200': { description: 'Deleted successfully' },
                    ...(mayDenyDelete && { '403': ERROR_403 }),
                    '404': ERROR_404,
                },
            };
        }

        return result;
    }

    private buildRelationshipPath(
        modelDef: ModelDef,
        fieldName: string,
        fieldDef: FieldDef,
        tag: string,
    ): Record<string, any> {
        const modelName = modelDef.name;
        const isCollection = !!fieldDef.array;
        const idParam = { $ref: '#/components/parameters/id' };
        const relSchemaRef = isCollection
            ? { $ref: '#/components/schemas/_toManyRelationshipWithLinks' }
            : { $ref: '#/components/schemas/_toOneRelationshipWithLinks' };

        const relRequestRef = isCollection
            ? { $ref: '#/components/schemas/_toManyRelationshipRequest' }
            : { $ref: '#/components/schemas/_toOneRelationshipRequest' };

        const mayDeny = this.mayDenyAccess(modelDef, 'update');

        const pathItem: Record<string, any> = {
            get: {
                tags: [tag],
                summary: `Fetch ${fieldName} relationship`,
                operationId: `get${modelName}_relationships_${fieldName}`,
                parameters: [idParam],
                responses: {
                    '200': {
                        description: `${fieldName} relationship`,
                        content: { 'application/vnd.api+json': { schema: relSchemaRef } },
                    },
                    '404': ERROR_404,
                },
            },
            put: {
                tags: [tag],
                summary: `Replace ${fieldName} relationship`,
                operationId: `put${modelName}_relationships_${fieldName}`,
                parameters: [idParam],
                requestBody: {
                    required: true,
                    content: { 'application/vnd.api+json': { schema: relRequestRef } },
                },
                responses: {
                    '200': { description: 'Relationship updated' },
                    '400': ERROR_400,
                    ...(mayDeny && { '403': ERROR_403 }),
                },
            },
            patch: {
                tags: [tag],
                summary: `Update ${fieldName} relationship`,
                operationId: `patch${modelName}_relationships_${fieldName}`,
                parameters: [idParam],
                requestBody: {
                    required: true,
                    content: { 'application/vnd.api+json': { schema: relRequestRef } },
                },
                responses: {
                    '200': { description: 'Relationship updated' },
                    '400': ERROR_400,
                    ...(mayDeny && { '403': ERROR_403 }),
                },
            },
        };

        if (isCollection) {
            pathItem['post'] = {
                tags: [tag],
                summary: `Add to ${fieldName} collection relationship`,
                operationId: `post${modelName}_relationships_${fieldName}`,
                parameters: [idParam],
                requestBody: {
                    required: true,
                    content: {
                        'application/vnd.api+json': {
                            schema: { $ref: '#/components/schemas/_toManyRelationshipRequest' },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Added to relationship collection' },
                    '400': ERROR_400,
                    ...(mayDeny && { '403': ERROR_403 }),
                },
            };
        }

        return pathItem;
    }

    private buildProcedureOperation(procName: string, method: 'get' | 'post'): Record<string, any> {
        const op: Record<string, any> = {
            tags: ['$procs'],
            summary: `Execute procedure ${procName}`,
            operationId: `proc_${procName}`,
            responses: {
                '200': { description: `Result of ${procName}` },
                '400': ERROR_400,
            },
        };

        if (method === 'get') {
            op['parameters'] = [
                {
                    name: 'q',
                    in: 'query',
                    description: 'Procedure arguments as JSON',
                    schema: { type: 'string' },
                },
            ];
        } else {
            op['requestBody'] = {
                content: {
                    'application/json': {
                        schema: { type: 'object' },
                    },
                },
            };
        }

        return op;
    }

    private buildFilterParams(modelName: string, modelDef: ModelDef): ParameterObject[] {
        const params: ParameterObject[] = [];
        const idFieldNames = new Set(modelDef.idFields);

        // id filter (Equality kind)
        if (isFilterKindIncluded(modelName, 'id', 'Equality', this.queryOptions)) {
            params.push({
                name: 'filter[id]',
                in: 'query',
                schema: { type: 'string' },
                description: `Filter by ${modelName} ID`,
            });
        }

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.relation) continue;
            if (idFieldNames.has(fieldName)) continue;

            const type = fieldDef.type;

            // Equality filter
            if (isFilterKindIncluded(modelName, fieldName, 'Equality', this.queryOptions)) {
                params.push({
                    name: `filter[${fieldName}]`,
                    in: 'query',
                    schema: { type: 'string' },
                    description: `Filter by ${fieldName}`,
                });
            }

            if (type === 'String' && isFilterKindIncluded(modelName, fieldName, 'Like', this.queryOptions)) {
                for (const op of SCALAR_STRING_OPS) {
                    params.push({
                        name: `filter[${fieldName}][${op}]`,
                        in: 'query',
                        schema: { type: 'string' },
                    });
                }
            } else if (
                (type === 'Int' ||
                    type === 'Float' ||
                    type === 'BigInt' ||
                    type === 'Decimal' ||
                    type === 'DateTime') &&
                isFilterKindIncluded(modelName, fieldName, 'Range', this.queryOptions)
            ) {
                for (const op of SCALAR_COMPARABLE_OPS) {
                    params.push({
                        name: `filter[${fieldName}][${op}]`,
                        in: 'query',
                        schema: { type: 'string' },
                    });
                }
            }

            if (fieldDef.array && isFilterKindIncluded(modelName, fieldName, 'List', this.queryOptions)) {
                for (const op of SCALAR_ARRAY_OPS) {
                    params.push({
                        name: `filter[${fieldName}][${op}]`,
                        in: 'query',
                        schema: { type: 'string' },
                    });
                }
            }
        }

        return params;
    }

    private generateSchemas(): Record<string, SchemaObject | ReferenceObject> {
        const schemas: Record<string, SchemaObject | ReferenceObject> = {};

        // Shared JSON:API components
        Object.assign(schemas, this.buildSharedSchemas());

        // Per-enum schemas
        if (this.schema.enums) {
            for (const [_enumName, enumDef] of Object.entries(this.schema.enums)) {
                schemas[_enumName] = this.buildEnumSchema(enumDef);
            }
        }

        // Per-typeDef schemas
        if (this.schema.typeDefs) {
            for (const [typeName, typeDef] of Object.entries(this.schema.typeDefs)) {
                schemas[typeName] = this.buildTypeDefSchema(typeDef);
            }
        }

        // Per-model schemas
        for (const modelName of getIncludedModels(this.schema, this.queryOptions)) {
            const modelDef = this.schema.models[modelName]!;
            const idFields = this.getIdFields(modelDef);
            if (idFields.length === 0) continue;

            schemas[modelName] = this.buildModelReadSchema(modelName, modelDef);
            schemas[`${modelName}CreateRequest`] = this.buildCreateRequestSchema(modelName, modelDef);
            schemas[`${modelName}UpdateRequest`] = this.buildUpdateRequestSchema(modelDef);
            schemas[`${modelName}Response`] = this.buildModelResponseSchema(modelName);
            schemas[`${modelName}ListResponse`] = this.buildModelListResponseSchema(modelName);
        }

        return schemas;
    }

    private buildSharedSchemas(): Record<string, SchemaObject> {
        const nullableString: SchemaObject = { oneOf: [{ type: 'string' }, { type: 'null' }] };
        return {
            _jsonapi: {
                type: 'object',
                properties: {
                    version: { type: 'string' },
                    meta: { type: 'object' },
                },
            },
            _meta: {
                type: 'object',
                additionalProperties: true,
            },
            _links: {
                type: 'object',
                properties: {
                    self: { type: 'string' },
                    related: { type: 'string' },
                },
            },
            _pagination: {
                type: 'object',
                properties: {
                    first: nullableString,
                    last: nullableString,
                    prev: nullableString,
                    next: nullableString,
                },
            },
            _errors: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        status: { type: 'integer' },
                        code: { type: 'string' },
                        title: { type: 'string' },
                        detail: { type: 'string' },
                    },
                    required: ['status', 'title'],
                },
            },
            _errorResponse: {
                type: 'object',
                properties: {
                    errors: { $ref: '#/components/schemas/_errors' },
                },
                required: ['errors'],
            },
            _resourceIdentifier: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    id: { type: 'string' },
                },
                required: ['type', 'id'],
            },
            _resource: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    id: { type: 'string' },
                    attributes: { type: 'object' },
                    relationships: { type: 'object' },
                    links: { $ref: '#/components/schemas/_links' },
                    meta: { $ref: '#/components/schemas/_meta' },
                },
                required: ['type', 'id'],
            },
            _relationLinks: {
                type: 'object',
                properties: {
                    self: { type: 'string' },
                    related: { type: 'string' },
                },
            },
            _pagedRelationLinks: {
                type: 'object',
                allOf: [{ $ref: '#/components/schemas/_relationLinks' }, { $ref: '#/components/schemas/_pagination' }],
            },
            _toOneRelationship: {
                type: 'object',
                properties: {
                    data: {
                        oneOf: [{ $ref: '#/components/schemas/_resourceIdentifier' }, { type: 'null' }],
                    },
                },
            },
            _toManyRelationship: {
                type: 'object',
                properties: {
                    data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/_resourceIdentifier' },
                    },
                },
            },
            _toOneRelationshipWithLinks: {
                type: 'object',
                allOf: [
                    { $ref: '#/components/schemas/_toOneRelationship' },
                    {
                        properties: {
                            links: { $ref: '#/components/schemas/_relationLinks' },
                        },
                    },
                ],
            },
            _toManyRelationshipWithLinks: {
                type: 'object',
                allOf: [
                    { $ref: '#/components/schemas/_toManyRelationship' },
                    {
                        properties: {
                            links: { $ref: '#/components/schemas/_pagedRelationLinks' },
                        },
                    },
                ],
            },
            _toManyRelationshipRequest: {
                type: 'object',
                properties: {
                    data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/_resourceIdentifier' },
                    },
                },
                required: ['data'],
            },
            _toOneRelationshipRequest: {
                type: 'object',
                properties: {
                    data: {
                        oneOf: [{ $ref: '#/components/schemas/_resourceIdentifier' }, { type: 'null' }],
                    },
                },
                required: ['data'],
            },
            _toManyRelationshipResponse: {
                type: 'object',
                properties: {
                    data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/_resourceIdentifier' },
                    },
                    links: { $ref: '#/components/schemas/_pagedRelationLinks' },
                    meta: { $ref: '#/components/schemas/_meta' },
                },
            },
            _toOneRelationshipResponse: {
                type: 'object',
                properties: {
                    data: {
                        oneOf: [{ $ref: '#/components/schemas/_resourceIdentifier' }, { type: 'null' }],
                    },
                    links: { $ref: '#/components/schemas/_relationLinks' },
                    meta: { $ref: '#/components/schemas/_meta' },
                },
            },
        };
    }

    private buildEnumSchema(enumDef: EnumDef): SchemaObject {
        return {
            type: 'string',
            enum: Object.values(enumDef.values),
        };
    }

    private buildTypeDefSchema(typeDef: TypeDefDef): SchemaObject {
        const properties: Record<string, SchemaObject | ReferenceObject> = {};
        const required: string[] = [];

        for (const [fieldName, fieldDef] of Object.entries(typeDef.fields)) {
            properties[fieldName] = this.fieldToSchema(fieldDef);
            if (!fieldDef.optional && !fieldDef.array) {
                required.push(fieldName);
            }
        }

        const result: SchemaObject = { type: 'object', properties };
        if (required.length > 0) {
            result.required = required;
        }
        return result;
    }

    private buildModelReadSchema(modelName: string, modelDef: ModelDef): SchemaObject {
        const attrProperties: Record<string, SchemaObject | ReferenceObject> = {};
        const attrRequired: string[] = [];
        const relProperties: Record<string, SchemaObject | ReferenceObject> = {};

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.omit) continue;
            if (isFieldOmitted(modelName, fieldName, this.queryOptions)) continue;
            if (fieldDef.relation && !isModelIncluded(fieldDef.type, this.queryOptions)) continue;

            if (fieldDef.relation) {
                const relRef: SchemaObject | ReferenceObject = fieldDef.array
                    ? { $ref: '#/components/schemas/_toManyRelationshipWithLinks' }
                    : { $ref: '#/components/schemas/_toOneRelationshipWithLinks' };
                relProperties[fieldName] = fieldDef.optional ? { oneOf: [{ type: 'null' }, relRef] } : relRef;
            } else {
                const schema = this.fieldToSchema(fieldDef);
                const fieldDescription = getMetaDescription(fieldDef.attributes);
                if (fieldDescription && !('$ref' in schema)) {
                    schema.description = fieldDescription;
                }
                attrProperties[fieldName] = schema;

                if (!fieldDef.optional && !fieldDef.array) {
                    attrRequired.push(fieldName);
                }
            }
        }

        const properties: Record<string, SchemaObject | ReferenceObject> = {};

        if (Object.keys(attrProperties).length > 0) {
            const attrSchema: SchemaObject = { type: 'object', properties: attrProperties };
            if (attrRequired.length > 0) attrSchema.required = attrRequired;
            properties['attributes'] = attrSchema;
        }

        if (Object.keys(relProperties).length > 0) {
            properties['relationships'] = { type: 'object', properties: relProperties };
        }

        const result: SchemaObject = { type: 'object', properties };
        const description = getMetaDescription(modelDef.attributes);
        if (description) {
            result.description = description;
        }
        return result;
    }

    private buildCreateRequestSchema(_modelName: string, modelDef: ModelDef): SchemaObject {
        const idFieldNames = new Set(modelDef.idFields);
        const attributes: Record<string, SchemaObject | ReferenceObject> = {};
        const attrRequired: string[] = [];
        const relationships: Record<string, SchemaObject | ReferenceObject> = {};

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.updatedAt) continue;
            if (fieldDef.foreignKeyFor) continue;
            // Skip auto-generated id fields
            if (idFieldNames.has(fieldName) && fieldDef.default !== undefined) continue;
            if (fieldDef.relation && !isModelIncluded(fieldDef.type, this.queryOptions)) continue;

            if (fieldDef.relation) {
                relationships[fieldName] = fieldDef.array
                    ? {
                          type: 'object',
                          properties: {
                              data: {
                                  type: 'array',
                                  items: { $ref: '#/components/schemas/_resourceIdentifier' },
                              },
                          },
                      }
                    : {
                          type: 'object',
                          properties: {
                              data: { $ref: '#/components/schemas/_resourceIdentifier' },
                          },
                      };
            } else {
                attributes[fieldName] = this.fieldToSchema(fieldDef);
                if (!fieldDef.optional && fieldDef.default === undefined && !fieldDef.array) {
                    attrRequired.push(fieldName);
                }
            }
        }

        const dataProperties: Record<string, SchemaObject | ReferenceObject> = {
            type: { type: 'string' },
        };

        if (Object.keys(attributes).length > 0) {
            const attrSchema: SchemaObject = { type: 'object', properties: attributes };
            if (attrRequired.length > 0) attrSchema.required = attrRequired;
            dataProperties['attributes'] = attrSchema;
        }

        if (Object.keys(relationships).length > 0) {
            dataProperties['relationships'] = { type: 'object', properties: relationships };
        }

        return {
            type: 'object',
            properties: {
                data: {
                    type: 'object',
                    properties: dataProperties,
                    required: ['type'],
                },
            },
            required: ['data'],
        };
    }

    private buildUpdateRequestSchema(modelDef: ModelDef): SchemaObject {
        const attributes: Record<string, SchemaObject | ReferenceObject> = {};
        const relationships: Record<string, SchemaObject | ReferenceObject> = {};

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.updatedAt) continue;
            if (fieldDef.foreignKeyFor) continue;
            if (fieldDef.relation && !isModelIncluded(fieldDef.type, this.queryOptions)) continue;

            if (fieldDef.relation) {
                relationships[fieldName] = fieldDef.array
                    ? {
                          type: 'object',
                          properties: {
                              data: {
                                  type: 'array',
                                  items: { $ref: '#/components/schemas/_resourceIdentifier' },
                              },
                          },
                      }
                    : {
                          type: 'object',
                          properties: {
                              data: { $ref: '#/components/schemas/_resourceIdentifier' },
                          },
                      };
            } else {
                attributes[fieldName] = this.fieldToSchema(fieldDef);
            }
        }

        const dataProperties: Record<string, SchemaObject | ReferenceObject> = {
            type: { type: 'string' },
            id: { type: 'string' },
        };

        if (Object.keys(attributes).length > 0) {
            dataProperties['attributes'] = { type: 'object', properties: attributes };
        }

        if (Object.keys(relationships).length > 0) {
            dataProperties['relationships'] = { type: 'object', properties: relationships };
        }

        return {
            type: 'object',
            properties: {
                data: {
                    type: 'object',
                    properties: dataProperties,
                    required: ['type', 'id'],
                },
            },
            required: ['data'],
        };
    }

    private buildModelResponseSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                jsonapi: { $ref: '#/components/schemas/_jsonapi' },
                data: {
                    allOf: [{ $ref: `#/components/schemas/${modelName}` }, { $ref: '#/components/schemas/_resource' }],
                },
                meta: { $ref: '#/components/schemas/_meta' },
            },
        };
    }

    private buildModelListResponseSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                jsonapi: { $ref: '#/components/schemas/_jsonapi' },
                data: {
                    type: 'array',
                    items: {
                        allOf: [
                            { $ref: `#/components/schemas/${modelName}` },
                            { $ref: '#/components/schemas/_resource' },
                        ],
                    },
                },
                links: {
                    allOf: [{ $ref: '#/components/schemas/_pagination' }, { $ref: '#/components/schemas/_links' }],
                },
                meta: { $ref: '#/components/schemas/_meta' },
            },
        };
    }

    private generateSharedParams(): Record<string, ParameterObject> {
        return {
            id: {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Resource ID',
            },
            include: {
                name: 'include',
                in: 'query',
                schema: { type: 'string' },
                description: 'Comma-separated list of relationships to include',
            },
            sort: {
                name: 'sort',
                in: 'query',
                schema: { type: 'string' },
                description: 'Comma-separated list of fields to sort by. Prefix with - for descending',
            },
            pageOffset: {
                name: 'page[offset]',
                in: 'query',
                schema: { type: 'integer', minimum: 0 },
                description: 'Page offset',
            },
            pageLimit: {
                name: 'page[limit]',
                in: 'query',
                schema: { type: 'integer', minimum: 1 },
                description: 'Page limit',
            },
        };
    }

    private fieldToSchema(fieldDef: FieldDef): SchemaObject | ReferenceObject {
        const baseSchema = this.typeToSchema(fieldDef.type);
        if (fieldDef.array) {
            return { type: 'array', items: baseSchema };
        }
        if (fieldDef.optional) {
            return { oneOf: [baseSchema, { type: 'null' }] };
        }
        return baseSchema;
    }

    private typeToSchema(type: string): SchemaObject | ReferenceObject {
        switch (type) {
            case 'String':
                return { type: 'string' };
            case 'Int':
            case 'BigInt':
                return { type: 'integer' };
            case 'Float':
                return { type: 'number' };
            case 'Decimal':
                return { oneOf: [{ type: 'number' }, { type: 'string' }] };
            case 'Boolean':
                return { type: 'boolean' };
            case 'DateTime':
                return { type: 'string', format: 'date-time' };
            case 'Bytes':
                return { type: 'string', format: 'byte' };
            case 'Json':
            case 'Unsupported':
                return {};
            default:
                return { $ref: `#/components/schemas/${type}` };
        }
    }

    private getIdFields(modelDef: ModelDef): FieldDef[] {
        return modelDef.idFields.map((name) => modelDef.fields[name]).filter((f): f is FieldDef => f !== undefined);
    }

    /**
     * Checks if an operation on a model may be denied by access policies.
     * Returns true when `respectAccessPolicies` is enabled and the model's
     * policies for the given operation are NOT a constant allow (i.e., not
     * simply `@@allow('...', true)` with no `@@deny` rules).
     */
    private mayDenyAccess(modelDef: ModelDef, operation: string): boolean {
        if (!this.specOptions?.respectAccessPolicies) return false;

        const policyAttrs = (modelDef.attributes ?? []).filter(
            (attr) => attr.name === '@@allow' || attr.name === '@@deny',
        );

        // No policy rules at all means default-deny
        if (policyAttrs.length === 0) return true;

        const getArgByName = (args: AttributeApplication['args'], name: string) =>
            args?.find((a) => a.name === name)?.value;

        const matchesOperation = (args: AttributeApplication['args']) => {
            const val = getArgByName(args, 'operation');
            if (!val || val.kind !== 'literal' || typeof val.value !== 'string') return false;
            const ops = val.value.split(',').map((s) => s.trim());
            return ops.includes(operation) || ops.includes('all');
        };

        const hasEffectiveDeny = policyAttrs.some((attr) => {
            if (attr.name !== '@@deny' || !matchesOperation(attr.args)) return false;
            const condition = getArgByName(attr.args, 'condition');
            // @@deny('op', false) is a no-op — skip it
            return !(condition?.kind === 'literal' && condition.value === false);
        });
        if (hasEffectiveDeny) return true;

        const relevantAllow = policyAttrs.filter(
            (attr) => attr.name === '@@allow' && matchesOperation(attr.args),
        );

        // If any allow rule has a constant `true` condition (and no deny), access is unconditional
        const hasConstantAllow = relevantAllow.some((attr) => {
            const condition = getArgByName(attr.args, 'condition');
            return condition?.kind === 'literal' && condition.value === true;
        });

        return !hasConstantAllow;
    }
}
