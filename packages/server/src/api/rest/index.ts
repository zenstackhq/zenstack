/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ModelMeta, ZodSchemas } from '@zenstackhq/runtime';
import {
    DbClientContract,
    FieldInfo,
    PrismaErrorCode,
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
import z from 'zod';
import { fromZodError } from 'zod-validation-error';
import { LoggerConfig, RequestContext, Response } from '../../types';
import { APIHandlerBase } from '../base';
import { logWarning, registerCustomSerializers } from '../utils';

const urlPatterns = {
    // collection operations
    collection: new UrlPattern('/:type'),
    // single resource operations
    single: new UrlPattern('/:type/:id'),
    // related entity fetching
    fetchRelationship: new UrlPattern('/:type/:id/:relationship'),
    // relationship operations
    relationship: new UrlPattern('/:type/:id/relationships/:relationship'),
};

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
};

type RelationshipInfo = {
    type: string;
    idField: string;
    idFieldType: string;
    isCollection: boolean;
    isOptional: boolean;
};

type ModelInfo = {
    idField: string;
    idFieldType: string;
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
        multiId: {
            status: 400,
            title: 'Model with multiple ID fields is not supported',
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

    // all known types and their metadata
    private typeMap: Record<string, ModelInfo>;

    constructor(private readonly options: Options) {
        super();
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
            throw new Error('Model meta is not provided or loaded from default location');
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
                    let match = urlPatterns.single.match(path);
                    if (match) {
                        // single resource read
                        return await this.processSingleRead(prisma, match.type, match.id, query);
                    }

                    match = urlPatterns.fetchRelationship.match(path);
                    if (match) {
                        // fetch related resource(s)
                        return await this.processFetchRelated(prisma, match.type, match.id, match.relationship, query);
                    }

                    match = urlPatterns.relationship.match(path);
                    if (match) {
                        // read relationship
                        return await this.processReadRelationship(
                            prisma,
                            match.type,
                            match.id,
                            match.relationship,
                            query,
                            modelMeta
                        );
                    }

                    match = urlPatterns.collection.match(path);
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

                    let match = urlPatterns.collection.match(path);
                    if (match) {
                        // resource creation
                        return await this.processCreate(prisma, match.type, query, requestBody, zodSchemas);
                    }

                    match = urlPatterns.relationship.match(path);
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

                    let match = urlPatterns.single.match(path);
                    if (match) {
                        // resource update
                        return await this.processUpdate(prisma, match.type, match.id, query, requestBody, zodSchemas);
                    }

                    match = urlPatterns.relationship.match(path);
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
                    let match = urlPatterns.single.match(path);
                    if (match) {
                        // resource deletion
                        return await this.processDelete(prisma, match.type, match.id);
                    }

                    match = urlPatterns.relationship.match(path);
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

        const args: any = { where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId) };

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
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
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
        query: Record<string, string | string[]> | undefined,
        modelMeta: ModelMeta
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
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: this.makeIdSelect(type, modelMeta),
        };

        // include IDs of relation fields so that they can be serialized
        // this.includeRelationshipIds(type, args, 'select');
        args.select = { ...args.select, [relationship]: { select: this.makeIdSelect(relationInfo.type, modelMeta) } };

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
            const schemaName = `${upperCaseFirst(type)}${upperCaseFirst(mode)}Schema`;
            // zod-parse attributes if a schema is provided
            const payloadSchema = zodSchemas?.models?.[schemaName];
            if (payloadSchema) {
                const parsed = payloadSchema.safeParse(attributes);
                if (!parsed.success) {
                    return { error: this.makeError('invalidPayload', fromZodError(parsed.error).message) };
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

        // turn relashionship payload into Prisma connect objects
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
                        connect: enumerate(data.data).map((item: any) => ({
                            [relationInfo.idField]: this.coerce(relationInfo.idFieldType, item.id),
                        })),
                    };
                } else {
                    if (typeof data.data !== 'object') {
                        return this.makeError('invalidRelationData');
                    }
                    createPayload.data[key] = {
                        connect: { [relationInfo.idField]: this.coerce(relationInfo.idFieldType, data.data.id) },
                    };
                }

                // make sure ID fields are included for result serialization
                createPayload.include = {
                    ...createPayload.include,
                    [key]: { select: { [relationInfo.idField]: true } },
                };
            }
        }

        const entity = await prisma[type].create(createPayload);
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
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: { [typeInfo.idField]: true, [relationship]: { select: { [relationInfo.idField]: true } } },
        };

        if (!relationInfo.isCollection) {
            // zod-parse payload
            const parsed = this.updateSingleRelationSchema.safeParse(requestBody);
            if (!parsed.success) {
                return this.makeError('invalidPayload', fromZodError(parsed.error).message);
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
                        connect: {
                            [relationInfo.idField]: this.coerce(relationInfo.idFieldType, parsed.data.data.id),
                        },
                    },
                };
            }
        } else {
            // zod-parse payload
            const parsed = this.updateCollectionRelationSchema.safeParse(requestBody);
            if (!parsed.success) {
                return this.makeError('invalidPayload', fromZodError(parsed.error).message);
            }

            // create -> connect, delete -> disconnect, update -> set
            const relationVerb = mode === 'create' ? 'connect' : mode === 'delete' ? 'disconnect' : 'set';

            updateArgs.data = {
                [relationship]: {
                    [relationVerb]: enumerate(parsed.data.data).map((item: any) => ({
                        [relationInfo.idField]: this.coerce(relationInfo.idFieldType, item.id),
                    })),
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
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
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
                            [relationInfo.idField]: this.coerce(relationInfo.idFieldType, item.id),
                        })),
                    };
                } else {
                    if (typeof data.data !== 'object') {
                        return this.makeError('invalidRelationData');
                    }
                    updatePayload.data[key] = {
                        set: { [relationInfo.idField]: this.coerce(relationInfo.idFieldType, data.data.id) },
                    };
                }
                updatePayload.include = {
                    ...updatePayload.include,
                    [key]: { select: { [relationInfo.idField]: true } },
                };
            }
        }

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
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
        });
        return {
            status: 204,
            body: undefined,
        };
    }

    //#region utilities

    private buildTypeMap(logger: LoggerConfig | undefined, modelMeta: ModelMeta): void {
        this.typeMap = {};
        for (const [model, fields] of Object.entries(modelMeta.fields)) {
            const idFields = getIdFields(modelMeta, model);
            if (idFields.length === 0) {
                logWarning(logger, `Not including model ${model} in the API because it has no ID field`);
                continue;
            }
            if (idFields.length > 1) {
                logWarning(logger, `Not including model ${model} in the API because it has multiple ID fields`);
                continue;
            }

            this.typeMap[model] = {
                idField: idFields[0].name,
                idFieldType: idFields[0].type,
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
                if (fieldTypeIdFields.length > 1) {
                    logWarning(
                        logger,
                        `Not including relation ${model}.${field} in the API because it has multiple ID fields`
                    );
                    continue;
                }

                this.typeMap[model].relationships[field] = {
                    type: fieldInfo.type,
                    idField: fieldTypeIdFields[0].name,
                    idFieldType: fieldTypeIdFields[0].type,
                    isCollection: fieldInfo.isArray,
                    isOptional: fieldInfo.isOptional,
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

        for (const model of Object.keys(modelMeta.fields)) {
            const ids = getIdFields(modelMeta, model);
            if (ids.length !== 1) {
                continue;
            }

            const linker = new Linker((items) =>
                Array.isArray(items)
                    ? this.makeLinkUrl(`/${model}`)
                    : this.makeLinkUrl(`/${model}/${this.getId(model, items, modelMeta)}`)
            );
            linkers[model] = linker;

            let projection: Record<string, 0> | null = {};
            for (const [field, fieldMeta] of Object.entries<FieldInfo>(modelMeta.fields[model])) {
                if (fieldMeta.isDataModel) {
                    projection[field] = 0;
                }
            }
            if (Object.keys(projection).length === 0) {
                projection = null;
            }

            const serializer = new Serializer(model, {
                version: '1.1',
                idKey: ids[0].name,
                linkers: {
                    resource: linker,
                    document: linker,
                },
                projection,
            });
            this.serializers.set(model, serializer);
        }

        // set relators
        for (const model of Object.keys(modelMeta.fields)) {
            const serializer = this.serializers.get(model);
            if (!serializer) {
                continue;
            }

            const relators: Record<string, Relator<any>> = {};
            for (const [field, fieldMeta] of Object.entries<FieldInfo>(modelMeta.fields[model])) {
                if (!fieldMeta.isDataModel) {
                    continue;
                }
                const fieldSerializer = this.serializers.get(lowerCaseFirst(fieldMeta.type));
                if (!fieldSerializer) {
                    continue;
                }
                const fieldIds = getIdFields(modelMeta, fieldMeta.type);
                if (fieldIds.length === 1) {
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
        if (ids.length === 1) {
            return data[ids[0].name];
        } else {
            return undefined;
        }
    }

    private async serializeItems(model: string, items: unknown, options?: Partial<SerializerOptions<any>>) {
        model = lowerCaseFirst(model);
        const serializer = this.serializers.get(model);
        if (!serializer) {
            throw new Error(`serializer not found for model ${model}`);
        }

        // serialize to JSON:API strcuture
        const serialized = await serializer.serialize(items, options);

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

    private makeIdFilter(idField: string, idFieldType: string, resourceId: string) {
        return { [idField]: this.coerce(idFieldType, resourceId) };
    }

    private makeIdSelect(model: string, modelMeta: ModelMeta) {
        const idFields = getIdFields(modelMeta, model);
        if (idFields.length === 0) {
            throw this.errors.noId;
        } else if (idFields.length > 1) {
            throw this.errors.multiId;
        }
        return { [idFields[0].name]: true };
    }

    private includeRelationshipIds(model: string, args: any, mode: 'select' | 'include') {
        const typeInfo = this.typeMap[model];
        if (!typeInfo) {
            return;
        }
        for (const [relation, relationInfo] of Object.entries(typeInfo.relationships)) {
            args[mode] = { ...args[mode], [relation]: { select: { [relationInfo.idField]: true } } };
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
                            curr[fieldInfo.name] = { [relationType.idField]: dir };
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
                        ? { OR: values.map((v) => this.makeIdFilter(info.idField, info.idFieldType, v)) }
                        : this.makeIdFilter(info.idField, info.idFieldType, value);
                return { some: filterValue };
            } else {
                return { is: this.makeIdFilter(info.idField, info.idFieldType, value) };
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
                    return op ? { [op]: coerced } : { equals: coerced };
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
            if (err.code === PrismaErrorCode.CONSTRAINED_FAILED) {
                return this.makeError('forbidden', undefined, 403, err.meta?.reason as string);
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

    private makeError(code: keyof typeof this.errors, detail?: string, status?: number, reason?: string) {
        return {
            status: status ?? this.errors[code].status,
            body: {
                errors: [
                    {
                        status: status ?? this.errors[code].status,
                        code: paramCase(code),
                        title: this.errors[code].title,
                        detail: detail || this.errors[code].detail,
                        reason,
                    },
                ],
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
