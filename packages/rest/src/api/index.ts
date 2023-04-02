import { DataDocument, Serializer } from 'ts-japi';
import { logError, RequestContext, stripAuxFields, zodValidate } from '@zenstackhq/server/openapi';

/**
 * OpenApi response.
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

/**
 * JSON:API serializers
 */
const serializers = new Map<string, Serializer>();

/**
 * Serialize Prisma items into JSON:API resources.
 *
 * @param items Item(s) to serialize
 * @returns Serialize item(s)
 */
async function serializeItems(model: string, items: Item | Item[]): Promise<Partial<DataDocument<any>>> {
    if (!serializers.has(model)) {
        serializers.set(model, new Serializer(model));
    }

    stripAuxFields(items);

    return JSON.parse(JSON.stringify(await serializers.get(model)!.serialize(items)));
}

/**
 * Handles OpenApi requests
 */
export async function handleRequest({
    method,
    path,
    query,
    requestBody,
    prisma,
    logger,
    zodSchemas,
}: RequestContext): Promise<Response> {
    const parts = path.split('/').filter((p) => !!p);
    const model = parts[0];
    const resourceId = parts[1];

    if ((parts.length !== 1 && parts.length !== 2) || !model) {
        return {
            status: 400,
            body: { errors: [{ status: 400, code: 'invalid-path', title: 'Invalid request path' }] },
        };
    }

    method = method.toUpperCase();

    try {
        if (method === 'GET') {
            // Handling GET requests
            if (!resourceId) {
                const items = (await prisma[model].findMany({ where: query })) as Item[];

                return {
                    status: 200,
                    body: await serializeItems(model, items),
                };
            } else {
                const item = (await prisma[model].findUnique({ where: { id: resourceId } })) as Item;

                if (!item) {
                    return {
                        status: 404,
                        body: { errors: [{ status: 404, code: 'not-found', title: 'Resource not found' }] },
                    };
                }

                return {
                    status: 200,
                    body: await serializeItems(model, item),
                };
            }
        } else if (method === 'POST') {
            // Handling POST requests
            let createRequest = { data: requestBody };
            let createError;

            if (zodSchemas) {
                const createValidationResult = zodValidate(zodSchemas, model, 'create', { data: requestBody });
                createRequest = createValidationResult.data;
                createError = createValidationResult.error;
            }

            if (createError) {
                return {
                    status: 400,
                    body: {
                        errors: [
                            {
                                status: 400,
                                code: 'validation-error',
                                title: 'Validation failed',
                                detail: createError,
                            },
                        ],
                    },
                };
            }

            const createdItem = (await prisma[model].create(createRequest)) as Item;

            return {
                status: 201,
                body: await serializeItems(model, createdItem),
            };
        } else if (method === 'PUT' || method === 'PATCH') {
            // Handling PUT requests
            if (!resourceId) {
                return {
                    status: 400,
                    body: {
                        errors: [{ status: 400, code: 'missing-id', title: 'Resource ID is required for PUT' }],
                    },
                };
            }

            let updateRequest = { where: { id: resourceId }, data: requestBody };
            let updateError;

            if (zodSchemas) {
                const updateValidationResult = zodValidate(zodSchemas, model, 'update', updateRequest);

                updateRequest = updateValidationResult.data;
                updateError = updateValidationResult.error;
            }

            if (updateError) {
                return {
                    status: 400,
                    body: {
                        errors: [
                            {
                                status: 400,
                                code: 'validation-error',
                                title: 'Validation failed',
                                detail: updateError,
                            },
                        ],
                    },
                };
            }

            try {
                const updatedItem = (await prisma[model].update(updateRequest)) as Item;

                return {
                    status: 200,
                    body: await serializeItems(model, updatedItem),
                };
            } catch (error: any) {
                if (error?.code === 'P2025') {
                    return {
                        status: 404,
                        body: { errors: [{ status: 404, code: 'not-found', title: 'Resource not found' }] },
                    };
                } else {
                    throw error;
                }
            }
        } else if (method === 'DELETE') {
            // Handling DELETE requests
            if (!resourceId) {
                return {
                    status: 400,
                    body: {
                        errors: [{ status: 400, code: 'missing-id', title: 'Resource ID is required for DELETE' }],
                    },
                };
            }

            try {
                await prisma[model].delete({ where: { id: resourceId } });

                return {
                    status: 204,
                    body: null,
                };
            } catch (error: any) {
                if (error?.code === 'P2025') {
                    return {
                        status: 404,
                        body: { errors: [{ status: 404, code: 'not-found', title: 'Resource not found' }] },
                    };
                } else {
                    throw error;
                }
            }
        } else {
            logError(logger, 'Unsupported method: ' + method, 'unsupported-method');

            return {
                status: 405,
                body: { errors: [{ status: 405, code: 'unsupported-method', title: 'Method not allowed' }] },
            };
        }
    } catch (error: any) {
        logError(logger, error.message, 'server-error');

        return {
            status: 500,
            body: { errors: [{ status: 500, code: 'server-error', title: 'Internal server error' }] },
        };
    }
}
