import { clone, enumerate, lowerCaseFirst, paramCase } from '@zenstackhq/common-helpers';
import { ORMError, ORMErrorReason, type ClientContract } from '@zenstackhq/orm';
import type { FieldDef, ModelDef, SchemaDef } from '@zenstackhq/orm/schema';
import { Decimal } from 'decimal.js';
import SuperJSON from 'superjson';
import tsjapi, { type Linker, type Paginator, type Relator, type Serializer, type SerializerOptions } from 'ts-japi';
import { match } from 'ts-pattern';
import UrlPattern from 'url-pattern';
import z from 'zod';
import { fromError } from 'zod-validation-error/v4';
import type { ApiHandler, LogConfig, RequestContext, Response } from '../../types';
import { getProcedureDef, mapProcedureArgs } from '../common/procedures';
import { loggerSchema } from '../common/schemas';
import { processSuperJsonRequestPayload } from '../common/utils';
import { getZodErrorMessage, log, registerCustomSerializers } from '../utils';

/**
 * Options for {@link RestApiHandler}
 */
export type RestApiHandlerOptions<Schema extends SchemaDef = SchemaDef> = {
    /**
     * The schema
     */
    schema: Schema;

    /**
     * Logging configuration
     */
    log?: LogConfig;

    /**
     * The base endpoint of the RESTful API, must be a valid URL
     */
    endpoint: string;

    /**
     * The default page size for limiting the number of results returned
     * from collection queries, including resource collection, related data
     * of collection types, and relationship of collection types.
     *
     * Defaults to 100. Set to Infinity to disable pagination.
     */
    pageSize?: number;

    /**
     * The divider used to separate compound ID fields in the URL.
     * Defaults to '_'.
     */
    idDivider?: string;

    /**
     * The charset used for URL segment values. Defaults to `a-zA-Z0-9-_~ %`. You can change it if your entity's ID values
     * allow different characters. Specifically, if your models use compound IDs and the idDivider is set to a different value,
     * it should be included in the charset.
     */
    urlSegmentCharset?: string;

    /**
     * Mapping from model names to URL segment names.
     */
    modelNameMapping?: Record<string, string>;

    /**
     * Mapping from model names to unique field name to be used as resource's ID.
     */
    externalIdMapping?: Record<string, string>;

    /**
     * Explicit nested route configuration.
     *
     * First-level keys are parent model names, second-level keys are child model names.
     * `relation` is the relationship field on the child model that points to the parent model.
     */
    nestedRoutes?: Record<
        string,
        Record<
            string,
            {
                relation: string;
                /**
                 * When `true`, the constructor throws if the configured relation does not have an `onDelete`
                 * action of `Cascade`, `Restrict`, or `NoAction` in the schema. This ensures the database
                 * prevents orphaned child records when a parent is deleted.
                 */
                requireOrphanProtection?: boolean;
            }
        >
    >;
};

type RelationshipInfo = {
    type: string;
    idFields: FieldDef[];
    isCollection: boolean;
    isOptional: boolean;
};

type ModelInfo = {
    name: string;
    idFields: FieldDef[];
    fields: Record<string, FieldDef>;
    relationships: Record<string, RelationshipInfo>;
};

type Match = {
    parentType?: string;
    parentId?: string;
    type: string;
    id: string;
    relationship: string;
};

enum UrlPatterns {
    SINGLE = 'single',
    NESTED_SINGLE = 'nestedSingle',
    FETCH_RELATIONSHIP = 'fetchRelationship',
    RELATIONSHIP = 'relationship',
    COLLECTION = 'collection',
}

class InvalidValueError extends Error {
    constructor(message: string) {
        super(message);
    }
}

const DEFAULT_PAGE_SIZE = 100;

const FilterOperations = [
    'lt',
    'lte',
    'gt',
    'gte',
    'between',
    'contains',
    'icontains',
    'search',
    'startsWith',
    'endsWith',
    'has',
    'hasEvery',
    'hasSome',
    'isEmpty',
] as const;

type FilterOperationType = (typeof FilterOperations)[number] | undefined;

const DEFAULT_ID_DIVIDER = '_';

registerCustomSerializers();

/**
 * RESTful-style API request handler (compliant with JSON:API)
 */
export class RestApiHandler<Schema extends SchemaDef = SchemaDef> implements ApiHandler<Schema> {
    // resource serializers
    private serializers = new Map<string, Serializer>();

    // error responses
    private readonly errors: Record<string, { status: number; title: string; detail?: string }> = {
        unsupportedModel: {
            status: 404,
            title: 'Unsupported model type',
            detail: 'The model type is not supported',
        },
        unsupportedRelationship: {
            status: 400,
            title: 'Unsupported relationship',
            detail: 'The relationship is not supported',
        },
        invalidPath: {
            status: 400,
            title: 'The request path is invalid',
        },
        invalidVerb: {
            status: 400,
            title: 'The HTTP verb is not supported',
        },
        notFound: {
            status: 404,
            title: 'Resource not found',
        },
        noId: {
            status: 400,
            title: 'Model without an ID field is not supported',
        },
        invalidId: {
            status: 400,
            title: 'Resource ID is invalid',
        },
        invalidPayload: {
            status: 400,
            title: 'Invalid payload',
        },
        invalidRelationData: {
            status: 400,
            title: 'Invalid relation data',
            detail: 'Invalid relationship data',
        },
        invalidRelation: {
            status: 400,
            title: 'Invalid relation',
            detail: 'Invalid relationship',
        },
        invalidFilter: {
            status: 400,
            title: 'Invalid filter',
        },
        invalidSort: {
            status: 400,
            title: 'Invalid sort',
        },
        invalidValue: {
            status: 400,
            title: 'Invalid value for type',
        },
        duplicatedFieldsParameter: {
            status: 400,
            title: 'Fields Parameter Duplicated',
        },
        forbidden: {
            status: 403,
            title: 'Operation is forbidden',
        },
        validationError: {
            status: 422,
            title: 'Operation is unprocessable due to validation errors',
        },
        queryError: {
            status: 400,
            title: 'Error occurred while executing the query',
        },
        unknownError: {
            status: 500,
            title: 'Unknown error',
        },
    };

    private filterParamPattern = new RegExp(/^filter(?<match>(\[[^[\]]+\])+)$/);

    // zod schema for payload of creating and updating a resource
    private createUpdatePayloadSchema = z
        .object({
            data: z.object({
                type: z.string(),
                attributes: z.object({}).passthrough().optional(),
                relationships: z
                    .record(
                        z.string(),
                        z.object({
                            data: z.union([
                                z.object({ type: z.string(), id: z.union([z.string(), z.number()]) }),
                                z.array(z.object({ type: z.string(), id: z.union([z.string(), z.number()]) })),
                            ]),
                        }),
                    )
                    .optional(),
            }),
            meta: z.object({}).passthrough().optional(),
        })
        .strict();

    // zod schema for updating a single relationship
    private updateSingleRelationSchema = z.object({
        data: z.object({ type: z.string(), id: z.union([z.string(), z.number()]) }).nullable(),
    });

    // zod schema for updating collection relationship
    private updateCollectionRelationSchema = z.object({
        data: z.array(z.object({ type: z.string(), id: z.union([z.string(), z.number()]) })),
    });

    private upsertMetaSchema = z.object({
        meta: z.object({
            operation: z.literal('upsert'),
            matchFields: z.array(z.string()).min(1),
        }),
    });

    // all known types and their metadata
    private typeMap: Record<string, ModelInfo> = {};

    // divider used to separate compound ID fields
    private idDivider;

    private urlPatternMap: Record<UrlPatterns, UrlPattern>;
    private modelNameMapping: Record<string, string>;
    private reverseModelNameMapping: Record<string, string>;
    private externalIdMapping: Record<string, string>;
    private nestedRoutes: Record<string, Record<string, { relation: string; requireOrphanProtection?: boolean }>>;

    constructor(private readonly options: RestApiHandlerOptions<Schema>) {
        this.validateOptions(options);

        this.idDivider = options.idDivider ?? DEFAULT_ID_DIVIDER;
        const segmentCharset = options.urlSegmentCharset ?? 'a-zA-Z0-9-_~ %';

        this.modelNameMapping = options.modelNameMapping ?? {};
        this.modelNameMapping = Object.fromEntries(
            Object.entries(this.modelNameMapping).map(([k, v]) => [lowerCaseFirst(k), v]),
        );
        this.reverseModelNameMapping = Object.fromEntries(
            Object.entries(this.modelNameMapping).map(([k, v]) => [v, k]),
        );

        this.externalIdMapping = options.externalIdMapping ?? {};
        this.externalIdMapping = Object.fromEntries(
            Object.entries(this.externalIdMapping).map(([k, v]) => [lowerCaseFirst(k), v]),
        );

        this.nestedRoutes = options.nestedRoutes ?? {};
        this.nestedRoutes = Object.fromEntries(
            Object.entries(this.nestedRoutes).map(([parentModel, children]) => [
                lowerCaseFirst(parentModel),
                Object.fromEntries(
                    Object.entries(children).map(([childModel, config]) => [lowerCaseFirst(childModel), config]),
                ),
            ]),
        );

        this.urlPatternMap = this.buildUrlPatternMap(segmentCharset);

        this.buildTypeMap();
        this.validateNestedRoutes();
        this.buildSerializers();
    }

    private validateOptions(options: RestApiHandlerOptions<Schema>) {
        const schema = z.strictObject({
            schema: z.object(),
            log: loggerSchema.optional(),
            endpoint: z.string().min(1),
            pageSize: z.union([z.number().int().positive(), z.literal(Infinity)]).optional(),
            idDivider: z.string().min(1).optional(),
            urlSegmentCharset: z.string().min(1).optional(),
            modelNameMapping: z.record(z.string(), z.string()).optional(),
            externalIdMapping: z.record(z.string(), z.string()).optional(),
            nestedRoutes: z
                .record(
                    z.string(),
                    z.record(
                        z.string(),
                        z.object({ relation: z.string().min(1), requireOrphanProtection: z.boolean().optional() }),
                    ),
                )
                .optional(),
        });
        const parseResult = schema.safeParse(options);
        if (!parseResult.success) {
            throw new Error(`Invalid options: ${fromError(parseResult.error)}`);
        }
    }

