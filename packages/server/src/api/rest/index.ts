/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { FieldInfo } from '@zenstackhq/runtime';
import { DbClientContract, getIdFields } from '@zenstackhq/runtime';
import { getDefaultModelMeta, resolveField } from '@zenstackhq/runtime/enhancements/model-meta';
import type { ModelMeta } from '@zenstackhq/runtime/enhancements/types';
import { ModelZodSchema } from '@zenstackhq/runtime/zod';
import { DataDocument, Linker, Relator, Serializer } from 'ts-japi';
import UrlPattern from 'url-pattern';
import z from 'zod';
import { fromZodError } from 'zod-validation-error';
import { ApiRequestHandler, LoggerConfig, RequestContext } from '../types';
import { getZodSchema, stripAuxFields } from '../utils';
import { camelCase } from 'change-case';

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
    collection: new UrlPattern('/:type'),
    single: new UrlPattern('/:type/:id'),
    fetchRelationship: new UrlPattern('/:type/:id/:relationship'),
    relationships: new UrlPattern('/:type/:id(/relationships/:relationship)'),
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
    };

    private modelMeta: ModelMeta;
    // private maxRows: number;

    constructor(private readonly options: Options) {
        this.modelMeta = this.options.modelMeta || getDefaultModelMeta();
        // this.maxRows = this.options.maxRows ?? DEFAULT_MAX_ROWS;

        this.buildSerializers();
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
                    ? this.makeLinkUrl(`/${model}/`)
                    : this.makeLinkUrl(`/${model}/${items[ids[0].name]}`)
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
                const fieldSerializer = this.serializers.get(camelCase(fieldMeta.type));
                if (!fieldSerializer) {
                    continue;
                }
                const fieldIds = getIdFields(this.modelMeta, fieldMeta.type);
                if (fieldIds.length === 1) {
                    const relator = new Relator(async (data) => (data as any)[field], fieldSerializer, {
                        linkers: {
                            related: new Linker((primary, related) =>
                                fieldMeta.isArray
                                    ? this.makeLinkUrl(`/${camelCase(model)}/${this.getId(model, primary)}/${field}`)
                                    : this.makeLinkUrl(
                                          `/${camelCase(model)}/${this.getId(model, primary)}/${field}/${this.getId(
                                              fieldMeta.type,
                                              related
                                          )}`
                                      )
                            ),
                            relationship: new Linker((primary, related) =>
                                fieldMeta.isArray
                                    ? this.makeLinkUrl(
                                          `/${camelCase(model)}/${this.getId(model, primary)}/relationships/${field}`
                                      )
                                    : this.makeLinkUrl(
                                          `/${camelCase(model)}/${this.getId(
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

    getId(model: string, data: any) {
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

    async handleRequest({ prisma, method, path, query, requestBody }: RequestContext): Promise<Response> {
        method = method.toUpperCase();

        switch (method) {
            case 'GET': {
                let match = urlPatterns.single.match(path);
                if (match) {
                    if (!match.relationship) {
                        return this.processSingleRead(prisma, match.type, match.id, query);
                    } else {
                        return this.processRelationshipRead(prisma, match.type, match.id, match.relationship, query);
                    }
                } else {
                    match = urlPatterns.collection.match(path);
                    if (match) {
                        return this.processCollectionRead(prisma, match.type, query);
                    } else {
                        return this.errors.invalidPath;
                    }
                }
            }

            case 'POST': {
                const match = urlPatterns.collection.match(path);
                if (!match.relationship) {
                    return this.processCreate(prisma, match.type, query, requestBody);
                } else {
                    return this.processCreateRelationship(
                        prisma,
                        match.type,
                        match.relationship as string,
                        query,
                        requestBody
                    );
                }
            }

            // TODO: PUT for full update
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

    private makeIdFilter(model: string, resourceId: string) {
        const idFields = getIdFields(this.modelMeta, model);
        if (idFields.length === 0) {
            throw this.errors.noId;
        } else if (idFields.length > 1) {
            throw this.errors.multiId;
        }

        const idField = idFields[0];
        let idValue: any = resourceId;
        if (['Int', 'BigInt'].includes(idField.type)) {
            idValue = parseInt(idValue);
            if (isNaN(idValue)) {
                throw this.errors.invalidId;
            }
        }
        return { [idField.name]: idValue };
    }

    private async processSingleRead(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        _query: Record<string, string | string[]> | undefined
    ): Promise<Response> {
        let idFilter: { [key: string]: unknown };
        try {
            idFilter = this.makeIdFilter(type, resourceId);
        } catch (err) {
            return err as Response;
        }

        const entity = await prisma[type].findUnique({ where: idFilter });
        if (entity) {
            return {
                status: 200,
                body: await this.serializeItems(type, entity as Item),
            };
        } else {
            return this.errors.notFound;
        }
    }

    private async processRelationshipRead(
        prisma: DbClientContract,
        type: string,
        resourceId: string,
        relationship: string,
        query: Record<string, string> | undefined
    ): Promise<Response> {
        let idFilter: { [key: string]: unknown };
        try {
            idFilter = this.makeIdFilter(type, resourceId);
        } catch (err) {
            return err as Response;
        }

        const relationField = resolveField(this.modelMeta, type, relationship);
        if (!relationField || !relationField.isDataModel) {
            return this.errors.invalidPath;
        }

        const entity: any = await prisma[type].findUnique({ where: idFilter, select: { [relationship]: true } });
        if (entity && entity[relationship]) {
            return {
                status: 200,
                body: await this.serializeItems(type, entity[relationship] as Item),
            };
        } else {
            return this.errors.notFound;
        }
    }

    private async processCollectionRead(
        prisma: DbClientContract,
        type: string,
        _query: Record<string, string> | undefined
    ): Promise<Response> {
        const args: any = {};
        const relationFields: string[] = [];
        for (const [field, fieldMeta] of Object.entries<FieldInfo>(this.modelMeta.fields[type])) {
            if (fieldMeta.isDataModel) {
                const fieldIds = getIdFields(this.modelMeta, fieldMeta.type);
                if (fieldIds.length === 1) {
                    args.include = { [field]: { select: { [fieldIds[0].name]: true } } };
                }
                relationFields.push(field);
            }
        }
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
        const dataSchema = this.options.zodSchemas ? getZodSchema(this.options.zodSchemas, type, 'create') : undefined;
        const schema = this.makeCreateSchema(dataSchema);
        const parsed = schema.safeParse(requestBody);
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
            return {
                status: 400,
                body: {
                    errors: [
                        {
                            status: 400,
                            code: 'invalid-payload',
                            title: 'Invalid payload',
                            detail: 'The request payload must contain a "data" field with "attributes" field in it',
                        },
                    ],
                },
            };
        }

        const entity = await prisma[type].create({ data: attributes });
        return {
            status: 201,
            body: await this.serializeItems(type, entity as Item),
        };
    }

    private processUpdate(
        prisma: DbClientContract,
        _type: any,
        _resourceId: string,
        _query: Record<string, string> | undefined,
        _requestBody: unknown
    ): Response | PromiseLike<Response> {
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

    private processCreateRelationship(
        prisma: DbClientContract,
        _type: any,
        _relationship: string,
        _query: Record<string, string> | undefined,
        _requestBody: unknown
    ): Response | PromiseLike<Response> {
        throw new Error('Function not implemented.');
    }

    private processUpdateRelationship(
        prisma: DbClientContract,
        _type: any,
        _resourceId: string,
        _relationship: string,
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

    private makeCreateSchema(dataSchema?: z.ZodSchema) {
        return z.object({
            data: z.object({
                type: z.string(),
                attributes: dataSchema ?? z.object({}).optional(),
                relationships: z
                    .record(
                        z.object({
                            data: z.object({ type: z.string(), id: z.string() }),
                        })
                    )
                    .optional(),
            }),
        });
    }

    private async serializeItems(model: string, items: Item | Item[]): Promise<Partial<DataDocument<any>>> {
        const serializer = this.serializers.get(model);
        if (!serializer) {
            throw new Error(`serializer not found for model ${model}`);
        }

        stripAuxFields(items);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return JSON.parse(JSON.stringify(await serializer.serialize(items)));
    }
}
