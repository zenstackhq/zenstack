import { lowerCaseFirst, upperCaseFirst } from '@zenstackhq/common-helpers';
import { CoreCrudOperations, createQuerySchemaFactory, type ZodSchemaFactory } from '@zenstackhq/orm';
import type { BuiltinType, EnumDef, ModelDef, ProcedureDef, SchemaDef, TypeDefDef } from '@zenstackhq/orm/schema';
import type { OpenAPIV3_1 } from 'openapi-types';
import type { RPCApiHandlerOptions } from '.';
import { PROCEDURE_ROUTE_PREFIXES } from '../common/procedures';
import {
    DEFAULT_SPEC_TITLE,
    DEFAULT_SPEC_VERSION,
    getIncludedModels,
    getMetaDescription,
    isOperationIncluded,
    isProcedureIncluded,
    mayDenyAccess,
} from '../common/spec-utils';
import type { OpenApiSpecOptions } from '../common/types';

type SchemaObject = OpenAPIV3_1.SchemaObject;
type ReferenceObject = OpenAPIV3_1.ReferenceObject;

// Operations that use GET with args in ?q= query parameter
const GET_OPERATIONS = new Set<string>([
    'findFirst',
    'findUnique',
    'findMany',
    'aggregate',
    'groupBy',
    'count',
    'exists',
]);
// Operations that use POST with request body (201 on success)
const POST_OPERATIONS = new Set<string>(['create', 'createMany', 'createManyAndReturn', 'upsert']);
// Operations that use PUT with request body
const PUT_OPERATIONS = new Set<string>(['update', 'updateMany', 'updateManyAndReturn']);
// Operations that use DELETE with args in ?q= query parameter
const DELETE_OPERATIONS = new Set<string>(['delete', 'deleteMany']);

const JSON_CT = 'application/json';

type OperationInfo = {
    summary: (modelName: string) => string;
    dataSchema: (entityRef: ReferenceObject) => SchemaObject | ReferenceObject;
};

/**
 * Per-operation metadata: human-readable summary and response data schema shape.
 * Operations absent from this map (aggregate, groupBy, count) return a generic schema.
 */
const OPERATION_INFO: Record<string, OperationInfo> = {
    findUnique: {
        summary: (m) => `Find a unique ${m}`,
        dataSchema: (ref) => ({ anyOf: [ref, { type: 'null' }] }),
    },
    findFirst: {
        summary: (m) => `Find the first ${m}`,
        dataSchema: (ref) => ({ anyOf: [ref, { type: 'null' }] }),
    },
    findMany: {
        summary: (m) => `List ${m} entities`,
        dataSchema: (ref) => ({ type: 'array', items: ref }),
    },
    create: {
        summary: (m) => `Create a ${m}`,
        dataSchema: (ref) => ref,
    },
    createMany: {
        summary: (m) => `Create multiple ${m} entities`,
        dataSchema: () => ({ type: 'object', properties: { count: { type: 'integer' } }, required: ['count'] }),
    },
    createManyAndReturn: {
        summary: (m) => `Create multiple ${m}s and return them`,
        dataSchema: (ref) => ({ type: 'array', items: ref }),
    },
    update: {
        summary: (m) => `Update a ${m}`,
        dataSchema: (ref) => ref,
    },
    updateMany: {
        summary: (m) => `Update multiple ${m} entities`,
        dataSchema: () => ({ type: 'object', properties: { count: { type: 'integer' } }, required: ['count'] }),
    },
    updateManyAndReturn: {
        summary: (m) => `Update multiple ${m} entities and return them`,
        dataSchema: (ref) => ({ type: 'array', items: ref }),
    },
    upsert: {
        summary: (m) => `Upsert a ${m}`,
        dataSchema: (ref) => ref,
    },
    delete: {
        summary: (m) => `Delete a ${m}`,
        dataSchema: (ref) => ref,
    },
    deleteMany: {
        summary: (m) => `Delete multiple ${m} entities`,
        dataSchema: () => ({ type: 'object', properties: { count: { type: 'integer' } }, required: ['count'] }),
    },
    exists: {
        summary: (m) => `Check ${m} existence`,
        dataSchema: () => ({ type: 'boolean' }),
    },
};