    private validateNestedRoutes() {
        for (const [parentModel, children] of Object.entries(this.nestedRoutes)) {
            const parentInfo = this.getModelInfo(parentModel);
            if (!parentInfo) {
                throw new Error(`Invalid nestedRoutes: parent model "${parentModel}" not found in schema`);
            }
            for (const [childModel, config] of Object.entries(children)) {
                const childInfo = this.getModelInfo(childModel);
                if (!childInfo) {
                    throw new Error(`Invalid nestedRoutes: child model "${childModel}" not found in schema`);
                }
                const relationInfo = childInfo.relationships[config.relation];
                if (!relationInfo) {
                    throw new Error(
                        `Invalid nestedRoutes: relation "${config.relation}" not found on child model "${childModel}"`,
                    );
                }
                if (lowerCaseFirst(relationInfo.type) !== lowerCaseFirst(parentInfo.name)) {
                    throw new Error(
                        `Invalid nestedRoutes: relation "${childModel}.${config.relation}" does not point to parent model "${parentModel}"`,
                    );
                }
                if (config.requireOrphanProtection) {
                    const onDelete = this.schema.models[childInfo.name]?.fields[config.relation]?.relation?.onDelete;
                    const safeActions = ['Cascade', 'Restrict', 'NoAction'];
                    if (!onDelete || !safeActions.includes(onDelete)) {
                        throw new Error(
                            `Invalid nestedRoutes: requireOrphanProtection is enabled for "${childModel}.${config.relation}" ` +
                                `but its onDelete action is "${onDelete ?? 'not set'}" — must be Cascade, Restrict, or NoAction`,
                        );
                    }
                }
            }
        }
    }

    get schema() {
        return this.options.schema;
    }

    get log(): LogConfig | undefined {
        return this.options.log;
    }

    private buildUrlPatternMap(urlSegmentNameCharset: string): Record<UrlPatterns, UrlPattern> {
        const options = { segmentValueCharset: urlSegmentNameCharset };

        const buildPath = (segments: string[]) => {
            return '/' + segments.join('/');
        };

        return {
            [UrlPatterns.SINGLE]: new UrlPattern(buildPath([':type', ':id']), options),
            [UrlPatterns.NESTED_SINGLE]: new UrlPattern(
                buildPath([':parentType', ':parentId', ':type', ':id']),
                options,
            ),
            [UrlPatterns.FETCH_RELATIONSHIP]: new UrlPattern(buildPath([':type', ':id', ':relationship']), options),
            [UrlPatterns.RELATIONSHIP]: new UrlPattern(
                buildPath([':type', ':id', 'relationships', ':relationship']),
                options,
            ),
            [UrlPatterns.COLLECTION]: new UrlPattern(buildPath([':type']), options),
        };
    }

    private mapModelName(modelName: string): string {
        return this.modelNameMapping[modelName] ?? modelName;
    }

    private getNestedRouteConfig(parentType: string, childType: string) {
        return this.nestedRoutes[lowerCaseFirst(parentType)]?.[lowerCaseFirst(childType)];
    }

    private mergeFilters(left: any, right: any) {
        if (!left) {
            return right;
        }
        if (!right) {
            return left;
        }
        return { AND: [left, right] };
    }

    private buildNestedParentFilter(parentType: string, parentId: string, childType: string, relation: string) {
        const parentInfo = this.getModelInfo(parentType);
        if (!parentInfo) {
            return { filter: undefined, error: this.makeUnsupportedModelError(parentType) };
        }

        const childInfo = this.getModelInfo(childType);
        if (!childInfo) {
            return { filter: undefined, error: this.makeUnsupportedModelError(childType) };
        }

        const relationInfo = childInfo.relationships[relation];
        if (!relationInfo) {
            return {
                filter: undefined,
                error: this.makeError(
                    'invalidPath',
                    `invalid nested route configuration: relation ${childType}.${relation} does not exist`,
                ),
            };
        }

        if (lowerCaseFirst(relationInfo.type) !== lowerCaseFirst(parentInfo.name)) {
            return {
                filter: undefined,
                error: this.makeError(
                    'invalidPath',
                    `invalid nested route configuration: relation ${childType}.${relation} does not point to ${parentType}`,
                ),
            };
        }

        const relationFilter = relationInfo.isCollection
            ? { [relation]: { some: this.makeIdFilter(parentInfo.idFields, parentId, false) } }
            : { [relation]: { is: this.makeIdFilter(parentInfo.idFields, parentId, false) } };

        return { filter: relationFilter, error: undefined };
    }

    private matchUrlPattern(path: string, routeType: UrlPatterns): Match | undefined {
        const pattern = this.urlPatternMap[routeType];
        if (!pattern) {
            throw new InvalidValueError(`Unknown route type: ${routeType}`);
        }

        const match = pattern.match(path);
        if (!match) {
            return;
        }

        if (match.type in this.modelNameMapping) {
            throw new InvalidValueError(
                `use the mapped model name: ${this.modelNameMapping[match.type]} and not ${match.type}`,
            );
        }

        if (match.type in this.reverseModelNameMapping) {
            match.type = this.reverseModelNameMapping[match.type];
        }

        if (match.parentType) {
            if (match.parentType in this.modelNameMapping) {
                throw new InvalidValueError(
                    `use the mapped model name: ${this.modelNameMapping[match.parentType]} and not ${match.parentType}`,
                );
            }
            if (match.parentType in this.reverseModelNameMapping) {
                match.parentType = this.reverseModelNameMapping[match.parentType];
            }
        }

        return match;
    }

    async handleRequest({ client, method, path, query, requestBody }: RequestContext<Schema>): Promise<Response> {
        method = method.toUpperCase();
        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        try {
            if (path.startsWith('/$procs/')) {
                const proc = path.split('/')[2];
                return await this.processProcedureRequest({ client, method, proc, query, requestBody });
            }

            switch (method) {
                case 'GET': {
                    let match = this.matchUrlPattern(path, UrlPatterns.SINGLE);
                    if (match) {
                        // single resource read
                        return await this.processSingleRead(client, match.type, match.id, query);
                    }
                    match = this.matchUrlPattern(path, UrlPatterns.FETCH_RELATIONSHIP);
                    if (match) {
                        const mappedRelationship =
                            this.reverseModelNameMapping[match.relationship] || match.relationship;
                        const nestedRouteConfig = this.getNestedRouteConfig(match.type, mappedRelationship);
                        if (nestedRouteConfig) {
                            return await this.processNestedCollectionRead(
                                client,
                                match.type,
                                match.id,
                                mappedRelationship,
                                query,
                            );
                        }

                        // fetch related resource(s)
                        return await this.processFetchRelated(client, match.type, match.id, match.relationship, query);
                    }

                    match = this.matchUrlPattern(path, UrlPatterns.RELATIONSHIP);
                    if (match) {
                        // read relationship
                        return await this.processReadRelationship(
                            client,
                            match.type,
                            match.id,
                            match.relationship,
                            query,
                        );
                    }

                    match = this.matchUrlPattern(path, UrlPatterns.NESTED_SINGLE);
                    if (match) {
                        const nestedRouteConfig = this.getNestedRouteConfig(match.parentType!, match.type);
                        if (nestedRouteConfig) {
                            return await this.processNestedSingleRead(
                                client,
                                match.parentType!,
                                match.parentId!,
                                match.type,
                                match.id,
                                query,
                            );
                        }
                    }

                    match = this.matchUrlPattern(path, UrlPatterns.COLLECTION);
                    if (match) {
                        // collection read
                        return await this.processCollectionRead(client, match.type, query);
                    }

                    return this.makeError('invalidPath');
                }

                case 'POST': {
                    if (!requestBody) {
                        return this.makeError('invalidPayload');
                    }
                    const nestedMatch = this.matchUrlPattern(path, UrlPatterns.FETCH_RELATIONSHIP);
                    if (nestedMatch) {
                        const mappedRelationship =
                            this.reverseModelNameMapping[nestedMatch.relationship] || nestedMatch.relationship;
                        const nestedRouteConfig = this.getNestedRouteConfig(nestedMatch.type, mappedRelationship);
                        if (nestedRouteConfig) {
                            return await this.processNestedCreate(
                                client,
                                nestedMatch.type,
                                nestedMatch.id,
                                mappedRelationship,
                                query,
                                requestBody,
                            );
                        }
                    }

                    let match = this.matchUrlPattern(path, UrlPatterns.COLLECTION);
                    if (match) {
                        const body = requestBody as any;
                        const upsertMeta = this.upsertMetaSchema.safeParse(body);
                        if (upsertMeta.success) {
                            // resource upsert
                            return await this.processUpsert(client, match.type, query, requestBody);
                        } else {
                            // resource creation
                            return await this.processCreate(client, match.type, query, requestBody);
                        }
                    }
                    match = this.matchUrlPattern(path, UrlPatterns.RELATIONSHIP);
                    if (match) {
                        // relationship creation (collection relationship only)
                        return await this.processRelationshipCRUD(
                            client,
                            'create',
                            match.type,
                            match.id,
                            match.relationship,
                            query,
                            requestBody,
                        );
                    }

                    return this.makeError('invalidPath');
                }

                // TODO: PUT for full update
                case 'PUT':
                case 'PATCH': {
                    if (!requestBody) {
                        return this.makeError('invalidPayload');
                    }
                    const nestedPatchMatch = this.matchUrlPattern(path, UrlPatterns.NESTED_SINGLE);
                    if (nestedPatchMatch) {
                        const nestedRouteConfig = this.getNestedRouteConfig(
                            nestedPatchMatch.parentType!,
                            nestedPatchMatch.type,
                        );
                        if (nestedRouteConfig) {
                            return await this.processNestedUpdate(
                                client,
                                nestedPatchMatch.parentType!,
                                nestedPatchMatch.parentId!,
                                nestedPatchMatch.type,
                                nestedPatchMatch.id,
                                query,
                                requestBody,
                            );
                        }
                    }
                    let match = this.matchUrlPattern(path, UrlPatterns.SINGLE);
                    if (match) {
                        // resource update
                        return await this.processUpdate(client, match.type, match.id, query, requestBody);
                    }
                    match = this.matchUrlPattern(path, UrlPatterns.RELATIONSHIP);
                    if (match) {
                        // relationship update
                        return await this.processRelationshipCRUD(
                            client,
                            'update',
                            match.type,
                            match.id,
                            match.relationship as string,
                            query,
                            requestBody,
                        );
                    }

                    return this.makeError('invalidPath');
                }

                case 'DELETE': {
                    const nestedDeleteMatch = this.matchUrlPattern(path, UrlPatterns.NESTED_SINGLE);
                    if (nestedDeleteMatch) {
                        const nestedRouteConfig = this.getNestedRouteConfig(
                            nestedDeleteMatch.parentType!,
                            nestedDeleteMatch.type,
                        );
                        if (nestedRouteConfig) {
                            return await this.processNestedDelete(
                                client,
                                nestedDeleteMatch.parentType!,
                                nestedDeleteMatch.parentId!,
                                nestedDeleteMatch.type,
                                nestedDeleteMatch.id,
                            );
                        }
                    }
                    let match = this.matchUrlPattern(path, UrlPatterns.SINGLE);
                    if (match) {
                        // resource deletion
                        return await this.processDelete(client, match.type, match.id);
                    }

                    match = this.matchUrlPattern(path, UrlPatterns.RELATIONSHIP);
                    if (match) {
                        // relationship deletion (collection relationship only)
                        return await this.processRelationshipCRUD(
                            client,
                            'delete',
                            match.type,
                            match.id,
                            match.relationship as string,
                            query,
                            requestBody,
                        );
                    }

                    return this.makeError('invalidPath');
                }

                default:
                    return this.makeError('invalidPath');
            }
        } catch (err) {
            if (err instanceof InvalidValueError) {
                return this.makeError('invalidValue', err.message);
            } else if (err instanceof ORMError) {
                return this.handleORMError(err);
            } else {
                return this.handleGenericError(err);
            }
        }
    }

