import { lowerCaseFirst, upperCaseFirst } from '@zenstackhq/common-helpers';
import type { EnumDef, FieldDef, ModelDef, SchemaDef } from '@zenstackhq/orm/schema';
import type { OpenAPIV3_1 } from 'openapi-types';
import type { RPCApiHandlerOptions } from '.';
import { PROCEDURE_ROUTE_PREFIXES } from '../common/procedures';
import {
    getIncludedModels,
    isFieldOmitted,
    isFilterKindIncluded,
    isOperationIncluded,
    isProcedureIncluded,
} from '../common/spec-utils';
import type { OpenApiSpecOptions } from '../common/types';

type SchemaObject = OpenAPIV3_1.SchemaObject;
type ReferenceObject = OpenAPIV3_1.ReferenceObject;

/**
 * Generates OpenAPI v3.1 specification for the RPC-style CRUD API.
 */
export class RPCApiSpecGenerator<Schema extends SchemaDef = SchemaDef> {
    constructor(private readonly handlerOptions: RPCApiHandlerOptions<Schema>) {}

    private get schema(): SchemaDef {
        return this.handlerOptions.schema;
    }

    private get queryOptions() {
        return this.handlerOptions?.queryOptions;
    }

    generateSpec(options?: OpenApiSpecOptions): OpenAPIV3_1.Document {
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
            },
        } as OpenAPIV3_1.Document;
    }

    private generateTags(): OpenAPIV3_1.TagObject[] {
        return getIncludedModels(this.schema, this.queryOptions).map((modelName) => ({
            name: lowerCaseFirst(modelName),
            description: `${modelName} operations`,
        }));
    }

    private generatePaths(): OpenAPIV3_1.PathsObject {
        const paths: OpenAPIV3_1.PathsObject = {};

        for (const modelName of getIncludedModels(this.schema, this.queryOptions)) {
            const modelPath = lowerCaseFirst(modelName);
            const tag = modelPath;

            // Read operations (GET)
            const readOps = ['findMany', 'findUnique', 'findFirst', 'count', 'aggregate', 'groupBy', 'exists'];
            for (const op of readOps) {
                if (!isOperationIncluded(modelName, op, this.queryOptions)) continue;
                const argsSchemaName = `${modelName}${this.opToArgsSchema(op)}`;
                paths[`/${modelPath}/${op}`] = {
                    get: this.buildGetOperation(modelName, op, tag, argsSchemaName),
                } as any;
            }

            // Write operations
            const writeOps: Array<{ op: string; method: 'post' | 'patch' | 'delete' }> = [
                { op: 'create', method: 'post' },
                { op: 'createMany', method: 'post' },
                { op: 'createManyAndReturn', method: 'post' },
                { op: 'upsert', method: 'post' },
                { op: 'update', method: 'patch' },
                { op: 'updateMany', method: 'patch' },
                { op: 'updateManyAndReturn', method: 'patch' },
                { op: 'delete', method: 'delete' },
                { op: 'deleteMany', method: 'delete' },
            ];

            for (const { op, method } of writeOps) {
                if (!isOperationIncluded(modelName, op, this.queryOptions)) continue;
                const argsSchemaName = `${modelName}${this.opToArgsSchema(op)}`;
                const buildOp =
                    method === 'post'
                        ? this.buildPostOperation
                        : method === 'patch'
                          ? this.buildPatchOperation
                          : this.buildDeleteOperation;
                paths[`/${modelPath}/${op}`] = {
                    [method]: buildOp.call(this, modelName, op, tag, argsSchemaName),
                };
            }
        }

        // Transaction path
        paths['/$transaction/sequential'] = {
            post: {
                tags: ['$transaction'],
                summary: 'Execute a sequential transaction',
                operationId: 'transaction_sequential',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        model: { type: 'string' },
                                        op: { type: 'string' },
                                        args: { type: 'object' },
                                    },
                                    required: ['model', 'op'],
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Transaction results' },
                    '400': { $ref: '#/components/schemas/_ErrorResponse' },
                },
            },
        };

        // Procedure paths
        if (this.schema.procedures) {
            for (const [procName, procDef] of Object.entries(this.schema.procedures)) {
                if (!isProcedureIncluded(procName, this.queryOptions)) continue;

                const isMutation = !!procDef.mutation;
                const pathItem: Record<string, any> = {};

                if (isMutation) {
                    pathItem['post'] = this.buildProcedureOperation(procName, 'post');
                } else {
                    pathItem['get'] = this.buildProcedureOperation(procName, 'get');
                }

                paths[`/${PROCEDURE_ROUTE_PREFIXES}/${procName}`] = pathItem as any;
            }
        }

        return paths;
    }

    private opToArgsSchema(op: string): string {
        return upperCaseFirst(op) + 'Args';
    }

    private buildGetOperation(modelName: string, op: string, tag: string, argsSchemaName: string): Record<string, any> {
        return {
            tags: [tag],
            summary: `${op} ${modelName}`,
            operationId: `${lowerCaseFirst(modelName)}_${op}`,
            parameters: [
                {
                    name: 'q',
                    in: 'query',
                    description: `Arguments as JSON (${argsSchemaName})`,
                    schema: { type: 'string' },
                },
            ],
            responses: {
                '200': {
                    description: `Result of ${op}`,
                    content: {
                        'application/json': {
                            schema: { $ref: `#/components/schemas/${modelName}Response` },
                        },
                    },
                },
                '400': { $ref: '#/components/schemas/_ErrorResponse' },
            },
        };
    }

    private buildPostOperation(
        modelName: string,
        op: string,
        tag: string,
        argsSchemaName: string,
    ): Record<string, any> {
        return {
            tags: [tag],
            summary: `${op} ${modelName}`,
            operationId: `${lowerCaseFirst(modelName)}_${op}`,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: `#/components/schemas/${argsSchemaName}` },
                    },
                },
            },
            responses: {
                '201': {
                    description: `Result of ${op}`,
                    content: {
                        'application/json': {
                            schema: { $ref: `#/components/schemas/${modelName}Response` },
                        },
                    },
                },
                '400': { $ref: '#/components/schemas/_ErrorResponse' },
            },
        };
    }

    private buildPatchOperation(
        modelName: string,
        op: string,
        tag: string,
        argsSchemaName: string,
    ): Record<string, any> {
        return {
            tags: [tag],
            summary: `${op} ${modelName}`,
            operationId: `${lowerCaseFirst(modelName)}_${op}`,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: `#/components/schemas/${argsSchemaName}` },
                    },
                },
            },
            responses: {
                '200': {
                    description: `Result of ${op}`,
                    content: {
                        'application/json': {
                            schema: { $ref: `#/components/schemas/${modelName}Response` },
                        },
                    },
                },
                '400': { $ref: '#/components/schemas/_ErrorResponse' },
            },
        };
    }

    private buildDeleteOperation(
        modelName: string,
        op: string,
        tag: string,
        argsSchemaName: string,
    ): Record<string, any> {
        return {
            tags: [tag],
            summary: `${op} ${modelName}`,
            operationId: `${lowerCaseFirst(modelName)}_${op}`,
            parameters: [
                {
                    name: 'q',
                    in: 'query',
                    description: `Arguments as JSON (${argsSchemaName})`,
                    schema: { type: 'string' },
                },
            ],
            responses: {
                '200': {
                    description: `Result of ${op}`,
                    content: {
                        'application/json': {
                            schema: { $ref: `#/components/schemas/${modelName}Response` },
                        },
                    },
                },
                '400': { $ref: '#/components/schemas/_ErrorResponse' },
            },
        };
    }

    private buildProcedureOperation(procName: string, method: 'get' | 'post'): Record<string, any> {
        const op: Record<string, any> = {
            tags: [PROCEDURE_ROUTE_PREFIXES],
            summary: `Execute procedure ${procName}`,
            operationId: `proc_${procName}`,
            responses: {
                '200': { description: `Result of ${procName}` },
                '400': { $ref: '#/components/schemas/_ErrorResponse' },
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

    private generateSchemas(): Record<string, SchemaObject | ReferenceObject> {
        const schemas: Record<string, SchemaObject | ReferenceObject> = {};

        // Shared schemas
        schemas['_Meta'] = {
            type: 'object',
            properties: { serialization: {} },
        };
        schemas['_ErrorResponse'] = {
            type: 'object',
            properties: {
                error: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                    },
                },
            },
        };

        // Per-enum schemas
        if (this.schema.enums) {
            for (const [enumName, enumDef] of Object.entries(this.schema.enums)) {
                schemas[enumName] = this.buildEnumSchema(enumDef);
            }
        }

        // Per-model schemas
        for (const modelName of getIncludedModels(this.schema, this.queryOptions)) {
            const modelDef = this.schema.models[modelName]!;
            schemas[modelName] = this.buildModelOutputSchema(modelName, modelDef);
            schemas[`${modelName}CreateInput`] = this.buildCreateInputSchema(modelName, modelDef);
            schemas[`${modelName}UpdateInput`] = this.buildUpdateInputSchema(modelName, modelDef);
            schemas[`${modelName}WhereUniqueInput`] = this.buildWhereUniqueInputSchema(modelName, modelDef);
            schemas[`${modelName}WhereInput`] = this.buildWhereInputSchema(modelName, modelDef);
            schemas[`${modelName}CreateArgs`] = this.buildCreateArgsSchema(modelName);
            schemas[`${modelName}CreateManyArgs`] = this.buildCreateManyArgsSchema(modelName);
            schemas[`${modelName}UpdateArgs`] = this.buildUpdateArgsSchema(modelName);
            schemas[`${modelName}UpdateManyArgs`] = this.buildUpdateManyArgsSchema(modelName);
            schemas[`${modelName}UpsertArgs`] = this.buildUpsertArgsSchema(modelName);
            schemas[`${modelName}DeleteArgs`] = this.buildDeleteArgsSchema(modelName);
            schemas[`${modelName}DeleteManyArgs`] = this.buildDeleteManyArgsSchema(modelName);
            schemas[`${modelName}FindManyArgs`] = this.buildFindManyArgsSchema(modelName);
            schemas[`${modelName}FindUniqueArgs`] = this.buildFindUniqueArgsSchema(modelName);
            schemas[`${modelName}FindFirstArgs`] = this.buildFindFirstArgsSchema(modelName);
            schemas[`${modelName}CountArgs`] = this.buildCountArgsSchema(modelName);
            schemas[`${modelName}AggregateArgs`] = this.buildAggregateArgsSchema(modelName);
            schemas[`${modelName}GroupByArgs`] = this.buildGroupByArgsSchema(modelName);
            schemas[`${modelName}ExistsArgs`] = this.buildExistsArgsSchema(modelName);
            schemas[`${modelName}Response`] = this.buildResponseSchema(modelName);
        }

        return schemas;
    }

    private buildEnumSchema(enumDef: EnumDef): SchemaObject {
        return {
            type: 'string',
            enum: Object.values(enumDef.values),
        };
    }

    private buildModelOutputSchema(modelName: string, modelDef: ModelDef): SchemaObject {
        const properties: Record<string, SchemaObject | ReferenceObject> = {};
        const required: string[] = [];

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.omit) continue;
            if (isFieldOmitted(modelName, fieldName, this.queryOptions)) continue;
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

    private buildCreateInputSchema(_modelName: string, modelDef: ModelDef): SchemaObject {
        const idFieldNames = new Set(modelDef.idFields);
        const properties: Record<string, SchemaObject | ReferenceObject> = {};
        const required: string[] = [];

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.relation) continue;
            if (fieldDef.foreignKeyFor) continue;
            if (fieldDef.omit) continue;
            if (fieldDef.updatedAt) continue;
            // Skip auto-generated id fields
            if (idFieldNames.has(fieldName) && fieldDef.default !== undefined) continue;

            properties[fieldName] = this.typeToSchema(fieldDef.type);
            if (!fieldDef.optional && fieldDef.default === undefined && !fieldDef.array) {
                required.push(fieldName);
            }
        }

        const result: SchemaObject = { type: 'object', properties };
        if (required.length > 0) {
            result.required = required;
        }
        return result;
    }

    private buildUpdateInputSchema(_modelName: string, modelDef: ModelDef): SchemaObject {
        const properties: Record<string, SchemaObject | ReferenceObject> = {};

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.relation) continue;
            if (fieldDef.foreignKeyFor) continue;
            if (fieldDef.omit) continue;
            if (fieldDef.updatedAt) continue;

            properties[fieldName] = this.typeToSchema(fieldDef.type);
        }

        return { type: 'object', properties };
    }

    private buildWhereUniqueInputSchema(_modelName: string, modelDef: ModelDef): SchemaObject {
        const properties: Record<string, SchemaObject | ReferenceObject> = {};

        // ID fields
        for (const idFieldName of modelDef.idFields) {
            const fieldDef = modelDef.fields[idFieldName];
            if (fieldDef) {
                properties[idFieldName] = this.typeToSchema(fieldDef.type);
            }
        }

        // Unique fields
        for (const [uniqueName, uniqueInfo] of Object.entries(modelDef.uniqueFields)) {
            if (typeof (uniqueInfo as any).type === 'string') {
                // Single unique field
                const fieldDef = modelDef.fields[uniqueName];
                if (fieldDef && !properties[uniqueName]) {
                    properties[uniqueName] = this.typeToSchema(fieldDef.type);
                }
            } else {
                // Compound unique
                properties[uniqueName] = { type: 'object' };
            }
        }

        return { type: 'object', properties };
    }

    private buildWhereInputSchema(_modelName: string, modelDef: ModelDef): SchemaObject {
        const properties: Record<string, SchemaObject | ReferenceObject> = {};

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.relation) continue;
            if (fieldDef.omit) continue;
            const filterSchema = this.buildFieldFilterSchema(_modelName, fieldName, fieldDef);
            if (filterSchema) {
                properties[fieldName] = filterSchema;
            }
        }

        // Logical combinators
        properties['AND'] = {
            oneOf: [
                { $ref: `#/components/schemas/_${_modelName}WhereInput` },
                { type: 'array', items: { $ref: `#/components/schemas/_${_modelName}WhereInput` } },
            ],
        };
        properties['OR'] = {
            type: 'array',
            items: { $ref: `#/components/schemas/_${_modelName}WhereInput` },
        };
        properties['NOT'] = {
            oneOf: [
                { $ref: `#/components/schemas/_${_modelName}WhereInput` },
                { type: 'array', items: { $ref: `#/components/schemas/_${_modelName}WhereInput` } },
            ],
        };

        return { type: 'object', properties };
    }

    private buildCreateArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                data: { $ref: `#/components/schemas/${modelName}CreateInput` },
                select: { type: 'object' },
                include: { type: 'object' },
            },
            required: ['data'],
        };
    }

    private buildCreateManyArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                data: {
                    type: 'array',
                    items: { $ref: `#/components/schemas/${modelName}CreateInput` },
                },
            },
            required: ['data'],
        };
    }

    private buildUpdateArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereUniqueInput` },
                data: { $ref: `#/components/schemas/${modelName}UpdateInput` },
                select: { type: 'object' },
                include: { type: 'object' },
            },
            required: ['where', 'data'],
        };
    }

    private buildUpdateManyArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereInput` },
                data: { $ref: `#/components/schemas/${modelName}UpdateInput` },
            },
            required: ['data'],
        };
    }

    private buildUpsertArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereUniqueInput` },
                create: { $ref: `#/components/schemas/${modelName}CreateInput` },
                update: { $ref: `#/components/schemas/${modelName}UpdateInput` },
                select: { type: 'object' },
                include: { type: 'object' },
            },
            required: ['where', 'create', 'update'],
        };
    }

    private buildDeleteArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereUniqueInput` },
                select: { type: 'object' },
            },
            required: ['where'],
        };
    }

    private buildDeleteManyArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereInput` },
            },
        };
    }

    private buildFindManyArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereInput` },
                orderBy: { type: 'object' },
                take: { type: 'integer' },
                skip: { type: 'integer' },
                select: { type: 'object' },
                include: { type: 'object' },
            },
        };
    }

    private buildFindUniqueArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereUniqueInput` },
                select: { type: 'object' },
                include: { type: 'object' },
            },
            required: ['where'],
        };
    }

    private buildFindFirstArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereInput` },
                orderBy: { type: 'object' },
                take: { type: 'integer' },
                skip: { type: 'integer' },
                select: { type: 'object' },
                include: { type: 'object' },
            },
        };
    }

    private buildCountArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereInput` },
                take: { type: 'integer' },
                skip: { type: 'integer' },
            },
        };
    }

    private buildAggregateArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereInput` },
                orderBy: { type: 'object' },
                take: { type: 'integer' },
                skip: { type: 'integer' },
            },
        };
    }

    private buildGroupByArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereInput` },
                by: { type: 'array', items: { type: 'string' } },
                orderBy: { type: 'object' },
                take: { type: 'integer' },
                skip: { type: 'integer' },
            },
        };
    }

    private buildExistsArgsSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                where: { $ref: `#/components/schemas/${modelName}WhereUniqueInput` },
            },
            required: ['where'],
        };
    }

    private buildResponseSchema(modelName: string): SchemaObject {
        return {
            type: 'object',
            properties: {
                data: { $ref: `#/components/schemas/${modelName}` },
                meta: { $ref: '#/components/schemas/_Meta' },
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

    private buildFieldFilterSchema(modelName: string, fieldName: string, fieldDef: FieldDef): SchemaObject | undefined {
        const baseSchema = this.typeToSchema(fieldDef.type);
        const filterProps: Record<string, SchemaObject | ReferenceObject> = {};
        const type = fieldDef.type;

        // Equality operators
        if (isFilterKindIncluded(modelName, fieldName, 'Equality', this.queryOptions)) {
            filterProps['equals'] = baseSchema;
            filterProps['not'] = baseSchema;
            filterProps['in'] = { type: 'array', items: baseSchema };
            filterProps['notIn'] = { type: 'array', items: baseSchema };
        }

        // Range operators (numeric/datetime types)
        if (
            (type === 'Int' || type === 'Float' || type === 'BigInt' || type === 'Decimal' || type === 'DateTime') &&
            isFilterKindIncluded(modelName, fieldName, 'Range', this.queryOptions)
        ) {
            filterProps['lt'] = baseSchema;
            filterProps['lte'] = baseSchema;
            filterProps['gt'] = baseSchema;
            filterProps['gte'] = baseSchema;
        }

        // Like operators (String type)
        if (type === 'String' && isFilterKindIncluded(modelName, fieldName, 'Like', this.queryOptions)) {
            filterProps['contains'] = { type: 'string' };
            filterProps['startsWith'] = { type: 'string' };
            filterProps['endsWith'] = { type: 'string' };
            filterProps['mode'] = { type: 'string', enum: ['default', 'insensitive'] };
        }

        // List operators (array fields)
        if (fieldDef.array && isFilterKindIncluded(modelName, fieldName, 'List', this.queryOptions)) {
            filterProps['has'] = baseSchema;
            filterProps['hasEvery'] = { type: 'array', items: baseSchema };
            filterProps['hasSome'] = { type: 'array', items: baseSchema };
            filterProps['isEmpty'] = { type: 'boolean' };
        }

        if (Object.keys(filterProps).length === 0) return undefined;

        const filterObject: SchemaObject = { type: 'object', properties: filterProps };

        // If Equality is included, allow shorthand (direct value) via oneOf
        if (isFilterKindIncluded(modelName, fieldName, 'Equality', this.queryOptions)) {
            return { oneOf: [baseSchema, filterObject] };
        }

        return filterObject;
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
}
