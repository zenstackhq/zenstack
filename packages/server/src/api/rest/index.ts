/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { FieldInfo, enumerate } from '@zenstackhq/runtime';
import { DbClientContract, getIdFields } from '@zenstackhq/runtime';
import { getDefaultModelMeta } from '@zenstackhq/runtime/enhancements/model-meta';
import type { ModelMeta } from '@zenstackhq/runtime/enhancements/types';
import { ModelZodSchema } from '@zenstackhq/runtime/zod';
import { DataDocument, Linker, Relator, Serializer, SerializerOptions } from 'ts-japi';
import UrlPattern from 'url-pattern';
import z from 'zod';
import { fromZodError } from 'zod-validation-error';
import { ApiRequestHandler, LoggerConfig, RequestContext } from '../types';
import { getZodSchema, logWarning, stripAuxFields } from '../utils';
import { lowerCaseFirst } from 'lower-case-first';

/**
 * JSON:API response
 */
export type Response = {
    status: number;
    body: unknown;
    contentType?: string;
};

/**
 * Prisma item
 */
export type Item = {
    [key: string]: any;
    id: any;
};

const urlPatterns = {
    base: new UrlPattern('/:type(/:id)'),
    collection: new UrlPattern('/:type'),
    single: new UrlPattern('/:type/:id'),
    fetchRelationship: new UrlPattern('/:type/:id/:relationship'),
    relationship: new UrlPattern('/:type/:id/relationships/:relationship'),
};

// const DEFAULT_MAX_ROWS = 1000;

export type Options = {
    logger?: LoggerConfig | null;
    zodSchemas?: ModelZodSchema;
    modelMeta?: ModelMeta;
    maxRows?: number;
    endpointBase: string;
};

export default class RequestHandler implements ApiRequestHandler {
    private serializers = new Map<string, Serializer>();

    private readonly errors = {
        unsupportedModel: {
            status: 400,
            body: {
                errors: [
                    {
                        status: 400,
                        code: 'unsupported-model',
                        title: 'Unsupported model type',
                        detail: 'The model type is not supported due to not having a single ID field',
                    },
                ],
            },
        },
        unsupportedRelationship: {
            status: 400,
            body: {
                errors: [
                    {
                        status: 400,
                        code: 'unsupported-relationship',
                        title: 'Unsupported relationship',
                        detail: 'The relationship is not supported',
                    },
                ],
            },
        },
        invalidPath: {
            status: 400,
            body: {
                errors: [{ status: 400, code: 'invalid-path', title: 'The request path is invalid' }],
            },
        },
        invalidVerb: {
            status: 400,
            body: {
                errors: [{ status: 400, code: 'invalid-verb', title: 'The HTTP verb is not supported' }],
            },
        },
        notFound: {
            status: 404,
            body: { errors: [{ status: 404, code: 'not-found', title: 'Resource not found' }] },
        },
        noId: {
            status: 400,
            body: {
                errors: [{ status: 400, code: 'no-id', title: 'Model without an ID field is not supported' }],
            },
        },
        multiId: {
            status: 400,
            body: {
                errors: [{ status: 400, code: 'multi-id', title: 'Model with multiple ID fields is not supported' }],
            },
        },
        invalidId: {
            status: 400,
            body: {
                errors: [{ status: 400, code: 'invalid-id', title: 'Resource ID is invalid' }],
            },
        },
        invalidPayload: {
            status: 400,
            body: {
                errors: [
                    {
                        status: 400,
                        code: 'invalid-payload',
                        title: 'Invalid payload',
                    },
                ],
            },
        },
        invalidRelationData: {
            status: 400,
            body: {
                errors: [
                    {
                        status: 400,
                        code: 'invalid-payload',
                        title: 'Invalid payload',
                        detail: 'Invalid relationship data',
                    },
                ],
            },
        },
        invalidRelation: {
            status: 400,
            body: {
                errors: [
                    { status: 400, code: 'invalid-payload', title: 'Invalid payload', detail: 'Invalid relationship' },
                ],
            },
        },
    };

    private modelMeta: ModelMeta;

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

    private createSingleRelationSchema = z.object({
        data: z.object({ type: z.string(), id: z.union([z.string(), z.number()]) }),
    });