function errorResponse(description: string): OpenAPIV3_1.ResponseObject {
    return {
        description,
        content: {
            [JSON_CT]: {
                schema: { $ref: '#/components/schemas/_rpcErrorResponse' },
            },
        },
    };
}

const ERROR_400 = errorResponse('Error occurred while processing the request');
const ERROR_403 = errorResponse('Forbidden: insufficient permissions to perform this operation');
const ERROR_404 = errorResponse('Resource not found');
const ERROR_422 = errorResponse('Operation is unprocessable due to validation errors');
const ERROR_500 = errorResponse('Internal server error');

// Operations that may throw NOT_FOUND when the target record does not exist
const NOT_FOUND_OPERATIONS = new Set<string>(['update', 'delete']);

/**
 * Generates an OpenAPI v3.1 specification for the RPC-style API handler.
 */
export class RPCApiSpecGenerator<Schema extends SchemaDef = SchemaDef> {
    private specOptions?: OpenApiSpecOptions;
    private readonly factory: ZodSchemaFactory<Schema>;
    /**
     * Schemas extracted from the Zod registry, keyed by their registered ID, with
     * all `$ref` values already rewritten to `#/components/schemas/<id>`.
     */
    private registrySchemas: Record<string, SchemaObject> = {};

    constructor(private readonly handlerOptions: RPCApiHandlerOptions<Schema>) {
        this.factory = createQuerySchemaFactory(handlerOptions.schema, handlerOptions.queryOptions);
    }

    private get schema(): SchemaDef {
        return this.handlerOptions.schema;
    }

    private get queryOptions() {
        return this.handlerOptions?.queryOptions;
    }

    generateSpec(options?: OpenApiSpecOptions): OpenAPIV3_1.Document {
        this.specOptions = options;

        // Build all model/procedure schemas eagerly and capture the full registry as
        // JSON Schema, then transform bare-ID $refs to OpenAPI component paths.
        const rawRegistry = this.factory.toJSONSchema();
        this.registrySchemas = this.transformRegistrySchemas(rawRegistry.schemas);

        return {
            openapi: '3.1.0',
            info: {
                title: options?.title ?? DEFAULT_SPEC_TITLE,
                version: options?.version ?? DEFAULT_SPEC_VERSION,
                ...(options?.description && { description: options.description }),
                ...(options?.summary && { summary: options.summary }),
            },
            tags: this.generateTags(),
            paths: this.generatePaths(),
            components: {
                schemas: {
                    ...this.registrySchemas,
                    ...this.generateSharedSchemas(),
                },
            },
        } as OpenAPIV3_1.Document;
    }

