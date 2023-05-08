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
import { lowerCaseFirst } from 'lower-case-first';
import { DataDocument, Linker, Relator, Serializer, SerializerOptions } from 'ts-japi';
import UrlPattern from 'url-pattern';
import z from 'zod';
import { fromZodError } from 'zod-validation-error';
import { LoggerConfig, RequestContext, Response } from '../types';
import { getZodSchema, logWarning, stripAuxFields } from '../utils';
import { paramCase } from 'change-case';

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
    logger?: LoggerConfig | null;
    zodSchemas?: ModelZodSchema;
    modelMeta?: ModelMeta;
    maxRows?: number;
    endpoint: string;
};

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
            detail: 'The model type is not supported due to not having a single ID field',
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
    };

    private modelMeta: ModelMeta;

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
    private readonly typeMap: Record<
        string,
        {
            idField: string;
            idFieldType: string;
            relationships: Record<
                string,
                { type: string; idField: string; idFieldType: string; isCollection: boolean; isOptional: boolean }
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
                    isOptional: fieldInfo.isOptional,
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
                    // single resource read
                    return this.processSingleRead(prisma, match.type, match.id, query);
                }

                match = urlPatterns.fetchRelationship.match(path);
                if (match) {
                    // fetch related resource(s)
                    return this.processFetchRelated(prisma, match.type, match.id, match.relationship, query);
                }

                match = urlPatterns.relationship.match(path);
                if (match) {
                    // read relationship
                    return this.processReadRelationship(prisma, match.type, match.id, match.relationship, query);
                }

                match = urlPatterns.collection.match(path);
                if (match) {
                    // collection read
                    return this.processCollectionRead(prisma, match.type, query);
                }

                return this.makeError('invalidPath');
            }

            case 'POST': {
                let match = urlPatterns.collection.match(path);
                if (match) {
                    // resource creation
                    return this.processCreate(prisma, match.type, query, requestBody);
                }

                match = urlPatterns.relationship.match(path);
                if (match) {
                    // relationship creation (collection relationship only)
                    return this.processRelationshipCRUD(
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
                    return this.processUpdate(prisma, match.type, match.id, query, requestBody);
                }

                match = urlPatterns.relationship.match(path);
                if (match) {
                    // relationship update
                    return this.processRelationshipCRUD(
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
                    return this.processDelete(prisma, match.type, match.id, query);
                }

                match = urlPatterns.relationship.match(path);
                if (match) {
                    // relationship deletion (collection relationship only)
                    return this.processRelationshipCRUD(
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
    }

    private async processSingleRead(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        _query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const args = { where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId) };

        // include IDs of relation fields so that they can be serialized
        this.includeRelationshipIds(type, args, 'include');

        const entity = await prisma[type].findUnique(args);
        if (entity) {
            return {
                status: 200,
                body: await this.serializeItems(type, entity),
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
        query: Record<string, string> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.makeUnsupportedRelationshipError(type, relationship);
        }

        const entity: any = await prisma[type].findUnique({
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: { [relationship]: true },
        });
        if (entity && entity[relationship]) {
            return {
                status: 200,
                body: await this.serializeItems(relationInfo.type, entity[relationship], {
                    linkers: {
                        document: new Linker(() => this.makeLinkUrl(`/${type}/${resourceId}/${relationship}`)),
                    },
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
        query: Record<string, string> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const relationInfo = typeInfo.relationships[relationship];
        if (!relationInfo) {
            return this.makeUnsupportedRelationshipError(type, relationship);
        }

        const args = {
            where: this.makeIdFilter(typeInfo.idField, typeInfo.idFieldType, resourceId),
            select: this.makeIdSelect(type),
        };

        // include IDs of relation fields so that they can be serialized
        this.includeRelationshipIds(type, args, 'select');

        const entity: any = await prisma[type].findUnique(args);
        if (entity && entity[relationship]) {
            const serialized: any = await this.serializeItems(relationInfo.type, entity[relationship], {
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
            return this.makeError('notFound');
        }
    }

    private async processCollectionRead(
        prisma: DbClientContract,
        type: string,
        query: Record<string, string> | undefined
    ): Promise<Response> {
        const typeInfo = this.typeMap[type];
        if (!typeInfo) {
            return this.makeUnsupportedModelError(type);
        }

        const args: any = {};

        // include IDs of relation fields so that they can be serialized
        this.includeRelationshipIds(type, args, 'include');

        const entities = await prisma[type].findMany(args);
        return {
            status: 200,
            body: await this.serializeItems(type, entities),
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
        query: Record<string, string> | undefined,
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
        query: Record<string, string> | undefined,
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
        query: Record<string, string> | undefined
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
