/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    DbClientContract,
    FieldInfo,
    enumerate,
    getIdFields,
    isPrismaClientKnownRequestError,
} from '@zenstackhq/runtime';
import { getDefaultModelMeta } from '@zenstackhq/runtime/enhancements/model-meta';
import type { ModelMeta } from '@zenstackhq/runtime/enhancements/types';
import { ModelZodSchema } from '@zenstackhq/runtime/zod';
import { paramCase } from 'change-case';
import { lowerCaseFirst } from 'lower-case-first';
import { DataDocument, Linker, Paginator, Relator, Serializer, SerializerOptions } from 'ts-japi';
import UrlPattern from 'url-pattern';
import z from 'zod';
import { fromZodError } from 'zod-validation-error';
import { LoggerConfig, RequestContext, Response } from '../types';
import { getZodSchema, logWarning, stripAuxFields } from '../utils';

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
 * Rest request handler options
 */
export type Options = {
    endpoint: string;
    logger?: LoggerConfig | null;
    zodSchemas?: ModelZodSchema;
    modelMeta?: ModelMeta;
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

/**
 * RESTful style API request handler (compliant with JSON:API)
 */
class RequestHandler {
    // resource serializers
    private serializers = new Map<string, Serializer>();

    // error responses
    private readonly errors: Record<string, { status: number; title: string; detail?: string }> = {
        unsupportedModel: {
            status: 400,
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
        unknownError: {
            status: 400,
            title: 'Unknown error',
        },
    };

    private modelMeta: ModelMeta;

    private filterParamPattern = new RegExp(/^filter(?<match>(\[[^[\]]+\])+)$/);

    // zod schema for payload of creating and updating a resource
    private createUpdatePayloadSchema = z.object({
        data: z.object({
            type: z.string(),
            attributes: z.object({}).passthrough(),
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
    });

    // zod schema for updating a single relationship
    private updateSingleRelationSchema = z.object({
        data: z.object({ type: z.string(), id: z.union([z.string(), z.number()]) }).nullable(),
    });

    // zod schema for updating collection relationship
    private updateCollectionRelationSchema = z.object({
        data: z.array(z.object({ type: z.string(), id: z.union([z.string(), z.number()]) })),
    });

    // all known types and their metadata
    private readonly typeMap: Record<string, ModelInfo> = {};

    constructor(private readonly options: Options) {
        this.modelMeta = this.options.modelMeta || getDefaultModelMeta();
        this.buildTypeMap();
        this.buildSerializers();
    }

    async handleRequest({ prisma, method, path, query, requestBody }: RequestContext): Promise<Response> {
        method = method.toUpperCase();

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
                            query
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
                    let match = urlPatterns.collection.match(path);
                    if (match) {
                        // resource creation
                        return await this.processCreate(prisma, match.type, query, requestBody);
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
                    let match = urlPatterns.single.match(path);
                    if (match) {
                        // resource update
                        return await this.processUpdate(prisma, match.type, match.id, query, requestBody);
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
                        return await this.processDelete(prisma, match.type, match.id, query);
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
                const _err = err as Error;
                return this.makeError('unknownError', `${_err.message}\n${_err.stack}`);
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
            return this.makeUnsupportedRelationshipError(type, relationship);
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
        query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.makeUnsupportedRelationshipError(type, relationship);
        }

        const args: any = {
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: this.makeIdSelect(type),
        };

        // include IDs of relation fields so that they can be serialized
        // this.includeRelationshipIds(type, args, 'select');
        args.select = { ...args.select, [relationship]: { select: this.makeIdSelect(relationInfo.type) } };

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
            return {
                status: 200,
                body: await this.serializeItems(type, entities, { include }),
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

            return {
                status: 200,
                body: await this.serializeItems(type, entities, options),
            };
        }
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

    private async processCreate(
        prisma: DbClientContract,
        type: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        // zod-parse payload
        const parsed = this.createUpdatePayloadSchema.safeParse(requestBody);
        if (!parsed.success) {
            return this.makeError('invalidPayload', fromZodError(parsed.error).message);
        }

        const parsedPayload = parsed.data;

        const attributes = parsedPayload.data?.attributes;
        if (!attributes) {
            return this.makeError('invalidPayload');
        }

        const createPayload: any = { data: { ...attributes } };

        // zod-parse attributes if a schema is provided
        const dataSchema = this.options.zodSchemas ? getZodSchema(this.options.zodSchemas, type, 'create') : undefined;
        if (dataSchema) {
            const dataParsed = dataSchema.safeParse(createPayload);
            if (!dataParsed.success) {
                return this.makeError('invalidPayload', fromZodError(dataParsed.error).message);
            }
        }

        // turn relashionship payload into Prisma connect objects
        const relationships = parsedPayload.data?.relationships;
        if (relationships) {
            for (const [key, data] of Object.entries<any>(relationships)) {
                if (!data?.data) {
                    return this.makeError('invalidRelationData');
                }

                const relationInfo = typeInfo.relationships[key];
                if (!relationInfo) {
                    return this.makeUnsupportedRelationshipError(type, key);
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
            return this.makeUnsupportedRelationshipError(type, relationship);
        }

        if (!relationInfo.isCollection && mode !== 'update') {
            // to-one relation can only be updated
            return this.makeError('invalidVerb');
        }

        const updateArgs: any = {
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: { [typeInfo.idField]: true, [relationship]: { select: { [relationInfo.idField]: true } } },
        };
        let entity: any;

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

        try {
            entity = await prisma[type].update(updateArgs);
        } catch (err) {
            return this.handlePrismaError(err);
        }

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
        query: Record<string, string | string[]> | undefined,
        requestBody: unknown
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        // zod-parse payload
        const parsed = this.createUpdatePayloadSchema.safeParse(requestBody);
        if (!parsed.success) {
            return this.makeError('invalidPayload', fromZodError(parsed.error).message);
        }

        const parsedPayload = parsed.data;

        const attributes = parsedPayload.data?.attributes;
        if (!attributes) {
            return this.makeError('invalidPayload');
        }

        const updatePayload: any = {
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            data: { ...attributes },
        };

        // zod-parse attributes if a schema is provided
        const dataSchema = this.options.zodSchemas ? getZodSchema(this.options.zodSchemas, type, 'update') : undefined;
        if (dataSchema) {
            const dataParsed = dataSchema.safeParse(updatePayload);
            if (!dataParsed.success) {
                return this.makeError('invalidPayload', fromZodError(dataParsed.error).message);
            }
        }

        // turn relationships into prisma payload
        const relationships = parsedPayload.data?.relationships;
        if (relationships) {
            for (const [key, data] of Object.entries<any>(relationships)) {
                if (!data?.data) {
                    return this.makeError('invalidRelationData');
                }

                const relationInfo = typeInfo.relationships[key];
                if (!relationInfo) {
                    return this.makeUnsupportedRelationshipError(type, key);
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

        try {
            const entity = await prisma[type].update(updatePayload);
            return {
                status: 200,
                body: await this.serializeItems(type, entity),
            };
        } catch (err) {
            return this.handlePrismaError(err);
        }
    }

    private async processDelete(
        prisma: DbClientContract,
        type: any,
        resourceId: string,
        query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        try {
            await prisma[type].delete({
                where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            });
            return {
                status: 204,
                body: undefined,
            };
        } catch (err) {
            return this.handlePrismaError(err);
        }
    }

    //#region utilities

    private buildTypeMap() {
        for (const [model, fields] of Object.entries(this.modelMeta.fields)) {
            const idFields = getIdFields(this.modelMeta, model);
            if (idFields.length === 0) {
                logWarning(this.options.logger, `Not including model ${model} in the API because it has no ID field`);
                continue;
            }
            if (idFields.length > 1) {
                logWarning(
                    this.options.logger,
                    `Not including model ${model} in the API because it has multiple ID fields`
                );
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
                const fieldTypeIdFields = getIdFields(this.modelMeta, fieldInfo.type);
                if (fieldTypeIdFields.length === 0) {
                    logWarning(
                        this.options.logger,
                        `Not including relation ${model}.${field} in the API because it has no ID field`
                    );
                    continue;
                }
                if (fieldTypeIdFields.length > 1) {
                    logWarning(
                        this.options.logger,
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

    private buildSerializers() {
        const linkers: Record<string, Linker<any>> = {};

        for (const model of Object.keys(this.modelMeta.fields)) {
            const ids = getIdFields(this.modelMeta, model);
            if (ids.length !== 1) {
                continue;
            }

            const linker = new Linker((items) =>
                Array.isArray(items)
                    ? this.makeLinkUrl(`/${model}`)
                    : this.makeLinkUrl(`/${model}/${this.getId(model, items)}`)
            );
            linkers[model] = linker;

            let projection: Record<string, 0> | null = {};
            for (const [field, fieldMeta] of Object.entries<FieldInfo>(this.modelMeta.fields[model])) {
                if (fieldMeta.isDataModel) {
                    projection[field] = 0;
                }
            }
            if (Object.keys(projection).length === 0) {
                projection = null;
            }

            const serializer = new Serializer(model, {
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
        for (const model of Object.keys(this.modelMeta.fields)) {
            const serializer = this.serializers.get(model);
            if (!serializer) {
                continue;
            }

            const relators: Record<string, Relator<any>> = {};
            for (const [field, fieldMeta] of Object.entries<FieldInfo>(this.modelMeta.fields[model])) {
                if (!fieldMeta.isDataModel) {
                    continue;
                }
                const fieldSerializer = this.serializers.get(lowerCaseFirst(fieldMeta.type));
                if (!fieldSerializer) {
                    continue;
                }
                const fieldIds = getIdFields(this.modelMeta, fieldMeta.type);
                if (fieldIds.length === 1) {
                    const relator = new Relator(
                        async (data) => {
                            return (data as any)[field];
                        },
                        fieldSerializer,
                        {
                            relatedName: field,
                            linkers: {
                                related: new Linker((primary, related) =>
                                    !related || Array.isArray(related)
                                        ? this.makeLinkUrl(
                                              `/${lowerCaseFirst(model)}/${this.getId(model, primary)}/${field}`
                                          )
                                        : this.makeLinkUrl(
                                              `/${lowerCaseFirst(model)}/${this.getId(
                                                  model,
                                                  primary
                                              )}/${field}/${this.getId(fieldMeta.type, related)}`
                                          )
                                ),
                                relationship: new Linker((primary, related) =>
                                    !related || Array.isArray(related)
                                        ? this.makeLinkUrl(
                                              `/${lowerCaseFirst(model)}/${this.getId(
                                                  model,
                                                  primary
                                              )}/relationships/${field}`
                                          )
                                        : this.makeLinkUrl(
                                              `/${lowerCaseFirst(model)}/${this.getId(
                                                  model,
                                                  primary
                                              )}/relationships/${field}/${this.getId(fieldMeta.type, related)}`
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

    private getId(model: string, data: any) {
        if (!data) {
            return undefined;
        }
        const ids = getIdFields(this.modelMeta, model);
        if (ids.length === 1) {
            return data[ids[0].name];
        } else {
            return undefined;
        }
    }

    private async serializeItems(
        model: string,
        items: unknown,
        options?: Partial<SerializerOptions<any>>
    ): Promise<Partial<DataDocument<any>>> {
        model = lowerCaseFirst(model);
        const serializer = this.serializers.get(model);
        if (!serializer) {
            throw new Error(`serializer not found for model ${model}`);
        }

        stripAuxFields(items);

        return JSON.parse(JSON.stringify(await serializer.serialize(items, options)));
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

    private makeIdSelect(model: string) {
        const idFields = getIdFields(this.modelMeta, model);
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
                    const filterKey = filterKeys[i];

                    const fieldInfo =
                        filterKey === 'id'
                            ? Object.values(typeInfo.fields).find((f) => f.isId)
                            : typeInfo.fields[filterKey];
                    if (!fieldInfo) {
                        return { filter: undefined, error: this.makeError('invalidFilter') };
                    }

                    if (!fieldInfo.isDataModel) {
                        // regular field
                        if (i !== filterKeys.length - 1) {
                            // must be the last segment of a filter
                            return { filter: undefined, error: this.makeError('invalidFilter') };
                        }
                        curr[fieldInfo.name] = this.makeFilterValue(fieldInfo, filterValue);
                    } else {
                        // relation field
                        if (i === filterKeys.length - 1) {
                            curr[fieldInfo.name] = this.makeFilterValue(fieldInfo, filterValue);
                        } else {
                            // keep going
                            curr = curr[fieldInfo.name] = {};
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
        if (!query) {
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
                        return { select: undefined, error: this.makeUnsupportedRelationshipError(type, relation) };
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

    private makeFilterValue(fieldInfo: FieldInfo, value: string): any {
        if (fieldInfo.isDataModel) {
            // relation filter is converted to an ID filter
            const info = this.typeMap[lowerCaseFirst(fieldInfo.type)];
            if (fieldInfo.isArray) {
                // filtering a to-many relation, imply 'some' operator
                return { some: this.makeIdFilter(info.idField, info.idFieldType, value) };
            } else {
                return { is: this.makeIdFilter(info.idField, info.idFieldType, value) };
            }
        } else {
            return this.coerce(fieldInfo.type, value);
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
            if (err.code === 'P2025' || err.code === 'P2018') {
                return this.makeError('notFound');
            } else {
                return {
                    status: 400,
                    body: {
                        errors: [{ status: 400, code: 'prisma-error', title: 'Prisma error', detail: err.message }],
                    },
                };
            }
        } else {
            throw err;
        }
    }

    private makeError(code: keyof typeof this.errors, detail?: string) {
        return {
            status: this.errors[code].status,
            body: {
                errors: [
                    {
                        status: this.errors[code].status,
                        code: paramCase(code),
                        title: this.errors[code].title,
                        detail: detail || this.errors[code].detail,
                    },
                ],
            },
        };
    }

    private makeUnsupportedModelError(model: string) {
        return this.makeError('unsupportedModel', `Model ${model} doesn't exist or doesn't have a single ID field`);
    }

    private makeUnsupportedRelationshipError(model: string, relationship: string) {
        return this.makeError(
            'unsupportedRelationship',
            `Relationship ${model}.${relationship} doesn't exist or its type doesn't have a single ID field`
        );
    }

    //#endregion
}

export default function makeHandler(options: Options) {
    const handler = new RequestHandler(options);
    return handler.handleRequest.bind(handler);
}