    // private updateSingleRelationSchema = z.object({
    //     data: z.object({ type: z.string(), id: z.union([z.string(), z.number()]) }).nullable(),
    // });

    private updateCollectionRelationSchema = z.object({
        data: z.array(z.object({ type: z.string(), id: z.union([z.string(), z.number()]) })),
    });

    private readonly typeMap: Record<
        string,
        {
            idField: string;
            idFieldType: string;
            relationships: Record<
                string,
                { type: string; idField: string; idFieldType: string; isCollection: boolean }
            >;
        }
    > = {};

    constructor(private readonly options: Options) {
        this.modelMeta = this.options.modelMeta || getDefaultModelMeta();
        this.buildTypeMap();
        this.buildSerializers();
    }

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
                };
            }
        }
    }

    async handleRequest({ prisma, method, path, query, requestBody }: RequestContext): Promise<Response> {
        method = method.toUpperCase();

        switch (method) {
            case 'GET': {
                let match = urlPatterns.single.match(path);
                if (match) {
                    return this.processSingleRead(prisma, match.type, match.id, query);
                }

                match = urlPatterns.fetchRelationship.match(path);
                if (match) {
                    return this.processFetchRelated(prisma, match.type, match.id, match.relationship, query);
                }

                match = urlPatterns.relationship.match(path);
                if (match) {
                    return this.processReadRelationship(prisma, match.type, match.id, match.relationship, query);
                }

                match = urlPatterns.collection.match(path);
                if (match) {
                    return this.processCollectionRead(prisma, match.type, query);
                }

                return this.errors.invalidPath;
            }

            case 'POST': {
                let match = urlPatterns.collection.match(path);
                if (match) {
                    return this.processCreate(prisma, match.type, query, requestBody);
                }

                match = urlPatterns.relationship.match(path);
                if (match) {
                    return this.processCreateRelationship(
                        prisma,
                        match.type,
                        match.id,
                        match.relationship,
                        query,
                        requestBody
                    );
                }

                return this.errors.invalidPath;
            }

            // TODO: PUT for full update
            case 'PUT':
            case 'PATCH': {
                const match = urlPatterns.single.match(path);
                if (!match.relationship) {
                    return this.processUpdate(prisma, match.type, match.id, query, requestBody);
                } else {
                    return this.processUpdateRelationship(
                        prisma,
                        match.type,
                        match.id,
                        match.relationship as string,
                        query,
                        requestBody
                    );
                }
            }

            case 'DELETE': {
                const match = urlPatterns.single.match(path);
                if (!match.relationship) {
                    return this.processDelete(prisma, match.type, match.id, query, requestBody);
                } else {
                    return this.processDeleteRelationship(
                        prisma,
                        match.type,
                        match.id,
                        match.relationship as string,
                        query,
                        requestBody
                    );
                }
            }

            default:
                return this.errors.invalidVerb;
        }
    }

    private async processSingleRead(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        _query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.errors.unsupportedModel;
        }

        const args = { where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId) };
        this.includeRelationshipIds(type, args, 'include');
        const entity = await prisma[type].findUnique(args);
        if (entity) {
            return {
                status: 200,
                body: await this.serializeItems(type, entity as Item),
            };
        } else {
            return this.errors.notFound;
        }
    }

    private async processFetchRelated(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.errors.unsupportedModel;
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.errors.unsupportedRelationship;
        }

        const entity: any = await prisma[type].findUnique({
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: { [relationship]: true },
        });
        if (entity && entity[relationship]) {
            return {
                status: 200,
                body: await this.serializeItems(relationInfo.type, entity[relationship] as Item, {
                    linkers: {
                        document: new Linker(() => this.makeLinkUrl(`/${type}/${resourceId}/${relationship}`)),
                    },
                }),
            };
        } else {
            return this.errors.notFound;
        }
    }

    private async processReadRelationship(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.errors.unsupportedModel;
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.errors.unsupportedRelationship;
        }

        const args = {
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: this.makeIdSelect(type),
        };

        this.includeRelationshipIds(type, args, 'select');
        const entity: any = await prisma[type].findUnique(args);
        if (entity && entity[relationship]) {
            const serialized: any = await this.serializeItems(relationInfo.type, entity[relationship] as Item, {
                linkers: {
                    document: new Linker(() =>
                        this.makeLinkUrl(`/${type}/${resourceId}/relationships/${relationship}`)
                    ),
                },
                onlyIdentifier: true,
            });

            return {
                status: 200,
                body: serialized,
            };
        } else {
            return this.errors.notFound;
        }
    }

    private async processCollectionRead(
        prisma: DbClientContract,
        type: string,
        query: Record<string, string> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.errors.unsupportedModel;
        }

        const args: any = {};
        this.includeRelationshipIds(type, args, 'include');
        const entities = await prisma[type].findMany(args);
        return {
            status: 200,
            body: await this.serializeItems(type, entities as Item[]),
        };
    }

    private async processCreate(
        prisma: DbClientContract,
        type: string,
        _query: Record<string, string | string[]> | undefined,
        requestBody: unknown
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.errors.unsupportedModel;
        }

        const parsed = this.createUpdatePayloadSchema.safeParse(requestBody);
        if (!parsed.success) {
            return {
                status: 400,
                body: {
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-payload',
                            title: 'Invalid payload',
                            detail: fromZodError(parsed.error).message,
                        },
                    ],
                },
            };
        }

        const parsedPayload = parsed.data;

        const attributes = parsedPayload.data?.attributes;
        if (!attributes) {
            return this.errors.invalidPayload;
        }

        const createPayload: any = { data: { ...attributes } };

        const dataSchema = this.options.zodSchemas ? getZodSchema(this.options.zodSchemas, type, 'create') : undefined;
        if (dataSchema) {
            const dataParsed = dataSchema.safeParse(createPayload);
            if (!dataParsed.success) {
                return {
                    status: 400,
                    body: {
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-payload',
                                title: 'Invalid payload',
                                detail: fromZodError(dataParsed.error).message,
                            },
                        ],
                    },
                };
            }
        }

        const relationships = parsedPayload.data?.relationships;
        if (relationships) {
            for (const [key, data] of Object.entries<any>(relationships)) {
                if (!data?.data) {
                    return this.errors.invalidRelationData;
                }

                const relationInfo = typeInfo.relationships[key];
                if (!relationInfo) {
                    return this.errors.unsupportedRelationship;
                }

                if (relationInfo.isCollection) {
                    createPayload.data[key] = {
                        connect: enumerate(data.data).map((item: any) => ({
                            [relationInfo.idField]: this.coerce(relationInfo.idFieldType, item.id),
                        })),
                    };
                } else {
                    if (typeof data.data !== 'object') {
                        return this.errors.invalidRelationData;
                    }
                    createPayload.data[key] = {
                        connect: { [relationInfo.idField]: this.coerce(relationInfo.idFieldType, data.data.id) },
                    };
                }
                createPayload.include = {
                    ...createPayload.include,
                    [key]: { select: { [relationInfo.idField]: true } },
                };
            }
        }

        const entity = await prisma[type].create(createPayload);
        return {
            status: 201,
            body: await this.serializeItems(type, entity as Item),
        };
    }

    private async processCreateRelationship(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string> | undefined,
        requestBody: unknown
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.errors.unsupportedModel;
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.errors.unsupportedRelationship;
        }

        const updateArgs: any = {
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: { [typeInfo.idField]: true, [relationship]: { select: { [relationInfo.idField]: true } } },
        };
        let entity: any;

        if (!relationInfo.isCollection) {
            const parsed = this.createSingleRelationSchema.safeParse(requestBody);
            if (!parsed.success) {
                return this.errors.invalidPayload;
            }

            updateArgs.data = {
                [relationship]: {
                    connect: { [relationInfo.idField]: this.coerce(relationInfo.idFieldType, parsed.data.data.id) },
                },
            };

            entity = await prisma[type].update(updateArgs);
        } else {
            const parsed = this.updateCollectionRelationSchema.safeParse(requestBody);
            if (!parsed.success) {
                return this.errors.invalidPayload;
            }
            updateArgs.data = {
                [relationship]: {
                    connect: enumerate(parsed.data.data).map((item: any) => ({
                        [relationInfo.idField]: this.coerce(relationInfo.idFieldType, item.id),
                    })),
                },
            };
            entity = await prisma[type].update(updateArgs);
        }

        const serialized: any = await this.serializeItems(relationInfo.type, entity[relationship] as Item, {
            linkers: {
                document: new Linker(() => this.makeLinkUrl(`/${type}/${resourceId}/relationships/${relationship}`)),
            },
            onlyIdentifier: true,
        });

        return {
            status: 200,
            body: serialized, // serialized.data.relationships[relationship],
        };
    }

    private async processUpdate(
        prisma: DbClientContract,
        type: any,
        resourceId: string,
        query: Record<string, string> | undefined,
        requestBody: unknown
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.errors.unsupportedModel;
        }

        const parsed = this.createUpdatePayloadSchema.safeParse(requestBody);
        if (!parsed.success) {
            return {
                status: 400,
                body: {
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-payload',
                            title: 'Invalid payload',
                            detail: fromZodError(parsed.error).message,
                        },
                    ],
                },
            };
        }

        const parsedPayload = parsed.data;

        const attributes = parsedPayload.data?.attributes;
        if (!attributes) {
            return this.errors.invalidPayload;
        }

        const updatePayload: any = {
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            data: { ...attributes },
        };

        const dataSchema = this.options.zodSchemas ? getZodSchema(this.options.zodSchemas, type, 'update') : undefined;
        if (dataSchema) {
            const dataParsed = dataSchema.safeParse(updatePayload);
            if (!dataParsed.success) {
                return {
                    status: 400,
                    body: {
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-payload',
                                title: 'Invalid payload',
                                detail: fromZodError(dataParsed.error).message,
                            },
                        ],
                    },
                };
            }
        }

        const relationships = parsedPayload.data?.relationships;
        if (relationships) {
            for (const [key, data] of Object.entries<any>(relationships)) {
                if (!data?.data) {
                    return this.errors.invalidRelationData;
                }

                const relationInfo = typeInfo.relationships[key];
                if (!relationInfo) {
                    return this.errors.unsupportedRelationship;
                }

                if (relationInfo.isCollection) {
                    updatePayload.data[key] = {
                        set: enumerate(data.data).map((item: any) => ({
                            [relationInfo.idField]: this.coerce(relationInfo.idFieldType, item.id),
                        })),
                    };
                } else {
                    if (typeof data.data !== 'object') {
                        return this.errors.invalidRelationData;
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
            body: await this.serializeItems(type, entity as Item),
        };
    }

    private async processUpdateRelationship(
        prisma: DbClientContract,
        type: any,
        resourceId: string,
        relationship: string,
        query: Record<string, string> | undefined,
        requestBody: unknown
    ): Promise<Response> {
        throw new Error('Function not implemented.');
    }

    private processDelete(
        prisma: DbClientContract,
        _type: any,
        _resourceId: string,
        _query: Record<string, string> | undefined,
        _requestBody: unknown
    ): Response | PromiseLike<Response> {
        throw new Error('Function not implemented.');
    }

    private processDeleteRelationship(
        prisma: DbClientContract,
        _type: any,
        _resourceId: string,
        _relationship: string,
        _query: Record<string, string> | undefined,
        _requestBody: unknown
    ): Response | PromiseLike<Response> {
        throw new Error('Function not implemented.');
    }

    private makeLinkUrl(path: string) {
        return `${this.options.endpointBase}${path}`;
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
                    const relator = new Relator(async (data) => (data as any)[field], fieldSerializer, {
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
                    });
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
        items: Item | Item[],
        options?: Partial<SerializerOptions<any>>
    ): Promise<Partial<DataDocument<any>>> {
        model = lowerCaseFirst(model);
        const serializer = this.serializers.get(model);
        if (!serializer) {
            throw new Error(`serializer not found for model ${model}`);
        }

        stripAuxFields(items);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return JSON.parse(JSON.stringify(await serializer.serialize(items, options)));
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

    private coerce(type: string, id: any) {
        if ((type === 'Int' || type === 'BigInt') && typeof id === 'string') {
            return parseInt(id);
        }
        return id;
    }
}
