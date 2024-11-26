/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ModelMeta, ZodSchemas } from '@zenstackhq/runtime';
import {
    CrudFailureReason,
    DbClientContract,
    FieldInfo,
    PrismaErrorCode,
    clone,
    enumerate,
    getIdFields,
    isPrismaClientKnownRequestError,
} from '@zenstackhq/runtime';
import { paramCase } from 'change-case';
import { lowerCaseFirst } from 'lower-case-first';
import SuperJSON from 'superjson';
import { Linker, Paginator, Relator, Serializer, SerializerOptions } from 'ts-japi';
import { upperCaseFirst } from 'upper-case-first';
import UrlPattern from 'url-pattern';
import z, { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { LoggerConfig, Response } from '../../types';
import { APIHandlerBase, RequestContext } from '../base';
import { logWarning, registerCustomSerializers } from '../utils';

/**
 * Request handler options
 */
export type Options = {
    /**
     * The base endpoint of the RESTful API, must be a valid URL
     */
    endpoint: string;

    /**
     * The default page size for limiting the number of results returned
     * from collection queries, including resource collection, related data
     * of collection types, and relashionship of collection types.
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
};

type RelationshipInfo = {
    type: string;
    idFields: FieldInfo[];
    isCollection: boolean;
    isOptional: boolean;
};

type ModelInfo = {
    idFields: FieldInfo[];
    fields: Record<string, FieldInfo>;
    relationships: Record<string, RelationshipInfo>;
};

class InvalidValueError extends Error {
    constructor(public readonly message: string) {
        super(message);
    }
}

const DEFAULT_PAGE_SIZE = 100;

const FilterOperations = [
    'lt',
    'lte',
    'gt',
    'gte',
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

const prismaIdDivider = '_';

registerCustomSerializers();

/**
 * RESTful-style API request handler (compliant with JSON:API)
 */
class RequestHandler extends APIHandlerBase {
    // resource serializers
    private serializers: Map<string, Serializer>;

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
            title: 'Invalid payload',
            detail: 'Invalid relationship data',
        },
        invalidRelation: {
            status: 400,
            title: 'Invalid payload',
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
        forbidden: {
            status: 403,
            title: 'Operation is forbidden',
        },
        validationError: {
            status: 422,
            title: 'Operation is unprocessable due to validation errors',
        },
        unknownError: {
            status: 400,
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
                        z.object({
                            data: z.union([
                                z.object({ type: z.string(), id: z.union([z.string(), z.number()]) }),
                                z.array(z.object({ type: z.string(), id: z.union([z.string(), z.number()]) })),
                            ]),
                        })
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
    private typeMap: Record<string, ModelInfo>;

    // divider used to separate compound ID fields
    private idDivider;

    private urlPatterns;

    constructor(private readonly options: Options) {
        super();
        this.idDivider = options.idDivider ?? prismaIdDivider;
        const segmentCharset = options.urlSegmentCharset ?? 'a-zA-Z0-9-_~ %';
        this.urlPatterns = this.buildUrlPatterns(this.idDivider, segmentCharset);
    }

    buildUrlPatterns(idDivider: string, urlSegmentNameCharset: string) {
        const options = { segmentValueCharset: urlSegmentNameCharset };
        return {
            // collection operations
            collection: new UrlPattern('/:type', options),
            // single resource operations
            single: new UrlPattern('/:type/:id', options),
            // related entity fetching
            fetchRelationship: new UrlPattern('/:type/:id/:relationship', options),
            // relationship operations
            relationship: new UrlPattern('/:type/:id/relationships/:relationship', options),
        };
    }

    async handleRequest({
        prisma,
        method,
        path,
        query,
        requestBody,
        logger,
        modelMeta,
        zodSchemas,
    }: RequestContext): Promise<Response> {
        modelMeta = modelMeta ?? this.defaultModelMeta;
        if (!modelMeta) {
            throw new Error('Model metadata is not provided or loaded from default location');
        }

        if (!this.serializers) {
            this.buildSerializers(modelMeta);
        }

        if (!this.typeMap) {
            this.buildTypeMap(logger, modelMeta);
        }

        method = method.toUpperCase();
        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        try {
            switch (method) {
                case 'GET': {
                    let match = this.urlPatterns.single.match(path);
                    if (match) {
                        // single resource read
                        return await this.processSingleRead(prisma, match.type, match.id, query);
                    }

                    match = this.urlPatterns.fetchRelationship.match(path);
                    if (match) {
                        // fetch related resource(s)
                        return await this.processFetchRelated(prisma, match.type, match.id, match.relationship, query);
                    }

                    match = this.urlPatterns.relationship.match(path);
                    if (match) {
                        // read relationship
                        return await this.processReadRelationship(
                            prisma,
                            match.type,
                            match.id,
                            match.relationship,
                            query
                        );
                    }

                    match = this.urlPatterns.collection.match(path);
                    if (match) {
                        // collection read
                        return await this.processCollectionRead(prisma, match.type, query);
                    }

                    return this.makeError('invalidPath');
                }

                case 'POST': {
                    if (!requestBody) {
                        return this.makeError('invalidPayload');
                    }

                    let match = this.urlPatterns.collection.match(path);
                    if (match) {
                        const body = requestBody as any;
                        const upsertMeta = this.upsertMetaSchema.safeParse(body);
                        if (upsertMeta.success) {
                            // resource upsert
                            return await this.processUpsert(
                                prisma,
                                match.type,
                                query,
                                requestBody,
                                modelMeta,
                                zodSchemas
                            );
                        } else {
                            // resource creation
                            return await this.processCreate(
                                prisma,
                                match.type,
                                query,
                                requestBody,
                                modelMeta,
                                zodSchemas
                            );
                        }
                    }

                    match = this.urlPatterns.relationship.match(path);
                    if (match) {
                        // relationship creation (collection relationship only)
                        return await this.processRelationshipCRUD(
                            prisma,
                            'create',
                            match.type,
                            match.id,
                            match.relationship,
                            query,
                            requestBody
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

                    let match = this.urlPatterns.single.match(path);
                    if (match) {
                        // resource update
                        return await this.processUpdate(
                            prisma,
                            match.type,
                            match.id,
                            query,
                            requestBody,
                            modelMeta,
                            zodSchemas
                        );
                    }

                    match = this.urlPatterns.relationship.match(path);
                    if (match) {
                        // relationship update
                        return await this.processRelationshipCRUD(
                            prisma,
                            'update',
                            match.type,
                            match.id,
                            match.relationship as string,
                            query,
                            requestBody
                        );
                    }

                    return this.makeError('invalidPath');
                }

                case 'DELETE': {
                    let match = this.urlPatterns.single.match(path);
                    if (match) {
                        // resource deletion
                        return await this.processDelete(prisma, match.type, match.id);
                    }

                    match = this.urlPatterns.relationship.match(path);
                    if (match) {
                        // relationship deletion (collection relationship only)
                        return await this.processRelationshipCRUD(
                            prisma,
                            'delete',
                            match.type,
                            match.id,
                            match.relationship as string,
                            query,
                            requestBody
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
            } else {
                return this.handlePrismaError(err);
            }
        }
    }

    private async processSingleRead(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const args: any = { where: this.makePrismaIdFilter(typeInfo.idFields, resourceId) };

        // include IDs of relation fields so that they can be serialized
        this.includeRelationshipIds(type, args, 'include');

        // handle "include" query parameter
        let include: string[] | undefined;
        if (query?.include) {
            const { select, error, allIncludes } = this.buildRelationSelect(type, query.include);
            if (error) {
                return error;
            }
            if (select) {
                args.include = { ...args.include, ...select };
            }
            include = allIncludes;
        }

        const entity = await prisma[type].findUnique(args);

        if (entity) {
            return {
                status: 200,
                body: await this.serializeItems(type, entity, { include }),
            };
        } else {
            return this.makeError('notFound');
        }
    }

    private async processFetchRelated(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
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
        if (query?.include) {
            const { select: relationSelect, error, allIncludes } = this.buildRelationSelect(type, query.include);
            if (error) {
                return error;
            }
            // trim the leading `$relationship.` from the include paths
            include = allIncludes
                .filter((i) => i.startsWith(`${relationship}.`))
                .map((i) => i.substring(`${relationship}.`.length));
            select = relationSelect;
        }

        select = select ?? { [relationship]: true };
        const args: any = {
            where: this.makePrismaIdFilter(typeInfo.idFields, resourceId),
            select,
        };

        if (relationInfo.isCollection) {
            // if related data is a collection, it can be filtered, sorted, and paginated
            const error = this.injectRelationQuery(relationInfo.type, select, relationship, query);
            if (error) {
                return error;
            }
        }

        const entity: any = await prisma[type].findUnique(args);

        let paginator: Paginator<any> | undefined;

        if (entity?._count?.[relationship] !== undefined) {
            // build up paginator
            const total = entity?._count?.[relationship] as number;
            const url = this.makeNormalizedUrl(`/${type}/${resourceId}/${relationship}`, query);
            const { offset, limit } = this.getPagination(query);
            paginator = this.makePaginator(url, offset, limit, total);
        }

        if (entity?.[relationship]) {
            return {
                status: 200,
                body: await this.serializeItems(relationInfo.type, entity[relationship], {
                    linkers: {
                        document: new Linker(() => this.makeLinkUrl(`/${type}/${resourceId}/${relationship}`)),
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
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.makeUnsupportedRelationshipError(type, relationship, 404);
        }

        const args: any = {
            where: this.makePrismaIdFilter(typeInfo.idFields, resourceId),
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

        const entity: any = await prisma[type].findUnique(args);

        if (entity?._count?.[relationship] !== undefined) {
            // build up paginator
            const total = entity?._count?.[relationship] as number;
            const url = this.makeNormalizedUrl(`/${type}/${resourceId}/relationships/${relationship}`, query);
            const { offset, limit } = this.getPagination(query);
            paginator = this.makePaginator(url, offset, limit, total);
        }

        if (entity?.[relationship]) {
            const serialized: any = await this.serializeItems(relationInfo.type, entity[relationship], {
                linkers: {
                    document: new Linker(() =>
                        this.makeLinkUrl(`/${type}/${resourceId}/relationships/${relationship}`)
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
        prisma: DbClientContract,
        type: string,
        query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
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
        if (query?.include) {
            const { select, error, allIncludes } = this.buildRelationSelect(type, query.include);
            if (error) {
                return error;
            }
            if (select) {
                args.include = { ...args.include, ...select };
            }
            include = allIncludes;
        }

        const { offset, limit } = this.getPagination(query);
        if (offset > 0) {
            args.skip = offset;
        }

        if (limit === Infinity) {
            const entities = await prisma[type].findMany(args);

            const body = await this.serializeItems(type, entities, { include });
            const total = entities.length;
            body.meta = this.addTotalCountToMeta(body.meta, total);

            return {
                status: 200,
                body: body,
            };
        } else {
            args.take = limit;
            const [entities, count] = await Promise.all([
                prisma[type].findMany(args),
                prisma[type].count({ where: args.where }),
            ]);
            const total = count as number;

            const url = this.makeNormalizedUrl(`/${type}`, query);
            const options: Partial<SerializerOptions> = {
                include,
                linkers: {
                    paginator: this.makePaginator(url, offset, limit, total),
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

    private addTotalCountToMeta(meta: any, total: any) {
        return meta ? Object.assign(meta, { total }) : Object.assign({}, { total });
    }

    private makePaginator(baseUrl: string, offset: number, limit: number, total: number) {
        if (limit === Infinity) {
            return undefined;
        }

        const totalPages = Math.ceil(total / limit);

        return new Paginator(() => ({
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

    private processRequestBody(
        type: string,
        requestBody: unknown,
        zodSchemas: ZodSchemas | undefined,
        mode: 'create' | 'update'
    ) {
        let body: any = requestBody;
        if (body.meta?.serialization) {
            // superjson deserialize body if a serialization meta is provided
            body = SuperJSON.deserialize({ json: body, meta: body.meta.serialization });
        }

        const parsed = this.createUpdatePayloadSchema.parse(body);
        const attributes: any = parsed.data.attributes;

        if (attributes) {
            // use the zod schema (that only contains non-relation fields) to validate the payload,
            // if available
            const schemaName = `${upperCaseFirst(type)}${upperCaseFirst(mode)}ScalarSchema`;
            const payloadSchema = zodSchemas?.models?.[schemaName];
            if (payloadSchema) {
                const parsed = payloadSchema.safeParse(attributes);
                if (!parsed.success) {
                    return {
                        error: this.makeError(
                            'invalidPayload',
                            fromZodError(parsed.error).message,
                            422,
                            CrudFailureReason.DATA_VALIDATION_VIOLATION,
                            parsed.error
                        ),
                    };
                }
            }
        }

        return { attributes, relationships: parsed.data.relationships };
    }

    private async processCreate(
        prisma: DbClientContract,
        type: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
        modelMeta: ModelMeta,
        zodSchemas?: ZodSchemas
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const { error, attributes, relationships } = this.processRequestBody(type, requestBody, zodSchemas, 'create');

        if (error) {
            return error;
        }

        const createPayload: any = { data: { ...attributes } };

        // turn relationship payload into Prisma connect objects
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
                            this.makeIdConnect(relationInfo.idFields, item.id)
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
                    [key]: { select: { [this.makePrismaIdKey(relationInfo.idFields)]: true } },
                };
            }
        }

        // include IDs of relation fields so that they can be serialized.
        this.includeRelationshipIds(type, createPayload, 'include');

        const entity = await prisma[type].create(createPayload);
        return {
            status: 201,
            body: await this.serializeItems(type, entity),
        };
    }

    private async processUpsert(
        prisma: DbClientContract,
        type: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
        modelMeta: ModelMeta,
        zodSchemas?: ZodSchemas
    ) {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const { error, attributes, relationships } = this.processRequestBody(type, requestBody, zodSchemas, 'create');

        if (error) {
            return error;
        }

        const matchFields = this.upsertMetaSchema.parse(requestBody).meta.matchFields;

        const uniqueFields = Object.values(modelMeta.models[type].uniqueConstraints || {}).map((uf) => uf.fields);

        if (
            !uniqueFields.some((uniqueCombination) => uniqueCombination.every((field) => matchFields.includes(field)))
        ) {
            return this.makeError('invalidPayload', 'Match fields must be unique fields', 400);
        }

        const upsertPayload: any = {
            where: this.makeUpsertWhere(matchFields, attributes, typeInfo),
            create: { ...attributes },
            update: {
                ...Object.fromEntries(Object.entries(attributes).filter((e) => !matchFields.includes(e[0]))),
            },
        };

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
                    upsertPayload.create[key] = {
                        connect: enumerate(data.data).map((item: any) =>
                            this.makeIdConnect(relationInfo.idFields, item.id)
                        ),
                    };
                    upsertPayload.update[key] = {
                        set: enumerate(data.data).map((item: any) =>
                            this.makeIdConnect(relationInfo.idFields, item.id)
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
        this.includeRelationshipIds(type, upsertPayload, 'include');

        const entity = await prisma[type].upsert(upsertPayload);

        return {
            status: 201,
            body: await this.serializeItems(type, entity),
        };
    }

    private async processRelationshipCRUD(
        prisma: DbClientContract,
        mode: 'create' | 'update' | 'delete',
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string | string[]> | undefined,
        requestBody: unknown
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
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
            where: this.makePrismaIdFilter(typeInfo.idFields, resourceId),
            select: {
                ...typeInfo.idFields.reduce((acc, field) => ({ ...acc, [field.name]: true }), {}),
                [relationship]: { select: this.makeIdSelect(relationInfo.idFields) },
            },
        };

        if (!relationInfo.isCollection) {
            // zod-parse payload
            const parsed = this.updateSingleRelationSchema.safeParse(requestBody);
            if (!parsed.success) {
                return this.makeError(
                    'invalidPayload',
                    fromZodError(parsed.error).message,
                    undefined,
                    CrudFailureReason.DATA_VALIDATION_VIOLATION,
                    parsed.error
                );
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
                return this.makeError(
                    'invalidPayload',
                    fromZodError(parsed.error).message,
                    undefined,
                    CrudFailureReason.DATA_VALIDATION_VIOLATION,
                    parsed.error
                );
            }

            // create -> connect, delete -> disconnect, update -> set
            const relationVerb = mode === 'create' ? 'connect' : mode === 'delete' ? 'disconnect' : 'set';

            updateArgs.data = {
                [relationship]: {
                    [relationVerb]: enumerate(parsed.data.data).map((item: any) =>
                        this.makePrismaIdFilter(relationInfo.idFields, item.id)
                    ),
                },
            };
        }

        const entity: any = await prisma[type].update(updateArgs);

        const serialized: any = await this.serializeItems(relationInfo.type, entity[relationship], {
            linkers: {
                document: new Linker(() => this.makeLinkUrl(`/${type}/${resourceId}/relationships/${relationship}`)),
            },
            onlyIdentifier: true,
        });

        return {
            status: 200,
            body: serialized,
        };
    }

    private async processUpdate(
        prisma: DbClientContract,
        type: any,
        resourceId: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown,
        modelMeta: ModelMeta,
        zodSchemas?: ZodSchemas
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const { error, attributes, relationships } = this.processRequestBody(type, requestBody, zodSchemas, 'update');
        if (error) {
            return error;
        }

        const updatePayload: any = {
            where: this.makePrismaIdFilter(typeInfo.idFields, resourceId),
            data: { ...attributes },
        };

        // turn relationships into prisma payload
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
                            [this.makePrismaIdKey(relationInfo.idFields)]: item.id,
                        })),
                    };
                } else {
                    if (typeof data.data !== 'object') {
                        return this.makeError('invalidRelationData');
                    }
                    updatePayload.data[key] = {
                        set: {
                            [this.makePrismaIdKey(relationInfo.idFields)]: data.data.id,
                        },
                    };
                }
                updatePayload.include = {
                    ...updatePayload.include,
                    [key]: { select: { [this.makePrismaIdKey(relationInfo.idFields)]: true } },
                };
            }
        }

        // include IDs of relation fields so that they can be serialized.
        this.includeRelationshipIds(type, updatePayload, 'include');

        const entity = await prisma[type].update(updatePayload);
        return {
            status: 200,
            body: await this.serializeItems(type, entity),
        };
    }

    private async processDelete(prisma: DbClientContract, type: any, resourceId: string): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        await prisma[type].delete({
            where: this.makePrismaIdFilter(typeInfo.idFields, resourceId),
        });
        return {
            status: 204,
            body: undefined,
        };
    }

    //#region utilities

    private buildTypeMap(logger: LoggerConfig | undefined, modelMeta: ModelMeta): void {
        this.typeMap = {};
        for (const [model, { fields }] of Object.entries(modelMeta.models)) {
            const idFields = getIdFields(modelMeta, model);
            if (idFields.length === 0) {
                logWarning(logger, `Not including model ${model} in the API because it has no ID field`);
                continue;
            }

            this.typeMap[model] = {
                idFields,
                relationships: {},
                fields,
            };

            for (const [field, fieldInfo] of Object.entries(fields)) {
                if (!fieldInfo.isDataModel) {
                    continue;
                }
                const fieldTypeIdFields = getIdFields(modelMeta, fieldInfo.type);
                if (fieldTypeIdFields.length === 0) {
                    logWarning(
                        logger,
                        `Not including relation ${model}.${field} in the API because it has no ID field`
                    );
                    continue;
                }

                this.typeMap[model].relationships[field] = {
                    type: fieldInfo.type,
                    idFields: fieldTypeIdFields,
                    isCollection: !!fieldInfo.isArray,
                    isOptional: !!fieldInfo.isOptional,
                };
            }
        }
    }

    private makeLinkUrl(path: string) {
        return `${this.options.endpoint}${path}`;
    }

    private buildSerializers(modelMeta: ModelMeta) {
        this.serializers = new Map();
        const linkers: Record<string, Linker<any>> = {};

        for (const model of Object.keys(modelMeta.models)) {
            const ids = getIdFields(modelMeta, model);

            if (ids.length < 1) {
                continue;
            }

            const linker = new Linker((items) =>
                Array.isArray(items)
                    ? this.makeLinkUrl(`/${model}`)
                    : this.makeLinkUrl(`/${model}/${this.getId(model, items, modelMeta)}`)
            );
            linkers[model] = linker;

            let projection: Record<string, 0> | null = {};
            for (const [field, fieldMeta] of Object.entries<FieldInfo>(modelMeta.models[model].fields)) {
                if (fieldMeta.isDataModel) {
                    projection[field] = 0;
                }
            }
            if (Object.keys(projection).length === 0) {
                projection = null;
            }

            const serializer = new Serializer(model, {
                version: '1.1',
                idKey: this.makeIdKey(ids),
                linkers: {
                    resource: linker,
                    document: linker,
                },
                projection,
            });
            this.serializers.set(model, serializer);
        }

        // set relators
        for (const model of Object.keys(modelMeta.models)) {
            const serializer = this.serializers.get(model);
            if (!serializer) {
                continue;
            }

            const relators: Record<string, Relator<any>> = {};
            for (const [field, fieldMeta] of Object.entries<FieldInfo>(modelMeta.models[model].fields)) {
                if (!fieldMeta.isDataModel) {
                    continue;
                }
                const fieldSerializer = this.serializers.get(lowerCaseFirst(fieldMeta.type));
                if (!fieldSerializer) {
                    continue;
                }
                const fieldIds = getIdFields(modelMeta, fieldMeta.type);
                if (fieldIds.length > 0) {
                    const relator = new Relator(
                        async (data) => {
                            return (data as any)[field];
                        },
                        fieldSerializer,
                        {
                            relatedName: field,
                            linkers: {
                                related: new Linker((primary) =>
                                    this.makeLinkUrl(
                                        `/${lowerCaseFirst(model)}/${this.getId(model, primary, modelMeta)}/${field}`
                                    )
                                ),
                                relationship: new Linker((primary) =>
                                    this.makeLinkUrl(
                                        `/${lowerCaseFirst(model)}/${this.getId(
                                            model,
                                            primary,
                                            modelMeta
                                        )}/relationships/${field}`
                                    )
                                ),
                            },
                        }
                    );
                    relators[field] = relator;
                }
            }
            serializer.setRelators(relators);
        }
    }

    private getId(model: string, data: any, modelMeta: ModelMeta) {
        if (!data) {
            return undefined;
        }
        const ids = getIdFields(modelMeta, model);
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
        const typeInfo = this.typeMap[lowerCaseFirst(model)];
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

    private makePrismaIdFilter(idFields: FieldInfo[], resourceId: string, nested: boolean = true) {
        const decodedId = decodeURIComponent(resourceId);
        if (idFields.length === 1) {
            return { [idFields[0].name]: this.coerce(idFields[0].type, decodedId) };
        } else if (nested) {
            return {
                // TODO: support `@@id` with custom name
                [idFields.map((idf) => idf.name).join(prismaIdDivider)]: idFields.reduce(
                    (acc, curr, idx) => ({
                        ...acc,
                        [curr.name]: this.coerce(curr.type, decodedId.split(this.idDivider)[idx]),
                    }),
                    {}
                ),
            };
        } else {
            return idFields.reduce(
                (acc, curr, idx) => ({
                    ...acc,
                    [curr.name]: this.coerce(curr.type, decodedId.split(this.idDivider)[idx]),
                }),
                {}
            );
        }
    }

    private makeIdSelect(idFields: FieldInfo[]) {
        if (idFields.length === 0) {
            throw this.errors.noId;
        }
        return idFields.reduce((acc, curr) => ({ ...acc, [curr.name]: true }), {});
    }

    private makeIdConnect(idFields: FieldInfo[], id: string | number) {
        if (idFields.length === 1) {
            return { [idFields[0].name]: this.coerce(idFields[0].type, id) };
        } else {
            return {
                [this.makePrismaIdKey(idFields)]: idFields.reduce(
                    (acc, curr, idx) => ({
                        ...acc,
                        [curr.name]: this.coerce(curr.type, `${id}`.split(this.idDivider)[idx]),
                    }),
                    {}
                ),
            };
        }
    }

    private makeIdKey(idFields: FieldInfo[]) {
        return idFields.map((idf) => idf.name).join(this.idDivider);
    }

    private makePrismaIdKey(idFields: FieldInfo[]) {
        // TODO: support `@@id` with custom name
        return idFields.map((idf) => idf.name).join(prismaIdDivider);
    }

    private makeCompoundId(idFields: FieldInfo[], item: any) {
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
                [this.makePrismaIdKey(typeInfo.idFields)]: where,
            };
        }

        return where;
    }

    private includeRelationshipIds(model: string, args: any, mode: 'select' | 'include') {
        const typeInfo = this.typeMap[model];
        if (!typeInfo) {
            return;
        }
        for (const [relation, relationInfo] of Object.entries(typeInfo.relationships)) {
            args[mode] = { ...args[mode], [relation]: { select: this.makeIdSelect(relationInfo.idFields) } };
        }
    }

    private coerce(type: string, value: any) {
        if (typeof value === 'string') {
            if (type === 'Int' || type === 'BigInt') {
                const parsed = parseInt(value);
                if (isNaN(parsed)) {
                    throw new InvalidValueError(`invalid ${type} value: ${value}`);
                }
                return parsed;
            } else if (type === 'Float' || type === 'Decimal') {
                const parsed = parseFloat(value);
                if (isNaN(parsed)) {
                    throw new InvalidValueError(`invalid ${type} value: ${value}`);
                }
                return parsed;
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
            const offsetText = Array.isArray(value) ? value[value.length - 1] : value;
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
            const limitText = Array.isArray(value) ? value[value.length - 1] : value;
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
        query: Record<string, string | string[]> | undefined
    ): { filter: any; error: any } {
        if (!query) {
            return { filter: undefined, error: undefined };
        }

        const typeInfo = this.typeMap[lowerCaseFirst(type)];
        if (!typeInfo) {
            return { filter: undefined, error: this.makeUnsupportedModelError(type) };
        }

        const items: any[] = [];
        let currType = typeInfo;

        for (const [key, value] of Object.entries(query)) {
            if (!value) {
                continue;
            }

            // try matching query parameter key as "filter[x][y]..."
            const match = key.match(this.filterParamPattern);
            if (!match || !match.groups) {
                continue;
            }

            const filterKeys = match.groups.match
                .replaceAll(/[[\]]/g, ' ')
                .split(' ')
                .filter((i) => i);

            if (!filterKeys.length) {
                continue;
            }

            // turn filter into a nested Prisma query object

            const item: any = {};
            let curr = item;

            for (const filterValue of enumerate(value)) {
                for (let i = 0; i < filterKeys.length; i++) {
                    // extract filter operation from (optional) trailing $op
                    let filterKey = filterKeys[i];
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

                    const fieldInfo =
                        filterKey === 'id'
                            ? Object.values(currType.fields).find((f) => f.isId)
                            : currType.fields[filterKey];
                    if (!fieldInfo) {
                        return { filter: undefined, error: this.makeError('invalidFilter') };
                    }

                    if (!fieldInfo.isDataModel) {
                        // regular field
                        if (i !== filterKeys.length - 1) {
                            // must be the last segment of a filter
                            return { filter: undefined, error: this.makeError('invalidFilter') };
                        }
                        curr[fieldInfo.name] = this.makeFilterValue(fieldInfo, filterValue, filterOp);
                    } else {
                        // relation field
                        if (i === filterKeys.length - 1) {
                            curr[fieldInfo.name] = this.makeFilterValue(fieldInfo, filterValue, filterOp);
                        } else {
                            // keep going
                            if (fieldInfo.isArray) {
                                // collection filtering implies "some" operation
                                curr[fieldInfo.name] = { some: {} };
                                curr = curr[fieldInfo.name].some;
                            } else {
                                curr = curr[fieldInfo.name] = {};
                            }
                            currType = this.typeMap[lowerCaseFirst(fieldInfo.type)];
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

        const typeInfo = this.typeMap[lowerCaseFirst(type)];
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
                    const part = parts[i];

                    const fieldInfo = currType.fields[part];
                    if (!fieldInfo || fieldInfo.isArray) {
                        return {
                            sort: undefined,
                            error: this.makeError('invalidSort', 'sorting by array field is not supported'),
                        };
                    }

                    if (i === parts.length - 1) {
                        if (fieldInfo.isDataModel) {
                            // relation field: sort by id
                            const relationType = this.typeMap[lowerCaseFirst(fieldInfo.type)];
                            if (!relationType) {
                                return { sort: undefined, error: this.makeUnsupportedModelError(fieldInfo.type) };
                            }
                            curr[fieldInfo.name] = relationType.idFields.reduce((acc: any, idField: FieldInfo) => {
                                acc[idField.name] = dir;
                                return acc;
                            }, {});
                        } else {
                            // regular field
                            curr[fieldInfo.name] = dir;
                        }
                    } else {
                        if (!fieldInfo.isDataModel) {
                            // must be a relation field
                            return {
                                sort: undefined,
                                error: this.makeError(
                                    'invalidSort',
                                    'intermediate sort segments must be relationships'
                                ),
                            };
                        }
                        // keep going
                        curr = curr[fieldInfo.name] = {};
                        currType = this.typeMap[lowerCaseFirst(fieldInfo.type)];
                        if (!currType) {
                            return { sort: undefined, error: this.makeUnsupportedModelError(fieldInfo.type) };
                        }
                    }

                    result.push(sortItem);
                }
            }
        }

        return { sort: result, error: undefined };
    }

    private buildRelationSelect(type: string, include: string | string[]) {
        const typeInfo = this.typeMap[lowerCaseFirst(type)];
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
                    const relation = parts[i];
                    const relationInfo = currType.relationships[relation];
                    if (!relationInfo) {
                        return { select: undefined, error: this.makeUnsupportedRelationshipError(type, relation, 400) };
                    }

                    currType = this.typeMap[lowerCaseFirst(relationInfo.type)];
                    if (!currType) {
                        return { select: undefined, error: this.makeUnsupportedModelError(relationInfo.type) };
                    }

                    if (i !== parts.length - 1) {
                        currPayload[relation] = { include: { ...currPayload[relation]?.include } };
                        currPayload = currPayload[relation].include;
                    } else {
                        currPayload[relation] = true;
                    }
                }
            }
        }

        return { select: result, error: undefined, allIncludes };
    }

    private makeFilterValue(fieldInfo: FieldInfo, value: string, op: FilterOperationType): any {
        if (fieldInfo.isDataModel) {
            // relation filter is converted to an ID filter
            const info = this.typeMap[lowerCaseFirst(fieldInfo.type)];
            if (fieldInfo.isArray) {
                // filtering a to-many relation, imply 'some' operator
                const values = value.split(',').filter((i) => i);
                const filterValue =
                    values.length > 1
                        ? { OR: values.map((v) => this.makePrismaIdFilter(info.idFields, v, false)) }
                        : this.makePrismaIdFilter(info.idFields, value, false);
                return { some: filterValue };
            } else {
                return { is: this.makePrismaIdFilter(info.idFields, value, false) };
            }
        } else {
            const coerced = this.coerce(fieldInfo.type, value);
            switch (op) {
                case 'icontains':
                    return { contains: coerced, mode: 'insensitive' };
                case 'hasSome':
                case 'hasEvery': {
                    const values = value
                        .split(',')
                        .filter((i) => i)
                        .map((v) => this.coerce(fieldInfo.type, v));
                    return { [op]: values };
                }
                case 'isEmpty':
                    if (value !== 'true' && value !== 'false') {
                        throw new InvalidValueError(`Not a boolean: ${value}`);
                    }
                    return { isEmpty: value === 'true' ? true : false };
                default:
                    if (op === undefined) {
                        // regular filter, split value by comma
                        const values = value
                            .split(',')
                            .filter((i) => i)
                            .map((v) => this.coerce(fieldInfo.type, v));
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
        query: Record<string, string | string[]> | undefined
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

    private handlePrismaError(err: unknown) {
        if (isPrismaClientKnownRequestError(err)) {
            if (err.code === PrismaErrorCode.CONSTRAINT_FAILED) {
                if (err.meta?.reason === CrudFailureReason.DATA_VALIDATION_VIOLATION) {
                    return this.makeError(
                        'validationError',
                        undefined,
                        422,
                        err.meta?.reason as string,
                        err.meta?.zodErrors as ZodError
                    );
                } else {
                    return this.makeError('forbidden', undefined, 403, err.meta?.reason as string);
                }
            } else if (err.code === 'P2025' || err.code === 'P2018') {
                return this.makeError('notFound');
            } else {
                return {
                    status: 400,
                    body: {
                        errors: [
                            {
                                status: 400,
                                code: 'prisma-error',
                                prismaCode: err.code,
                                title: 'Prisma error',
                                detail: err.message,
                            },
                        ],
                    },
                };
            }
        } else {
            const _err = err as Error;
            return this.makeError('unknownError', `${_err.message}\n${_err.stack}`);
        }
    }

    private makeError(
        code: keyof typeof this.errors,
        detail?: string,
        status?: number,
        reason?: string,
        zodErrors?: ZodError
    ) {
        const error: any = {
            status: status ?? this.errors[code].status,
            code: paramCase(code),
            title: this.errors[code].title,
        };

        if (detail) {
            error.detail = detail;
        }

        if (reason) {
            error.reason = reason;
        }

        if (zodErrors) {
            error.zodErrors = zodErrors;
        }

        return {
            status: status ?? this.errors[code].status,
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

export default function makeHandler(options: Options) {
    const handler = new RequestHandler(options);
    return handler.handleRequest.bind(handler);
}

export { makeHandler as RestApiHandler };