    private handleGenericError(err: unknown): Response | PromiseLike<Response> {
        return this.makeError('unknownError', err instanceof Error ? `${err.message}\n${err.stack}` : 'Unknown error');
    }

    private async processProcedureRequest({
        client,
        method,
        proc,
        query,
        requestBody,
    }: {
        client: ClientContract<Schema>;
        method: string;
        proc?: string;
        query?: Record<string, string | string[]>;
        requestBody?: unknown;
    }): Promise<Response> {
        if (!proc) {
            return this.makeProcBadInputErrorResponse('missing procedure name');
        }

        const procDef = getProcedureDef(this.schema, proc);
        if (!procDef) {
            return this.makeProcBadInputErrorResponse(`unknown procedure: ${proc}`);
        }

        const isMutation = !!procDef.mutation;
        if (isMutation) {
            if (method !== 'POST') {
                return this.makeProcBadInputErrorResponse('invalid request method, only POST is supported');
            }
        } else {
            if (method !== 'GET') {
                return this.makeProcBadInputErrorResponse('invalid request method, only GET is supported');
            }
        }

        const argsPayload = method === 'POST' ? requestBody : query;

        // support SuperJSON request payload format
        const { result: processedArgsPayload, error } = await processSuperJsonRequestPayload(argsPayload);
        if (error) {
            return this.makeProcBadInputErrorResponse(error);
        }

        let procInput: unknown;
        try {
            procInput = mapProcedureArgs(procDef, processedArgsPayload);
        } catch (err) {
            return this.makeProcBadInputErrorResponse(
                err instanceof Error ? err.message : 'invalid procedure arguments',
            );
        }

        try {
            log(this.log, 'debug', () => `handling "$procs.${proc}" request`);

            const clientResult = await (client as any).$procs?.[proc](procInput);
            const toSerialize = this.toPlainObject(clientResult);

            const { json, meta } = SuperJSON.serialize(toSerialize);
            const responseBody: any = { data: json };
            if (meta) {
                responseBody.meta = { serialization: meta };
            }

            return { status: 200, body: responseBody };
        } catch (err) {
            log(this.log, 'error', `error occurred when handling "$procs.${proc}" request`, err);
            if (err instanceof ORMError) {
                throw err; // top-level handler will take care of it
            }
            return this.makeProcGenericErrorResponse(err);
        }
    }

    private makeProcBadInputErrorResponse(message: string): Response {
        const resp = this.makeError('invalidPayload', message, 400);
        log(this.log, 'debug', () => `sending error response: ${JSON.stringify(resp)}`);
        return resp;
    }

    private makeProcGenericErrorResponse(err: unknown): Response {
        const message = err instanceof Error ? err.message : 'unknown error';
        const resp = this.makeError('unknownError', message, 500);
        log(this.log, 'debug', () => `sending error response: ${JSON.stringify(resp)}`);
        return resp;
    }

    private async processSingleRead(
        client: ClientContract<Schema>,
        type: string,
        resourceId: string,
        query: Record<string, string | string[]> | undefined,
        extraFilter?: any,
        pathOverride?: string,
    ): Promise<Response> {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const args: any = { where: this.mergeFilters(this.makeIdFilter(typeInfo.idFields, resourceId), extraFilter) };

        // include IDs of relation fields so that they can be serialized
        this.includeRelationshipIds(type, args, 'include');

        // handle "include" query parameter
        let include: string[] | undefined;
        if (query?.['include']) {
            const { select, error, allIncludes } = this.buildRelationSelect(type, query['include'], query);
            if (error) {
                return error;
            }
            if (select) {
                args.include = { ...args.include, ...select };
            }
            include = allIncludes;
        }

        // handle partial results for requested type
        const { select, error } = this.buildPartialSelect(type, query);
        if (error) return error;
        if (select) {
            args.select = { ...select, ...args.select };
            if (args.include) {
                args.select = {
                    ...args.select,
                    ...args.include,
                };
                args.include = undefined;
            }
        }

        const entity = await (client as any)[type].findUnique(args);

        if (entity) {
            const serializeOptions: Partial<SerializerOptions> = {
                include,
            };
            if (pathOverride) {
                serializeOptions.linkers = {
                    document: new tsjapi.Linker(() => this.makeLinkUrl(pathOverride)),
                };
            }

            return {
                status: 200,
                body: await this.serializeItems(type, entity, serializeOptions),
            };
        } else {
            return this.makeError('notFound');
        }
    }

    private async processFetchRelated(
        client: ClientContract<Schema>,
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string | string[]> | undefined,
    ): Promise<Response> {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.makeUnsupportedRelationshipError(type, relationship, 404);
        }

        let select: any;

        // handle "include" query parameter
        let include: string[] | undefined;
        if (query?.['include']) {
            const {
                select: relationSelect,
                error,
                allIncludes,
            } = this.buildRelationSelect(type, query['include'], query);
            if (error) {
                return error;
            }
            // trim the leading `$relationship.` from the include paths
            include = allIncludes
                .filter((i) => i.startsWith(`${relationship}.`))
                .map((i) => i.substring(`${relationship}.`.length));
            select = relationSelect;
        }

        // handle partial results for requested type
        if (!select) {
            const { select: partialFields, error } = this.buildPartialSelect(lowerCaseFirst(relationInfo.type), query);
            if (error) return error;

            select = partialFields ? { [relationship]: { select: { ...partialFields } } } : { [relationship]: true };
        }

        const args: any = {
            where: this.makeIdFilter(typeInfo.idFields, resourceId),
            select,
        };

        if (relationInfo.isCollection) {
            // if related data is a collection, it can be filtered, sorted, and paginated
            const error = this.injectRelationQuery(relationInfo.type, select, relationship, query);
            if (error) {
                return error;
            }
        }

        const entity: any = await (client as any)[type].findUnique(args);

        let paginator: Paginator<any> | undefined;

        if (entity?._count?.[relationship] !== undefined) {
            // build up paginator
            const total = entity?._count?.[relationship] as number;
            const url = this.makeNormalizedUrl(`/${type}/${resourceId}/${relationship}`, query);
            const { offset, limit } = this.getPagination(query);
            paginator = this.makePaginator(url, offset, limit, total);
        }