    /**
     * Takes the raw `schemas` map from `z.toJSONSchema(registry)` and:
     *  1. Rewrites bare-ID `$ref` values (e.g. `"UserWhereInput"`) to full
     *     component paths (`"#/components/schemas/UserWhereInput"`).
     *  2. Strips the `$schema` keyword from each top-level schema object, as it
     *     is redundant inside an OpenAPI document.
     *  3. Resolves Zod's auto-generated `__shared/$defs/schemaN` aliases.
     *     When a `__shared/$defs/schemaN` entry is itself a plain `$ref` to a
     *     named schema, every reference to it is rewritten to point directly at
     *     the target schema, removing the double indirection. Any remaining
     *     `__shared` entries (complex shared sub-schemas) are promoted to
     *     top-level component schemas with stable names.
     */
    private transformRegistrySchemas(schemas: Record<string, unknown>): Record<string, SchemaObject> {
        let result: Record<string, SchemaObject>;

        // Step 1: rewrite bare-ID refs to full component paths, and replace repeated
        // inline integer bound schemas with $refs to shared named schemas.
        // Bare-ID refs produced by the Zod registry look like `"$ref":"SomeName"`.
        // __shared cross-refs look like `"$ref":"__shared#/$defs/schemaN"` and are
        // also rewritten here.
        const INT_PATTERN = '{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991}';
        const NON_NEG_INT_PATTERN = '{"type":"integer","minimum":0,"maximum":9007199254740991}';
        const serialized = JSON.stringify(schemas)
            .replace(/"(\$ref)":"([^"#][^"]*)"/g, (_, key, id) => `"${key}":"#/components/schemas/${id}"`)
            .replaceAll(NON_NEG_INT_PATTERN, '{"$ref":"#/components/schemas/_nonNegativeInteger"}')
            .replaceAll(INT_PATTERN, '{"$ref":"#/components/schemas/_integer"}');
        result = JSON.parse(serialized) as Record<string, SchemaObject>;

        // Step 2: resolve __shared/$defs aliases produced by Zod's deduplication
        // of circular-reference lazy schemas.
        const shared = result['__shared'] as { $defs?: Record<string, SchemaObject> } | undefined;
        if (shared?.$defs) {
            // Build a substitution map: __shared ref → direct target ref (for pure aliases)
            // and collect complex entries that need promotion to top-level.
            const refMap: Record<string, string> = {};
            const promoted: Record<string, SchemaObject> = {};

            for (const [key, entry] of Object.entries(shared.$defs)) {
                const sharedRef = `#/components/schemas/__shared#/$defs/${key}`;
                if (entry && typeof entry === 'object' && '$ref' in entry && Object.keys(entry).length === 1) {
                    // Pure alias — map it straight to the target.
                    refMap[sharedRef] = entry.$ref as string;
                } else {
                    // Complex sub-schema — promote to a top-level named schema.
                    const promotedName = `_shared_${key}`;
                    promoted[promotedName] = entry;
                    refMap[sharedRef] = `#/components/schemas/${promotedName}`;
                }
            }

            if (Object.keys(refMap).length > 0) {
                // Replace all __shared refs in a single JSON round-trip.
                const escapedKeys = Object.keys(refMap).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                const pattern = new RegExp(`"\\$ref":"(${escapedKeys.join('|')})"`, 'g');
                const resolved = JSON.stringify(result).replace(pattern, (_, ref) => `"$ref":"${refMap[ref]}"`);
                result = JSON.parse(resolved) as Record<string, SchemaObject>;

                // Remove __shared and add any promoted complex schemas.
                delete result['__shared'];
                Object.assign(result, promoted);
            }
        }

        // Step 3: remove the $schema dialect keyword from each top-level entry.
        for (const s of Object.values(result)) {
            if (s && typeof s === 'object') {
                delete (s as Record<string, unknown>)['$schema'];
            }
        }

        return result;
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
            const modelDef = this.schema.models[modelName]!;
            const tag = lowerCaseFirst(modelName);

            for (const op of CoreCrudOperations) {
                if (!isOperationIncluded(modelName, op, this.queryOptions)) continue;
                const method = this.getHttpMethod(op);
                const operation = this.buildModelOperation(modelName, modelDef, op, tag);
                paths[`/${lowerCaseFirst(modelName)}/${op}`] = {
                    [method]: operation,
                } as OpenAPIV3_1.PathItemObject;
            }
        }

        // Procedure paths
        if (this.schema.procedures) {
            for (const [procName, procDef] of Object.entries(this.schema.procedures)) {
                if (!isProcedureIncluded(procName, this.queryOptions)) continue;
                const method = procDef.mutation ? 'post' : 'get';
                paths[`/${PROCEDURE_ROUTE_PREFIXES}/${procName}`] = {
                    [method]: this.buildProcedureOperation(procName, procDef, method),
                } as OpenAPIV3_1.PathItemObject;
            }
        }

        // Sequential transaction endpoint
        paths['/$transaction/sequential'] = {
            post: this.buildTransactionOperation(),
        } as OpenAPIV3_1.PathItemObject;

        return paths;
    }

    private getHttpMethod(op: string): string {
        if (GET_OPERATIONS.has(op)) return 'get';
        if (POST_OPERATIONS.has(op)) return 'post';
        if (PUT_OPERATIONS.has(op)) return 'put';
        if (DELETE_OPERATIONS.has(op)) return 'delete';
        return 'post';
    }

    /**
     * Returns a JSON Schema `$ref` pointing to the pre-built component schema for
     * the given model+operation, or `undefined` if the schema was not registered
     * (e.g. the operation is not supported for that model).
     */
    private getOperationInputSchemaRef(modelName: string, op: string): ReferenceObject | undefined {
        const id = `${modelName}${upperCaseFirst(op)}Args`;
        return id in this.registrySchemas ? { $ref: `#/components/schemas/${id}` } : undefined;
    }

    /**
     * Maps an RPC operation name to its corresponding access policy operation type.
     * Policy attributes use 'read', 'create', 'update', 'delete', 'all'.
     */
    private policyOp(op: string): string {
        if (GET_OPERATIONS.has(op)) return 'read';
        if (DELETE_OPERATIONS.has(op)) return 'delete';
        if (PUT_OPERATIONS.has(op)) return 'update';
        // create/createMany/createManyAndReturn/upsert → 'create'
        return 'create';
    }

    private buildModelOperation(
        modelName: string,
        modelDef: ModelDef,
        op: string,
        tag: string,
    ): Record<string, unknown> {
        const isQueryOp = GET_OPERATIONS.has(op) || DELETE_OPERATIONS.has(op);
        const successCode = POST_OPERATIONS.has(op) ? '201' : '200';
        const inputSchemaRef = this.getOperationInputSchemaRef(modelName, op);

        const operation: Record<string, unknown> = {
            tags: [tag],
            summary: OPERATION_INFO[op]?.summary(modelName) ?? `${modelName}.${op}`,
            operationId: `${lowerCaseFirst(modelName)}_${op}`,
            responses: {
                [successCode]: {
                    description: 'Operation succeeded',
                    content: {
                        [JSON_CT]: {
                            schema: this.buildOperationSuccessSchema(modelName, op),
                        },
                    },
                },
                '400': ERROR_400,
                ...(NOT_FOUND_OPERATIONS.has(op) && { '404': ERROR_404 }),
                '422': ERROR_422,
                '500': ERROR_500,
                ...(mayDenyAccess(modelDef, this.policyOp(op), this.specOptions?.respectAccessPolicies) && {
                    '403': ERROR_403,
                }),
            },
        };

        if (inputSchemaRef) {
            if (isQueryOp) {
                // `q` is required when the input schema has required fields (e.g. `where` for delete/findUnique).
                // OAPI 3.1 supports content-typed parameters for structured query values.
                // `meta` is an optional companion to `q` used to carry SuperJSON serialization
                // metadata (see unmarshalQ in api/common/utils.ts).
                const inputSchemaId = `${modelName}${upperCaseFirst(op)}Args`;
                const inputSchema = this.registrySchemas[inputSchemaId];
                const qRequired = Array.isArray(inputSchema?.required) && inputSchema.required.length > 0;
                operation['parameters'] = [
                    {
                        name: 'q',
                        in: 'query',
                        ...(qRequired && { required: true }),
                        description: `JSON-encoded arguments for ${modelName}.${op}`,
                        content: {
                            [JSON_CT]: { schema: inputSchemaRef },
                        },
                    },
                    {
                        name: 'meta',
                        in: 'query',
                        description: 'JSON-encoded SuperJSON serialization metadata for the "q" parameter',
                        schema: { type: 'string' },
                    },
                ];
            } else {
                operation['requestBody'] = {
                    required: true,
                    content: {
                        [JSON_CT]: { schema: inputSchemaRef },
                    },
                };
            }
        }

        return operation;
    }