        if (entity?.[relationship]) {
            const mappedType = this.mapModelName(type);
            return {
                status: 200,
                body: await this.serializeItems(relationInfo.type, entity[relationship], {
                    linkers: {
                        document: new tsjapi.Linker(() =>
                            this.makeLinkUrl(`/${mappedType}/${resourceId}/${relationship}`),
                        ),
                        paginator,
                    },
                    include,
                }),
            };
        } else {
            return this.makeError('notFound');
        }
    }

    private async processReadRelationship(
        client: ClientContract<Schema>,
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string | string[]> | undefined,
    ): Promise<Response> {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.makeUnsupportedRelationshipError(type, relationship, 404);
        }

        const args: any = {
            where: this.makeIdFilter(typeInfo.idFields, resourceId),
            select: this.makeIdSelect(typeInfo.idFields),
        };

        // include IDs of relation fields so that they can be serialized
        args.select = { ...args.select, [relationship]: { select: this.makeIdSelect(relationInfo.idFields) } };

        let paginator: Paginator<any> | undefined;

        if (relationInfo.isCollection) {
            // if related data is a collection, it can be filtered, sorted, and paginated
            const error = this.injectRelationQuery(relationInfo.type, args.select, relationship, query);
            if (error) {
                return error;
            }
        }

        const entity: any = await (client as any)[type].findUnique(args);
        const mappedType = this.mapModelName(type);

        if (entity?._count?.[relationship] !== undefined) {
            // build up paginator
            const total = entity?._count?.[relationship] as number;
            const url = this.makeNormalizedUrl(`/${mappedType}/${resourceId}/relationships/${relationship}`, query);
            const { offset, limit } = this.getPagination(query);
            paginator = this.makePaginator(url, offset, limit, total);
        }

        if (entity?.[relationship]) {
            const serialized: any = await this.serializeItems(relationInfo.type, entity[relationship], {
                linkers: {
                    document: new tsjapi.Linker(() =>
                        this.makeLinkUrl(`/${mappedType}/${resourceId}/relationships/${relationship}`),
                    ),
                    paginator,
                },
                onlyIdentifier: true,
            });

            return {
                status: 200,
                body: serialized,
            };
        } else {
            return this.makeError('notFound');
        }
    }

    private async processCollectionRead(
        client: ClientContract<Schema>,
        type: string,
        query: Record<string, string | string[]> | undefined,
        extraFilter?: any,
        pathOverride?: string,
        resourceLinker?: Linker<[any]>,
    ): Promise<Response> {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const args: any = {};

        // add filter
        const { filter, error: filterError } = this.buildFilter(type, query);
        if (filterError) {
            return filterError;
        }
        if (filter) {
            args.where = filter;
        }

        if (extraFilter) {
            args.where = this.mergeFilters(args.where, extraFilter);
        }

        const { sort, error: sortError } = this.buildSort(type, query);
        if (sortError) {
            return sortError;
        }
        if (sort) {
            args.orderBy = sort;
        }

        // include IDs of relation fields so that they can be serialized
        this.includeRelationshipIds(type, args, 'include');

        // handle "include" query parameter
        let include: string[] | undefined;
        if (query?.['include']) {
            const { select, error, allIncludes } = this.buildRelationSelect(type, query['include'], query);
            if (error) {
                return error;
            }
            if (select) {
                args.include = { ...args.include, ...select };
            }
            include = allIncludes;
        }

        // handle partial results for requested type
        const { select, error } = this.buildPartialSelect(type, query);
        if (error) return error;
        if (select) {
            args.select = { ...select, ...args.select };
            if (args.include) {
                args.select = {
                    ...args.select,
                    ...args.include,
                };
                args.include = undefined;
            }
        }

        const { offset, limit } = this.getPagination(query);
        if (offset > 0) {
            args.skip = offset;
        }

        if (limit === Infinity) {
            const entities = await (client as any)[type].findMany(args);

            const body = await this.serializeItems(type, entities, {
                include,
                linkers: {
                    document: new tsjapi.Linker(() => this.makeLinkUrl(pathOverride ?? `/${this.mapModelName(type)}`)),
                    ...(resourceLinker ? { resource: resourceLinker } : {}),
                },
            });
            const total = entities.length;
            body.meta = this.addTotalCountToMeta(body.meta, total);

            return {
                status: 200,
                body: body,
            };
        } else {
            args.take = limit;

            const [entities, count] = await Promise.all([
                (client as any)[type].findMany(args),
                (client as any)[type].count({ where: args.where ?? {} }),
            ]);
            const total = count as number;

            const mappedType = this.mapModelName(type);
            const url = this.makeNormalizedUrl(pathOverride ?? `/${mappedType}`, query);
            const options: Partial<SerializerOptions> = {
                include,
                linkers: {
                    document: new tsjapi.Linker(() => this.makeLinkUrl(pathOverride ?? `/${mappedType}`)),
                    paginator: this.makePaginator(url, offset, limit, total),
                    ...(resourceLinker ? { resource: resourceLinker } : {}),
                },
            };
            const body = await this.serializeItems(type, entities, options);
            body.meta = this.addTotalCountToMeta(body.meta, total);

            return {
                status: 200,
                body: body,
            };
        }
    }

    private async processNestedCollectionRead(
        client: ClientContract<Schema>,
        parentType: string,
        parentId: string,
        childType: string,
        query: Record<string, string | string[]> | undefined,
    ): Promise<Response> {
        const nestedRouteConfig = this.getNestedRouteConfig(parentType, childType);
        if (!nestedRouteConfig) {
            return this.makeError('invalidPath');
        }

        const parentInfo = this.getModelInfo(parentType);
        if (!parentInfo) {
            return this.makeUnsupportedModelError(parentType);
        }

        const parentExists = await (client as any)[parentType].findFirst({
            where: this.makeIdFilter(parentInfo.idFields, parentId),
        });
        if (!parentExists) {
            return this.makeError('notFound');
        }

        const { filter, error } = this.buildNestedParentFilter(
            parentType,
            parentId,
            childType,
            nestedRouteConfig.relation,
        );
        if (error) {
            return error;
        }

        const childInfo = this.getModelInfo(childType)!;
        const mappedParentType = this.mapModelName(parentType);
        const mappedChildType = this.mapModelName(childType);
        const resourceLinker = new tsjapi.Linker((item: any) =>
            this.makeLinkUrl(`/${mappedParentType}/${parentId}/${mappedChildType}/${this.getId(childInfo.name, item)}`),
        );
        return this.processCollectionRead(
            client,
            childType,
            query,
            filter,
            `/${mappedParentType}/${parentId}/${mappedChildType}`,
            resourceLinker,
        );
    }

    private async processNestedSingleRead(
        client: ClientContract<Schema>,
        parentType: string,
        parentId: string,
        childType: string,
        childId: string,
        query: Record<string, string | string[]> | undefined,
    ): Promise<Response> {
        const nestedRouteConfig = this.getNestedRouteConfig(parentType, childType);
        if (!nestedRouteConfig) {
            return this.makeError('invalidPath');
        }

        const typeInfo = this.getModelInfo(childType);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(childType);
        }

        const { filter: nestedFilter, error: nestedError } = this.buildNestedParentFilter(
            parentType,
            parentId,
            childType,
            nestedRouteConfig.relation,
        );
        if (nestedError) {
            return nestedError;
        }

        const args: any = {
            where: this.mergeFilters(this.makeIdFilter(typeInfo.idFields, childId), nestedFilter),
        };

        this.includeRelationshipIds(childType, args, 'include');

        let include: string[] | undefined;
        if (query?.['include']) {
            const { select, error, allIncludes } = this.buildRelationSelect(childType, query['include'], query);
            if (error) {
                return error;
            }
            if (select) {
                args.include = { ...args.include, ...select };
            }
            include = allIncludes;
        }

        const { select, error } = this.buildPartialSelect(childType, query);
        if (error) return error;
        if (select) {
            args.select = { ...select, ...args.select };
            if (args.include) {
                args.select = {
                    ...args.select,
                    ...args.include,
                };
                args.include = undefined;
            }
        }

        const entity = await (client as any)[childType].findFirst(args);
        if (!entity) {
            return this.makeError('notFound');
        }

        const mappedParentType = this.mapModelName(parentType);
        const mappedChildType = this.mapModelName(childType);
        const nestedLinker = new tsjapi.Linker(() =>
            this.makeLinkUrl(`/${mappedParentType}/${parentId}/${mappedChildType}/${childId}`),
        );
        return {
            status: 200,
            body: await this.serializeItems(childType, entity, {
                include,
                linkers: {
                    document: nestedLinker,
                    resource: nestedLinker,
                },
            }),
        };
    }

    private async processNestedCreate(
        client: ClientContract<Schema>,
        parentType: string,
        parentId: string,
        childType: string,
        query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
    ): Promise<Response> {
        const nestedRouteConfig = this.getNestedRouteConfig(parentType, childType);
        if (!nestedRouteConfig) {
            return this.makeError('invalidPath');
        }

        const parentInfo = this.getModelInfo(parentType);
        if (!parentInfo) {
            return this.makeUnsupportedModelError(parentType);
        }

        const parentExists = await (client as any)[parentType].findFirst({
            where: this.makeIdFilter(parentInfo.idFields, parentId),
        });
        if (!parentExists) {
            return this.makeError('notFound');
        }

        const { error } = this.buildNestedParentFilter(parentType, parentId, childType, nestedRouteConfig.relation);
        if (error) {
            return error;
        }

        const childInfo = this.getModelInfo(childType)!;
        const mappedParentType = this.mapModelName(parentType);
        const mappedChildType = this.mapModelName(childType);
        const resourceLinker = new tsjapi.Linker((item: any) =>
            this.makeLinkUrl(`/${mappedParentType}/${parentId}/${mappedChildType}/${this.getId(childInfo.name, item)}`),
        );
        return this.processCreate(
            client,
            childType,
            query,
            requestBody,
            { relation: nestedRouteConfig.relation, parentId, parentIdFields: parentInfo.idFields },
            { document: resourceLinker, resource: resourceLinker },
        );
    }

    private async processNestedUpdate(
        client: ClientContract<Schema>,
        parentType: string,
        parentId: string,
        childType: string,
        childId: string,
        query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
    ): Promise<Response> {
        const nestedRouteConfig = this.getNestedRouteConfig(parentType, childType);
        if (!nestedRouteConfig) {
            return this.makeError('invalidPath');
        }

        const typeInfo = this.getModelInfo(childType);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(childType);
        }

        const { filter: nestedFilter, error } = this.buildNestedParentFilter(
            parentType,
            parentId,
            childType,
            nestedRouteConfig.relation,
        );
        if (error) {
            return error;
        }

        // Verify child belongs to parent before updating
        const exists = await (client as any)[childType].findFirst({
            where: this.mergeFilters(this.makeIdFilter(typeInfo.idFields, childId), nestedFilter),
        });
        if (!exists) {
            return this.makeError('notFound');
        }

        // Reject attempts to change the parent relation via the nested endpoint
        const body = requestBody as any;
        const rel = nestedRouteConfig.relation;
        if (
            typeof body?.data?.relationships === 'object' &&
            body.data.relationships !== null &&
            Object.prototype.hasOwnProperty.call(body.data.relationships, rel)
        ) {
            return this.makeError('invalidPayload', `Relation "${rel}" cannot be changed via a nested route`);
        }
        const fkFields = Object.values(typeInfo.fields).filter((f) => f.foreignKeyFor?.includes(rel));
        if (
            typeof body?.data?.attributes === 'object' &&
            body.data.attributes !== null &&
            fkFields.some((f) => Object.prototype.hasOwnProperty.call(body.data.attributes, f.name))
        ) {
            return this.makeError('invalidPayload', `Relation "${rel}" cannot be changed via a nested route`);
        }

        const mappedParentType = this.mapModelName(parentType);
        const mappedChildType = this.mapModelName(childType);
        const nestedLinker = new tsjapi.Linker(() =>
            this.makeLinkUrl(`/${mappedParentType}/${parentId}/${mappedChildType}/${childId}`),
        );
        return this.processUpdate(client, childType, childId, query, requestBody, {
            document: nestedLinker,
            resource: nestedLinker,
        });
    }

    private async processNestedDelete(
        client: ClientContract<Schema>,
        parentType: string,
        parentId: string,
        childType: string,
        childId: string,
    ): Promise<Response> {
        const nestedRouteConfig = this.getNestedRouteConfig(parentType, childType);
        if (!nestedRouteConfig) {
            return this.makeError('invalidPath');
        }

        const typeInfo = this.getModelInfo(childType);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(childType);
        }

        const { filter: nestedFilter, error } = this.buildNestedParentFilter(
            parentType,
            parentId,
            childType,
            nestedRouteConfig.relation,
        );
        if (error) {
            return error;
        }

        // Verify child belongs to parent before deleting
        const exists = await (client as any)[childType].findFirst({
            where: this.mergeFilters(this.makeIdFilter(typeInfo.idFields, childId), nestedFilter),
        });
        if (!exists) {
            return this.makeError('notFound');
        }

        return this.processDelete(client, childType, childId);
    }

    private buildPartialSelect(type: string, query: Record<string, string | string[]> | undefined) {
        const selectFieldsQuery = query?.[`fields[${type}]`];
        if (!selectFieldsQuery) {
            return { select: undefined, error: undefined };
        }

        if (Array.isArray(selectFieldsQuery)) {
            return {
                select: undefined,
                error: this.makeError('duplicatedFieldsParameter', `duplicated fields query for type ${type}`),
            };
        }

        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return { select: undefined, error: this.makeUnsupportedModelError(type) };
        }

        const selectFieldNames = selectFieldsQuery.split(',').filter((i) => i);

        const fields = selectFieldNames.reduce((acc, curr) => ({ ...acc, [curr]: true }), {});

        return {
            select: { ...this.makeIdSelect(typeInfo.idFields), ...fields },
        };
    }

    private addTotalCountToMeta(meta: any, total: any) {
        return meta ? Object.assign(meta, { total }) : Object.assign({}, { total });
    }

    private makePaginator(baseUrl: string, offset: number, limit: number, total: number) {
        if (limit === Infinity) {
            return undefined;
        }

        const totalPages = Math.ceil(total / limit);

        return new tsjapi.Paginator(() => ({
            first: this.replaceURLSearchParams(baseUrl, { 'page[limit]': limit }),
            last: this.replaceURLSearchParams(baseUrl, {
                'page[offset]': (totalPages - 1) * limit,
            }),
            prev:
                offset - limit >= 0 && offset - limit <= total - 1
                    ? this.replaceURLSearchParams(baseUrl, {
                          'page[offset]': offset - limit,
                          'page[limit]': limit,
                      })
                    : null,
            next:
                offset + limit <= total - 1
                    ? this.replaceURLSearchParams(baseUrl, {
                          'page[offset]': offset + limit,
                          'page[limit]': limit,
                      })
                    : null,
        }));
    }

    private processRequestBody(requestBody: unknown) {
        let body: any = requestBody;
        if (body.meta?.serialization) {
            // superjson deserialize body if a serialization meta is provided
            body = SuperJSON.deserialize({ json: body, meta: body.meta.serialization });
        }

        const parseResult = this.createUpdatePayloadSchema.safeParse(body);
        if (!parseResult.success) {
            return {
                attributes: undefined,
                relationships: undefined,
                error: this.makeError('invalidPayload', getZodErrorMessage(parseResult.error)),
            };
        }

        return {
            attributes: parseResult.data.data.attributes,
            relationships: parseResult.data.data.relationships,
            error: undefined,
        };
    }

    private async processCreate(
        client: ClientContract<Schema>,
        type: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
        forcedParentRelation?: { relation: string; parentId: string; parentIdFields: FieldDef[] },
        serializeLinkers?: SerializerOptions['linkers'],
    ): Promise<Response> {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const { attributes, relationships, error } = this.processRequestBody(requestBody);
        if (error) {
            return error;
        }

        const createPayload: any = { data: { ...attributes } };

        // turn relationship payload into `connect` objects
        if (relationships) {
            for (const [key, data] of Object.entries<any>(relationships)) {
                if (!data?.data) {
                    return this.makeError('invalidRelationData');
                }

                const relationInfo = typeInfo.relationships[key];
                if (!relationInfo) {
                    return this.makeUnsupportedRelationshipError(type, key, 400);
                }

                if (relationInfo.isCollection) {
                    createPayload.data[key] = {
                        connect: enumerate(data.data).map((item: any) =>
                            this.makeIdConnect(relationInfo.idFields, item.id),
                        ),
                    };
                } else {
                    if (typeof data.data !== 'object') {
                        return this.makeError('invalidRelationData');
                    }
                    createPayload.data[key] = {
                        connect: this.makeIdConnect(relationInfo.idFields, data.data.id),
                    };
                }

                // make sure ID fields are included for result serialization
                createPayload.include = {
                    ...createPayload.include,
                    [key]: { select: { [this.makeDefaultIdKey(relationInfo.idFields)]: true } },
                };
            }
        }

        if (forcedParentRelation) {
            if (relationships && forcedParentRelation.relation in relationships) {
                return this.makeError(
                    'invalidPayload',
                    `Relation "${forcedParentRelation.relation}" is controlled by the parent route and cannot be set in the request payload`,
                );
            }
            // Also reject scalar FK fields in attributes that could override the forced parent relation
            const forcedFkFields = Object.values(typeInfo.fields).filter((f) =>
                f.foreignKeyFor?.includes(forcedParentRelation.relation),
            );
            if (forcedFkFields.some((f) => Object.prototype.hasOwnProperty.call(createPayload.data, f.name))) {
                return this.makeError(
                    'invalidPayload',
                    `Relation "${forcedParentRelation.relation}" is controlled by the parent route and cannot be set in the request payload`,
                );
            }
            createPayload.data[forcedParentRelation.relation] = {
                connect: this.makeIdConnect(forcedParentRelation.parentIdFields, forcedParentRelation.parentId),
            };
            createPayload.include = {
                ...createPayload.include,
                [forcedParentRelation.relation]: {
                    select: { [this.makeDefaultIdKey(forcedParentRelation.parentIdFields)]: true },
                },
            };
        }

        // include IDs of relation fields so that they can be serialized.
        this.includeRelationshipIds(type, createPayload, 'include');

        const entity = await (client as any)[type].create(createPayload);
        return {
            status: 201,
            body: await this.serializeItems(type, entity, serializeLinkers ? { linkers: serializeLinkers } : undefined),
        };
    }

    private async processUpsert(
        client: ClientContract<Schema>,
        type: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
    ) {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const modelName = typeInfo.name;
        const { attributes, relationships, error } = this.processRequestBody(requestBody);
        if (error) {
            return error;
        }

        const parseResult = this.upsertMetaSchema.safeParse(requestBody);
        if (parseResult.error) {
            return this.makeError('invalidPayload', getZodErrorMessage(parseResult.error));
        }
        const matchFields = parseResult.data.meta.matchFields;
        const uniqueFieldSets = this.getUniqueFieldSets(modelName);

        if (!uniqueFieldSets.some((set) => set.every((field) => matchFields.includes(field)))) {
            return this.makeError('invalidPayload', 'Match fields must be unique fields', 400);
        }

        const upsertPayload: any = {
            where: this.makeUpsertWhere(matchFields, attributes, typeInfo),
            create: { ...attributes },
            update: {
                ...Object.fromEntries(Object.entries(attributes ?? {}).filter((e) => !matchFields.includes(e[0]))),
            },
        };

        if (relationships) {
            for (const [key, data] of Object.entries<any>(relationships)) {
                if (!data?.data) {
                    return this.makeError('invalidRelationData');
                }

                const relationInfo = typeInfo.relationships[key];
                if (!relationInfo) {
                    return this.makeUnsupportedRelationshipError(modelName, key, 400);
                }

                if (relationInfo.isCollection) {
                    upsertPayload.create[key] = {
                        connect: enumerate(data.data).map((item: any) =>
                            this.makeIdConnect(relationInfo.idFields, item.id),
                        ),
                    };
                    upsertPayload.update[key] = {
                        set: enumerate(data.data).map((item: any) =>
                            this.makeIdConnect(relationInfo.idFields, item.id),
                        ),
                    };
                } else {
                    if (typeof data.data !== 'object') {
                        return this.makeError('invalidRelationData');
                    }
                    upsertPayload.create[key] = {
                        connect: this.makeIdConnect(relationInfo.idFields, data.data.id),
                    };
                    upsertPayload.update[key] = {
                        connect: this.makeIdConnect(relationInfo.idFields, data.data.id),
                    };
                }
            }
        }

        // include IDs of relation fields so that they can be serialized.
        this.includeRelationshipIds(modelName, upsertPayload, 'include');

        const entity = await (client as any)[modelName].upsert(upsertPayload);

        return {
            status: 201,
            body: await this.serializeItems(modelName, entity),
        };
    }

    private getUniqueFieldSets(type: string) {
        const modelDef = this.requireModel(type);
        return Object.entries(modelDef.uniqueFields).map(
            ([k, v]) =>
                typeof v.type === 'string'
                    ? [k] // single unique field
                    : Object.keys(v), // compound unique fields
        );
    }

    private async processRelationshipCRUD(
        client: ClientContract<Schema>,
        mode: 'create' | 'update' | 'delete',
        type: string,
        resourceId: string,
        relationship: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
    ): Promise<Response> {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.makeUnsupportedRelationshipError(type, relationship, 404);
        }

        if (!relationInfo.isCollection && mode !== 'update') {
            // to-one relation can only be updated
            return this.makeError('invalidVerb');
        }

        const updateArgs: any = {
            where: this.makeIdFilter(typeInfo.idFields, resourceId),
            select: {
                ...typeInfo.idFields.reduce((acc, field) => ({ ...acc, [field.name]: true }), {}),
                [relationship]: { select: this.makeIdSelect(relationInfo.idFields) },
            },
        };

        if (!relationInfo.isCollection) {
            // zod-parse payload
            const parsed = this.updateSingleRelationSchema.safeParse(requestBody);
            if (!parsed.success) {
                return this.makeError('invalidPayload', getZodErrorMessage(parsed.error));
            }

            if (parsed.data.data === null) {
                if (!relationInfo.isOptional) {
                    // cannot disconnect a required relation
                    return this.makeError('invalidPayload');
                }
                // set null -> disconnect
                updateArgs.data = {
                    [relationship]: {
                        disconnect: true,
                    },
                };
            } else {
                updateArgs.data = {
                    [relationship]: {
                        connect: this.makeIdConnect(relationInfo.idFields, parsed.data.data.id),
                    },
                };
            }
        } else {
            // zod-parse payload
            const parsed = this.updateCollectionRelationSchema.safeParse(requestBody);
            if (!parsed.success) {
                return this.makeError('invalidPayload', getZodErrorMessage(parsed.error));
            }

            // create -> connect, delete -> disconnect, update -> set
            const relationVerb = mode === 'create' ? 'connect' : mode === 'delete' ? 'disconnect' : 'set';

            updateArgs.data = {
                [relationship]: {
                    [relationVerb]: enumerate(parsed.data.data).map((item: any) =>
                        this.makeIdFilter(relationInfo.idFields, item.id),
                    ),
                },
            };
        }

        const entity: any = await (client as any)[type].update(updateArgs);

        const mappedType = this.mapModelName(type);

        const serialized: any = await this.serializeItems(relationInfo.type, entity[relationship], {
            linkers: {
                document: new tsjapi.Linker(() =>
                    this.makeLinkUrl(`/${mappedType}/${resourceId}/relationships/${relationship}`),
                ),
            },
            onlyIdentifier: true,
        });

        return {
            status: 200,
            body: serialized,
        };
    }

    private async processUpdate(
        client: ClientContract<Schema>,
        type: any,
        resourceId: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
        serializeLinkers?: SerializerOptions['linkers'],
    ): Promise<Response> {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const { attributes, relationships, error } = this.processRequestBody(requestBody);
        if (error) {
            return error;
        }

        const updatePayload: any = {
            where: this.makeIdFilter(typeInfo.idFields, resourceId),
            data: { ...attributes },
        };

        // turn relationships into query payload
        if (relationships) {
            for (const [key, data] of Object.entries<any>(relationships)) {
                if (!data?.data) {
                    return this.makeError('invalidRelationData');
                }

                const relationInfo = typeInfo.relationships[key];
                if (!relationInfo) {
                    return this.makeUnsupportedRelationshipError(type, key, 400);
                }

                if (relationInfo.isCollection) {
                    updatePayload.data[key] = {
                        set: enumerate(data.data).map((item: any) => ({
                            [this.makeDefaultIdKey(relationInfo.idFields)]: item.id,
                        })),
                    };
                } else {
                    if (typeof data.data !== 'object') {
                        return this.makeError('invalidRelationData');
                    }
                    updatePayload.data[key] = {
                        connect: {
                            [this.makeDefaultIdKey(relationInfo.idFields)]: data.data.id,
                        },
                    };
                }
                updatePayload.include = {
                    ...updatePayload.include,
                    [key]: { select: { [this.makeDefaultIdKey(relationInfo.idFields)]: true } },
                };
            }
        }

        // include IDs of relation fields so that they can be serialized.
        this.includeRelationshipIds(type, updatePayload, 'include');

        const entity = await (client as any)[type].update(updatePayload);
        return {
            status: 200,
            body: await this.serializeItems(type, entity, serializeLinkers ? { linkers: serializeLinkers } : undefined),
        };
    }

    private async processDelete(client: ClientContract<Schema>, type: any, resourceId: string): Promise<Response> {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        await (client as any)[type].delete({
            where: this.makeIdFilter(typeInfo.idFields, resourceId),
        });
        return {
            status: 200,
            body: { meta: {} },
        };
    }

    //#region utilities

    private requireModel(model: string): ModelDef {
        const modelDef = this.schema.models[model];
        if (!modelDef) {
            throw new Error(`Model ${model} is not defined in the schema`);
        }
        return modelDef;
    }

    private getIdFields(model: string): FieldDef[] {
        const modelDef = this.requireModel(model);
        const modelLower = lowerCaseFirst(model);
        if (!(modelLower in this.externalIdMapping)) {
            return Object.values(modelDef.fields).filter((f) => modelDef.idFields.includes(f.name));
        }

        // map external ID name to unique constraint field
        const externalIdName = this.externalIdMapping[modelLower];
        for (const [name, info] of Object.entries(modelDef.uniqueFields)) {
            if (name === externalIdName) {
                if (typeof info.type === 'string') {
                    // single unique field
                    return [this.requireField(model, name)];
                } else {
                    // compound unique fields
                    return Object.keys(info).map((f) => this.requireField(model, f));
                }
            }
        }

        throw new Error(`Model ${model} does not have unique key ${externalIdName}`);
    }

    private requireField(model: string, field: string): FieldDef {
        const modelDef = this.requireModel(model);
        const fieldDef = modelDef.fields[field];
        if (!fieldDef) {
            throw new Error(`Field ${field} is not defined in model ${model}`);
        }
        return fieldDef;
    }

    private buildTypeMap() {
        this.typeMap = {};
        for (const [model, { fields }] of Object.entries(this.schema.models)) {
            const idFields = this.getIdFields(model);
            if (idFields.length === 0) {
                log(this.options.log, 'warn', `Not including model ${model} in the API because it has no ID field`);
                continue;
            }

            const modelInfo: ModelInfo = (this.typeMap[lowerCaseFirst(model)] = {
                name: model,
                idFields,
                relationships: {},
                fields,
            });

            for (const [field, fieldInfo] of Object.entries(fields)) {
                if (!fieldInfo.relation) {
                    continue;
                }
                const fieldTypeIdFields = this.getIdFields(fieldInfo.type);
                if (fieldTypeIdFields.length === 0) {
                    log(
                        this.options.log,
                        'warn',
                        `Not including relation ${model}.${field} in the API because it has no ID field`,
                    );
                    continue;
                }

                modelInfo.relationships[field] = {
                    type: fieldInfo.type,
                    idFields: fieldTypeIdFields,
                    isCollection: !!fieldInfo.array,
                    isOptional: !!fieldInfo.optional,
                };
            }
        }
    }

    private getModelInfo(model: string): ModelInfo | undefined {
        return this.typeMap[lowerCaseFirst(model)];
    }

    private makeLinkUrl(path: string) {
        return `${this.options.endpoint}${path}`;
    }

    private buildSerializers() {
        const linkers: Record<string, Linker<any>> = {};

        for (const model of Object.keys(this.schema.models)) {
            const ids = this.getIdFields(model);
            const modelLower = lowerCaseFirst(model);
            const mappedModel = this.mapModelName(modelLower);

            if (ids.length < 1) {
                continue;
            }

            const linker = new tsjapi.Linker((items) =>
                Array.isArray(items)
                    ? this.makeLinkUrl(`/${mappedModel}`)
                    : this.makeLinkUrl(`/${mappedModel}/${this.getId(model, items)}`),
            );
            linkers[modelLower] = linker;

            let projection: Record<string, 0> | null = {};
            const modelDef = this.requireModel(model);
            for (const [field, fieldDef] of Object.entries(modelDef.fields)) {
                if (fieldDef.relation) {
                    projection[field] = 0;
                }
            }
            if (Object.keys(projection).length === 0) {
                projection = null;
            }

            const serializer = new tsjapi.Serializer(model, {
                version: '1.1',
                idKey: this.makeIdKey(ids),
                linkers: {
                    resource: linker,
                    document: linker,
                },
                projection,
            });
            this.serializers.set(modelLower, serializer);
        }

        // set relators
        for (const model of Object.keys(this.schema.models)) {
            const modelLower = lowerCaseFirst(model);
            const serializer = this.serializers.get(modelLower);
            if (!serializer) {
                continue;
            }

            const relators: Record<string, Relator<any>> = {};
            const modelDef = this.requireModel(model);
            for (const [field, fieldDef] of Object.entries(modelDef.fields)) {
                if (!fieldDef.relation) {
                    continue;
                }
                const fieldSerializer = this.serializers.get(lowerCaseFirst(fieldDef.type));
                if (!fieldSerializer) {
                    continue;
                }
                const fieldIds = this.getIdFields(fieldDef.type);
                if (fieldIds.length > 0) {
                    const mappedModel = this.mapModelName(modelLower);

                    const relator = new tsjapi.Relator(
                        async (data) => {
                            return (data as any)[field];
                        },
                        fieldSerializer,
                        {
                            relatedName: field,
                            linkers: {
                                related: new tsjapi.Linker((primary) =>
                                    this.makeLinkUrl(`/${mappedModel}/${this.getId(model, primary)}/${field}`),
                                ),
                                relationship: new tsjapi.Linker((primary) =>
                                    this.makeLinkUrl(
                                        `/${mappedModel}/${this.getId(model, primary)}/relationships/${field}`,
                                    ),
                                ),
                            },
                        },
                    );
                    relators[field] = relator;
                }
            }
            serializer.setRelators(relators);
        }
    }

    private getId(model: string, data: any) {
        if (!data) {
            return undefined;
        }
        const ids = this.getIdFields(model);
        if (ids.length === 0) {
            return undefined;
        } else {
            return data[this.makeIdKey(ids)];
        }
    }

    private async serializeItems(model: string, items: unknown, options?: Partial<SerializerOptions<any>>) {
        model = lowerCaseFirst(model);
        const serializer = this.serializers.get(model);
        if (!serializer) {
            throw new Error(`serializer not found for model ${model}`);
        }

        const itemsWithId = clone(items);
        this.injectCompoundId(model, itemsWithId);

        // serialize to JSON:API structure
        const serialized = await serializer.serialize(itemsWithId, options);

        // convert the serialization result to plain object otherwise SuperJSON won't work
        const plainResult = this.toPlainObject(serialized);

        // superjson serialize the result
        const { json, meta } = SuperJSON.serialize(plainResult);

        const result: any = json;
        if (meta) {
            result.meta = { ...result.meta, serialization: meta };
        }

        return result;
    }

    private injectCompoundId(model: string, items: unknown) {
        const typeInfo = this.getModelInfo(model);
        if (!typeInfo) {
            return;
        }

        // recursively traverse the entity to create synthetic ID field for models with compound ID
        enumerate(items).forEach((item: any) => {
            if (!item) {
                return;
            }

            if (typeInfo.idFields.length > 1) {
                item[this.makeIdKey(typeInfo.idFields)] = this.makeCompoundId(typeInfo.idFields, item);
            }

            for (const [key, value] of Object.entries(item)) {
                if (typeInfo.relationships[key]) {
                    // field is a relationship, recurse
                    this.injectCompoundId(typeInfo.relationships[key].type, value);
                }
            }
        });
    }

    private toPlainObject(data: any): any {
        if (data === undefined || data === null) {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map((item: any) => this.toPlainObject(item));
        }

        if (typeof data === 'object') {
            if (typeof data.toJSON === 'function') {
                // custom toJSON function
                return data.toJSON();
            }
            const result: any = {};
            for (const [field, value] of Object.entries(data)) {
                if (value === undefined || typeof value === 'function') {
                    // trim undefined and functions
                    continue;
                } else if (field === 'attributes') {
                    // don't visit into entity data
                    result[field] = value;
                } else {
                    result[field] = this.toPlainObject(value);
                }
            }
            return result;
        }

        return data;
    }

    private replaceURLSearchParams(url: string, params: Record<string, string | number>) {
        const r = new URL(url);
        for (const [key, value] of Object.entries(params)) {
            r.searchParams.set(key, value.toString());
        }
        return r.toString();
    }

    private makeIdFilter(idFields: FieldDef[], resourceId: string, nested: boolean = true) {
        const decodedId = decodeURIComponent(resourceId);
        if (idFields.length === 1) {
            return { [idFields[0]!.name]: this.coerce(idFields[0]!, decodedId) };
        } else if (nested) {
            return {
                // TODO: support `@@id` with custom name
                [idFields.map((idf) => idf.name).join(DEFAULT_ID_DIVIDER)]: idFields.reduce(
                    (acc, curr, idx) => ({
                        ...acc,
                        [curr.name]: this.coerce(curr, decodedId.split(this.idDivider)[idx]),
                    }),
                    {},
                ),
            };
        } else {
            return idFields.reduce(
                (acc, curr, idx) => ({
                    ...acc,
                    [curr.name]: this.coerce(curr, decodedId.split(this.idDivider)[idx]),
                }),
                {},
            );
        }
    }

    private makeIdSelect(idFields: FieldDef[]) {
        if (idFields.length === 0) {
            throw this.errors['noId'];
        }
        return idFields.reduce((acc, curr) => ({ ...acc, [curr.name]: true }), {});
    }

    private makeIdConnect(idFields: FieldDef[], id: string | number) {
        if (idFields.length === 1) {
            return { [idFields[0]!.name]: this.coerce(idFields[0]!, id) };
        } else {
            return {
                [this.makeDefaultIdKey(idFields)]: idFields.reduce(
                    (acc, curr, idx) => ({
                        ...acc,
                        [curr.name]: this.coerce(curr, `${id}`.split(this.idDivider)[idx]),
                    }),
                    {},
                ),
            };
        }
    }

    private makeIdKey(idFields: FieldDef[]) {
        return idFields.map((idf) => idf.name).join(this.idDivider);
    }

    private makeDefaultIdKey(idFields: FieldDef[]) {
        // TODO: support `@@id` with custom name
        return idFields.map((idf) => idf.name).join(DEFAULT_ID_DIVIDER);
    }

    private makeCompoundId(idFields: FieldDef[], item: any) {
        return idFields.map((idf) => item[idf.name]).join(this.idDivider);
    }

    private makeUpsertWhere(matchFields: any[], attributes: any, typeInfo: ModelInfo) {
        const where = matchFields.reduce((acc: any, field: string) => {
            acc[field] = attributes[field] ?? null;
            return acc;
        }, {});

        if (
            typeInfo.idFields.length > 1 &&
            matchFields.some((mf) => typeInfo.idFields.map((idf) => idf.name).includes(mf))
        ) {
            return {
                [this.makeDefaultIdKey(typeInfo.idFields)]: where,
            };
        }

        return where;
    }

    private includeRelationshipIds(model: string, args: any, mode: 'select' | 'include') {
        const typeInfo = this.getModelInfo(model);
        if (!typeInfo) {
            return;
        }
        for (const [relation, relationInfo] of Object.entries(typeInfo.relationships)) {
            args[mode] = { ...args[mode], [relation]: { select: this.makeIdSelect(relationInfo.idFields) } };
        }
    }

    private coerce(fieldDef: FieldDef, value: any) {
        if (typeof value === 'string') {
            if (fieldDef.attributes?.some((attr) => attr.name === '@json')) {
                try {
                    return JSON.parse(value);
                } catch {
                    throw new InvalidValueError(`invalid JSON value: ${value}`);
                }
            }

            const type = fieldDef.type;
            if (type === 'Int') {
                const parsed = parseInt(value);
                if (isNaN(parsed)) {
                    throw new InvalidValueError(`invalid ${type} value: ${value}`);
                }
                return parsed;
            } else if (type === 'BigInt') {
                try {
                    return BigInt(value);
                } catch {
                    throw new InvalidValueError(`invalid ${type} value: ${value}`);
                }
            } else if (type === 'Float') {
                const parsed = parseFloat(value);
                if (isNaN(parsed)) {
                    throw new InvalidValueError(`invalid ${type} value: ${value}`);
                }
                return parsed;
            } else if (type === 'Decimal') {
                try {
                    return new Decimal(value);
                } catch {
                    throw new InvalidValueError(`invalid ${type} value: ${value}`);
                }
            } else if (type === 'Boolean') {
                if (value === 'true') {
                    return true;
                } else if (value === 'false') {
                    return false;
                } else {
                    throw new InvalidValueError(`invalid ${type} value: ${value}`);
                }
            }
        }
        return value;
    }

    private makeNormalizedUrl(path: string, query: Record<string, string | string[]> | undefined) {
        const url = new URL(this.makeLinkUrl(path));
        for (const [key, value] of Object.entries(query ?? {})) {
            if (
                key.startsWith('filter[') ||
                key.startsWith('sort[') ||
                key === 'include' ||
                key.startsWith('include[') ||
                key.startsWith('fields[')
            ) {
                for (const v of enumerate(value)) {
                    url.searchParams.append(key, v);
                }
            }
        }
        return url.toString();
    }

    private getPagination(query: Record<string, string | string[]> | undefined) {
        if (!query) {
            return { offset: 0, limit: this.options.pageSize ?? DEFAULT_PAGE_SIZE };
        }

        let offset = 0;
        if (query['page[offset]']) {
            const value = query['page[offset]'];
            const offsetText = Array.isArray(value) ? value[value.length - 1]! : value;
            offset = parseInt(offsetText);
            if (isNaN(offset) || offset < 0) {
                offset = 0;
            }
        }

        let pageSizeOption = this.options.pageSize ?? DEFAULT_PAGE_SIZE;
        if (pageSizeOption <= 0) {
            pageSizeOption = DEFAULT_PAGE_SIZE;
        }

        let limit = pageSizeOption;
        if (query['page[limit]']) {
            const value = query['page[limit]'];
            const limitText = Array.isArray(value) ? value[value.length - 1]! : value;
            limit = parseInt(limitText);
            if (isNaN(limit) || limit <= 0) {
                limit = pageSizeOption;
            }
            limit = Math.min(pageSizeOption, limit);
        }

        return { offset, limit };
    }

    private buildFilter(
        type: string,
        query: Record<string, string | string[]> | undefined,
    ): { filter: any; error: any } {
        if (!query) {
            return { filter: undefined, error: undefined };
        }

        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return { filter: undefined, error: this.makeUnsupportedModelError(type) };
        }

        const items: any[] = [];

        for (const [key, value] of Object.entries(query)) {
            if (!value) {
                continue;
            }

            // try matching query parameter key as "filter[x][y]..."
            const match = key.match(this.filterParamPattern);
            if (!match || !match.groups || !match.groups['match']) {
                continue;
            }

            const filterKeys = match.groups['match']
                .replaceAll(/[[\]]/g, ' ')
                .split(' ')
                .filter((i) => i);

            if (!filterKeys.length) {
                continue;
            }

            // turn filter into a nested query object

            const item: any = {};
            let curr = item;
            let currType = typeInfo;

            for (const filterValue of enumerate(value)) {
                for (let i = 0; i < filterKeys.length; i++) {
                    // extract filter operation from (optional) trailing $op
                    let filterKey = filterKeys[i]!;
                    let filterOp: FilterOperationType | undefined;
                    const pos = filterKey.indexOf('$');
                    if (pos > 0) {
                        filterOp = filterKey.substring(pos + 1) as FilterOperationType;
                        filterKey = filterKey.substring(0, pos);
                    }

                    if (!!filterOp && !FilterOperations.includes(filterOp)) {
                        return {
                            filter: undefined,
                            error: this.makeError('invalidFilter', `invalid filter operation: ${filterOp}`),
                        };
                    }

                    const idFields = this.getIdFields(currType.name);
                    const fieldDef =
                        filterKey === 'id'
                            ? Object.values(currType.fields).find((f) => idFields.some((idf) => idf.name === f.name))
                            : currType.fields[filterKey];
                    if (!fieldDef) {
                        return { filter: undefined, error: this.makeError('invalidFilter') };
                    }

                    if (!fieldDef.relation) {
                        // regular field
                        if (i !== filterKeys.length - 1) {
                            // must be the last segment of a filter
                            return { filter: undefined, error: this.makeError('invalidFilter') };
                        }
                        curr[fieldDef.name] = this.makeFilterValue(fieldDef, filterValue, filterOp);
                    } else {
                        // relation field
                        if (i === filterKeys.length - 1) {
                            curr[fieldDef.name] = this.makeFilterValue(fieldDef, filterValue, filterOp);
                        } else {
                            // keep going
                            if (fieldDef.array) {
                                // collection filtering implies "some" operation
                                curr[fieldDef.name] = { some: {} };
                                curr = curr[fieldDef.name].some;
                            } else {
                                curr = curr[fieldDef.name] = {};
                            }
                            currType = this.getModelInfo(fieldDef.type)!;
                        }
                    }
                }
                items.push(item);
            }
        }

        if (items.length === 0) {
            return { filter: undefined, error: undefined };
        } else {
            // combine filters with AND
            return { filter: items.length === 1 ? items[0] : { AND: items }, error: undefined };
        }
    }

    private buildSort(type: string, query: Record<string, string | string[]> | undefined) {
        if (!query?.['sort']) {
            return { sort: undefined, error: undefined };
        }

        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return { sort: undefined, error: this.makeUnsupportedModelError(type) };
        }

        const result: any[] = [];

        for (const sortSpec of enumerate(query['sort'])) {
            const sortFields = sortSpec.split(',').filter((i) => i);

            for (const sortField of sortFields) {
                const dir = sortField.startsWith('-') ? 'desc' : 'asc';
                const cleanedSortField = sortField.startsWith('-') ? sortField.substring(1) : sortField;
                const parts = cleanedSortField.split('.').filter((i) => i);

                const sortItem: any = {};
                let curr = sortItem;
                let currType = typeInfo;

                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i]!;

                    const fieldInfo = currType.fields[part];
                    if (!fieldInfo || fieldInfo.array) {
                        return {
                            sort: undefined,
                            error: this.makeError('invalidSort', 'sorting by array field is not supported'),
                        };
                    }

                    if (i === parts.length - 1) {
                        if (fieldInfo.relation) {
                            // relation field: sort by id
                            const relationType = this.getModelInfo(fieldInfo.type);
                            if (!relationType) {
                                return { sort: undefined, error: this.makeUnsupportedModelError(fieldInfo.type) };
                            }
                            curr[fieldInfo.name] = relationType.idFields.reduce((acc: any, idField: FieldDef) => {
                                acc[idField.name] = dir;
                                return acc;
                            }, {});
                        } else {
                            // regular field
                            curr[fieldInfo.name] = dir;
                        }
                    } else {
                        if (!fieldInfo.relation) {
                            // must be a relation field
                            return {
                                sort: undefined,
                                error: this.makeError(
                                    'invalidSort',
                                    'intermediate sort segments must be relationships',
                                ),
                            };
                        }
                        // keep going
                        curr = curr[fieldInfo.name] = {};
                        currType = this.getModelInfo(fieldInfo.type)!;
                        if (!currType) {
                            return { sort: undefined, error: this.makeUnsupportedModelError(fieldInfo.type) };
                        }
                    }
                }

                result.push(sortItem);
            }
        }

        return { sort: result, error: undefined };
    }

    private buildRelationSelect(
        type: string,
        include: string | string[],
        query: Record<string, string | string[]> | undefined,
    ) {
        const typeInfo = this.getModelInfo(type);
        if (!typeInfo) {
            return { select: undefined, error: this.makeUnsupportedModelError(type) };
        }

        const result: any = {};
        const allIncludes: string[] = [];

        for (const includeItem of enumerate(include)) {
            const inclusions = includeItem.split(',').filter((i) => i);
            for (const inclusion of inclusions) {
                allIncludes.push(inclusion);

                const parts = inclusion.split('.');
                let currPayload = result;
                let currType = typeInfo;

                for (let i = 0; i < parts.length; i++) {
                    const relation = parts[i]!;
                    const relationInfo = currType.relationships[relation];
                    if (!relationInfo) {
                        return { select: undefined, error: this.makeUnsupportedRelationshipError(type, relation, 400) };
                    }

                    currType = this.getModelInfo(relationInfo.type)!;
                    if (!currType) {
                        return { select: undefined, error: this.makeUnsupportedModelError(relationInfo.type) };
                    }

                    // handle partial results for requested type
                    const { select, error } = this.buildPartialSelect(lowerCaseFirst(relationInfo.type), query);
                    if (error) return { select: undefined, error };

                    if (i !== parts.length - 1) {
                        if (select) {
                            currPayload[relation] = { select: { ...select } };
                            currPayload = currPayload[relation].select;
                        } else {
                            currPayload[relation] = { include: { ...currPayload[relation]?.include } };
                            currPayload = currPayload[relation].include;
                        }
                    } else {
                        currPayload[relation] = select
                            ? {
                                  select: { ...select },
                              }
                            : true;
                    }
                }
            }
        }

        return { select: result, error: undefined, allIncludes };
    }

    private makeFilterValue(fieldDef: FieldDef, value: string, op: FilterOperationType): any {
        // TODO: inequality filters?
        if (fieldDef.relation) {
            // relation filter is converted to an ID filter
            const info = this.getModelInfo(fieldDef.type)!;
            if (fieldDef.array) {
                // filtering a to-many relation, imply 'some' operator
                const values = value.split(',').filter((i) => i);
                const filterValue =
                    values.length > 1
                        ? { OR: values.map((v) => this.makeIdFilter(info.idFields, v, false)) }
                        : this.makeIdFilter(info.idFields, value, false);
                return { some: filterValue };
            } else {
                const values = value.split(',').filter((i) => i);
                if (values.length > 1) {
                    return { OR: values.map((v) => this.makeIdFilter(info.idFields, v, false)) };
                } else {
                    return { is: this.makeIdFilter(info.idFields, value, false) };
                }
            }
        } else {
            if (op === 'between') {
                const parts = value.split(',').map((v) => this.coerce(fieldDef, v));
                if (parts.length !== 2) {
                    throw new InvalidValueError(`"between" expects exactly 2 comma-separated values`);
                }
                return { between: [parts[0]!, parts[1]!] };
            }
            const coerced = this.coerce(fieldDef, value);
            switch (op) {
                case 'icontains':
                    return { contains: coerced, mode: 'insensitive' };
                case 'hasSome':
                case 'hasEvery': {
                    const values = value
                        .split(',')
                        .filter((i) => i)
                        .map((v) => this.coerce(fieldDef, v));
                    return { [op]: values };
                }
                case 'isEmpty':
                    if (value !== 'true' && value !== 'false') {
                        throw new InvalidValueError(`Not a boolean: ${value}`);
                    }
                    return { isEmpty: value === 'true' ? true : false };
                default:
                    if (op === undefined) {
                        if (fieldDef.attributes?.some((attr) => attr.name === '@json')) {
                            // handle JSON value equality filter
                            return { equals: coerced };
                        }

                        // regular filter, split value by comma
                        const values = value
                            .split(',')
                            .filter((i) => i)
                            .map((v) => this.coerce(fieldDef, v));
                        return values.length > 1 ? { in: values } : { equals: values[0] };
                    } else {
                        return { [op]: coerced };
                    }
            }
        }
    }

    private injectRelationQuery(
        type: string,
        injectTarget: any,
        injectKey: string,
        query: Record<string, string | string[]> | undefined,
    ) {
        const { filter, error: filterError } = this.buildFilter(type, query);
        if (filterError) {
            return filterError;
        }

        if (filter) {
            injectTarget[injectKey] = { ...injectTarget[injectKey], where: filter };
        }

        const { sort, error: sortError } = this.buildSort(type, query);
        if (sortError) {
            return sortError;
        }
        if (sort) {
            injectTarget[injectKey] = { ...injectTarget[injectKey], orderBy: sort };
        }

        const pagination = this.getPagination(query);
        const offset = pagination.offset;
        if (offset > 0) {
            // inject skip
            injectTarget[injectKey] = { ...injectTarget[injectKey], skip: offset };
        }
        const limit = pagination.limit;
        if (limit !== Infinity) {
            // inject take
            injectTarget[injectKey] = { ...injectTarget[injectKey], take: limit };

            // include a count query  for the relationship
            injectTarget._count = { select: { [injectKey]: true } };
        }
    }

    private handleORMError(err: ORMError) {
        return match(err.reason)
            .with(ORMErrorReason.INVALID_INPUT, () => {
                return this.makeError('validationError', err.message, 422);
            })
            .with(ORMErrorReason.REJECTED_BY_POLICY, () => {
                return this.makeError('forbidden', err.message, 403, { reason: err.rejectedByPolicyReason });
            })
            .with(ORMErrorReason.NOT_FOUND, () => {
                return this.makeError('notFound', err.message, 404);
            })
            .with(ORMErrorReason.DB_QUERY_ERROR, () => {
                return this.makeError('queryError', err.message, 400, {
                    dbErrorCode: err.dbErrorCode,
                });
            })
            .otherwise(() => {
                return this.makeError('unknownError', err.message);
            });
    }

    private makeError(
        code: keyof typeof this.errors,
        detail?: string,
        status?: number,
        otherFields: Record<string, any> = {},
    ) {
        status = status ?? this.errors[code]?.status ?? 500;
        const error: any = {
            status,
            code: paramCase(code),
            title: this.errors[code]?.title,
        };

        if (detail) {
            error.detail = detail;
        }

        Object.assign(error, otherFields);

        return {
            status,
            body: {
                errors: [error],
            },
        };
    }

    private makeUnsupportedModelError(model: string) {
        return this.makeError('unsupportedModel', `Model ${model} doesn't exist`);
    }

    private makeUnsupportedRelationshipError(model: string, relationship: string, status: number) {
        return this.makeError('unsupportedRelationship', `Relationship ${model}.${relationship} doesn't exist`, status);
    }

    //#endregion
}