    private buildProcedureOperation(
        procName: string,
        procDef: ProcedureDef,
        method: 'get' | 'post',
    ): Record<string, unknown> {
        const argsSchemaId = `${procName}ProcArgs`;
        const argsSchemaRef: ReferenceObject | SchemaObject =
            argsSchemaId in this.registrySchemas
                ? { $ref: `#/components/schemas/${argsSchemaId}` }
                : { type: 'object' };

        // The RPC handler accepts { args: { param1: val, ... } } envelope.
        // `args` is required when the procedure has at least one non-optional parameter
        // (mapProcedureArgs throws 'missing procedure arguments' otherwise).
        const hasRequiredParams = Object.values(procDef.params ?? {}).some((p) => !p.optional);
        const envelopeSchema: SchemaObject = {
            type: 'object',
            properties: { args: argsSchemaRef },
            ...(hasRequiredParams && { required: ['args'] }),
        };

        const op: Record<string, unknown> = {
            tags: ['$procs'],
            summary: `Execute procedure \`${procName}\``,
            operationId: `proc_${procName}`,
            responses: {
                '200': {
                    description: `Result of ${procName}`,
                    content: {
                        [JSON_CT]: {
                            schema: {
                                type: 'object',
                                properties: {
                                    data: this.getProcedureDataSchema(procDef),
                                    meta: {
                                        type: 'object',
                                        properties: {
                                            serialization: {},
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                '400': ERROR_400,
                '403': ERROR_403,
                '404': ERROR_404,
                '422': ERROR_422,
                '500': ERROR_500,
            },
        };

        const hasParams = Object.keys(procDef.params ?? {}).length > 0;
        if (method === 'get') {
            if (hasParams) {
                op['parameters'] = [
                    {
                        name: 'q',
                        in: 'query',
                        ...(hasRequiredParams && { required: true }),
                        description: `JSON-encoded arguments for procedure ${procName}`,
                        content: {
                            [JSON_CT]: { schema: envelopeSchema },
                        },
                    },
                    {
                        name: 'meta',
                        in: 'query',
                        description: 'JSON-encoded SuperJSON serialization metadata for the "q" parameter',
                        schema: { type: 'string' },
                    },
                ];
            }
        } else {
            if (hasParams) {
                op['requestBody'] = {
                    ...(hasRequiredParams && { required: true }),
                    content: {
                        [JSON_CT]: { schema: envelopeSchema },
                    },
                };
            }
        }

        return op;
    }

    private getProcedureDataSchema(procDef: ProcedureDef): SchemaObject | ReferenceObject {
        const { returnType, returnArray } = procDef;
        let base: SchemaObject | ReferenceObject;

        if (this.isBuiltinType(returnType)) {
            base = this.builtinTypeToJsonSchema(returnType as BuiltinType);
        } else if (
            this.schema.enums?.[returnType] ||
            this.schema.models?.[returnType] ||
            this.schema.typeDefs?.[returnType]
        ) {
            base = { $ref: `#/components/schemas/${returnType}` };
        } else {
            base = {};
        }

        return returnArray ? { type: 'array', items: base } : base;
    }

    private buildTransactionOperation(): Record<string, unknown> {
        return {
            tags: ['$transaction'],
            summary: 'Execute a sequential transaction',
            operationId: 'transaction_sequential',
            requestBody: {
                required: true,
                content: {
                    [JSON_CT]: {
                        schema: { $ref: '#/components/schemas/_rpcTransactionRequest' },
                    },
                },
            },
            responses: {
                '200': {
                    description: 'Transaction succeeded',
                    content: {
                        [JSON_CT]: {
                            schema: { $ref: '#/components/schemas/_rpcSuccessResponse' },
                        },
                    },
                },
                '400': ERROR_400,
                '403': ERROR_403,
                '404': ERROR_404,
                '422': ERROR_422,
                '500': ERROR_500,
            },
        };
    }

    private generateSharedSchemas(): Record<string, SchemaObject> {
        // Generate schemas for enums
        const enumSchemas: Record<string, SchemaObject> = {};
        for (const [enumName, enumDef] of Object.entries(this.schema.enums ?? {})) {
            enumSchemas[enumName] = this.buildEnumSchema(enumDef);
        }

        // Generate schemas for typedefs (e.g. `type Address { city String }`)
        const typeDefSchemas: Record<string, SchemaObject> = {};
        for (const [typeName, typeDef] of Object.entries(this.schema.typeDefs ?? {})) {
            typeDefSchemas[typeName] = this.buildTypeDefSchema(typeDef);
        }

        // Generate a response-side entity schema for every included model
        const modelEntitySchemas: Record<string, SchemaObject> = {};
        for (const modelName of getIncludedModels(this.schema as SchemaDef, this.queryOptions)) {
            modelEntitySchemas[modelName] = this.buildModelEntitySchema(this.schema.models[modelName]!);
        }

        return {
            ...enumSchemas,
            ...typeDefSchemas,
            ...modelEntitySchemas,
            _integer: { type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 },
            _nonNegativeInteger: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
            _rpcSuccessResponse: {
                type: 'object',
                properties: {
                    data: {},
                    meta: {
                        type: 'object',
                        properties: {
                            serialization: {},
                        },
                    },
                },
            },
            _rpcErrorResponse: {
                type: 'object',
                properties: {
                    error: {
                        type: 'object',
                        properties: {
                            message: { type: 'string' },
                            reason: { type: 'string' },
                            model: { type: 'string' },
                            rejectedByPolicy: { type: 'boolean' },
                            rejectedByValidation: { type: 'boolean' },
                            rejectReason: { type: 'string' },
                            dbErrorCode: { type: 'string' },
                        },
                        required: ['message'],
                    },
                },
                required: ['error'],
            },
            _rpcTransactionRequest: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        model: { type: 'string' },
                        op: {
                            type: 'string',
                            enum: [...CoreCrudOperations],
                        },
                        args: { type: 'object' },
                    },
                    required: ['model', 'op'],
                },
            },
        };
    }

    private builtinTypeToJsonSchema(type: BuiltinType): SchemaObject {
        switch (type) {
            case 'String':
                return { type: 'string' };
            case 'Boolean':
                return { type: 'boolean' };
            case 'Int':
                return { type: 'integer' };
            case 'Float':
                return { type: 'number' };
            case 'BigInt':
                return { type: 'integer' };
            case 'Decimal':
                return { type: 'string' };
            case 'DateTime':
                return { type: 'string', format: 'date-time' };
            case 'Bytes':
                return { type: 'string', format: 'byte' };
            default:
                // Json, Unsupported
                return {};
        }
    }

    private isBuiltinType(type: string): boolean {
        return [
            'String',
            'Boolean',
            'Int',
            'Float',
            'BigInt',
            'Decimal',
            'DateTime',
            'Bytes',
            'Json',
            'Unsupported',
        ].includes(type);
    }

    /**
     * Builds a JSON Schema object describing a custom typedef
     */
    private buildEnumSchema(enumDef: EnumDef): SchemaObject {
        return { type: 'string', enum: Object.values(enumDef.values) };
    }

    private buildTypeDefSchema(typeDef: TypeDefDef): SchemaObject {
        const properties: Record<string, SchemaObject | ReferenceObject> = {};
        const required: string[] = [];
        for (const [fieldName, fieldDef] of Object.entries(typeDef.fields)) {
            const isRef =
                !this.isBuiltinType(fieldDef.type) &&
                (this.schema.enums?.[fieldDef.type] || this.schema.typeDefs?.[fieldDef.type]);
            const base: SchemaObject | ReferenceObject = this.isBuiltinType(fieldDef.type)
                ? this.builtinTypeToJsonSchema(fieldDef.type as BuiltinType)
                : isRef
                  ? { $ref: `#/components/schemas/${fieldDef.type}` }
                  : { type: 'object' as const };
            const fieldDesc = getMetaDescription(fieldDef.attributes);
            if (fieldDesc && !isRef) {
                (base as SchemaObject).description = fieldDesc;
            }
            const typed: SchemaObject | ReferenceObject = fieldDef.array ? { type: 'array', items: base } : base;
            properties[fieldName] = fieldDef.optional ? { anyOf: [typed, { type: 'null' }] } : typed;
            if (!fieldDef.optional) required.push(fieldName);
        }
        const schema: SchemaObject = { type: 'object', properties };
        if (required.length > 0) schema['required'] = required;
        return schema;
    }

    /**
     * Builds a JSON Schema object describing a model entity
     */
    private buildModelEntitySchema(modelDef: ModelDef): SchemaObject {
        const properties: Record<string, SchemaObject | ReferenceObject> = {};
        const required: string[] = [];

        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.omit) continue;

            if (fieldDef.relation) {
                // Relation fields appear only with `include` — mark as optional.
                // To-one optional relations are nullable (the ORM returns null when not found).
                const refSchema: ReferenceObject = { $ref: `#/components/schemas/${fieldDef.type}` };
                const base: SchemaObject | ReferenceObject = fieldDef.array
                    ? { type: 'array', items: refSchema }
                    : refSchema;
                properties[fieldName] =
                    !fieldDef.array && fieldDef.optional ? { anyOf: [base, { type: 'null' }] } : base;
            } else if (this.schema.enums?.[fieldDef.type]) {
                // Enum field
                const refSchema: ReferenceObject = { $ref: `#/components/schemas/${fieldDef.type}` };
                const base: SchemaObject | ReferenceObject = fieldDef.array
                    ? { type: 'array', items: refSchema }
                    : refSchema;
                properties[fieldName] = fieldDef.optional ? { anyOf: [base, { type: 'null' }] } : base;
                required.push(fieldName);
            } else if (this.isBuiltinType(fieldDef.type)) {
                // Scalar builtin field
                const base = this.builtinTypeToJsonSchema(fieldDef.type as BuiltinType);
                const fieldDesc = getMetaDescription(fieldDef.attributes);
                if (fieldDesc) base.description = fieldDesc;
                const typed: SchemaObject = fieldDef.array ? { type: 'array', items: base } : base;
                properties[fieldName] = fieldDef.optional ? { anyOf: [typed, { type: 'null' }] } : typed;
                required.push(fieldName);
            } else if (this.schema.typeDefs?.[fieldDef.type]) {
                // TypeDef field — reference the registered typedef schema
                const refSchema: ReferenceObject = { $ref: `#/components/schemas/${fieldDef.type}` };
                const base: SchemaObject | ReferenceObject = fieldDef.array
                    ? { type: 'array', items: refSchema }
                    : refSchema;
                properties[fieldName] = fieldDef.optional ? { anyOf: [base, { type: 'null' }] } : base;
                required.push(fieldName);
            } else {
                // Unknown type — represent as a generic object
                const typed: SchemaObject = fieldDef.array
                    ? { type: 'array', items: { type: 'object' } }
                    : { type: 'object' };
                properties[fieldName] = typed;
                required.push(fieldName);
            }
        }

        const schema: SchemaObject = { type: 'object', properties };
        if (required.length > 0) {
            schema['required'] = required;
        }
        const modelDesc = getMetaDescription(modelDef.attributes);
        if (modelDesc) schema.description = modelDesc;
        return schema;
    }

    private buildOperationSuccessSchema(modelName: string, op: string): SchemaObject {
        const entityRef: ReferenceObject = { $ref: `#/components/schemas/${modelName}` };
        // aggregate, groupBy, count shapes depend on query args — leave generic ({})
        const dataSchema = OPERATION_INFO[op]?.dataSchema(entityRef) ?? {};
        return {
            type: 'object',
            properties: {
                data: dataSchema,
                meta: {
                    type: 'object',
                    properties: {
                        serialization: {},
                    },
                },
            },
        };
    }
}
