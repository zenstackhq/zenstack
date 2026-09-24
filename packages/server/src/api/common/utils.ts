import SuperJSON from 'superjson';

/**
 * Supports the SuperJSON request payload format used by api handlers
 * `{ meta: { serialization }, ...json }`.
 */
export async function processSuperJsonRequestPayload(payload: {
    data?: any;
    meta?: any;
}): Promise<{ result: unknown; error: string | undefined }> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { result: payload, error: undefined };
    }

    const { meta, data } = payload;
    if (meta?.serialization) {
        try {
            return {
                result: SuperJSON.deserialize({ json: data, meta: meta.serialization }),
                error: undefined,
            };
        } catch (err) {
            return {
                result: undefined,
                error: `failed to deserialize request payload: ${(err as Error).message}`,
            };
        }
    }

    return { result: data, error: undefined };
}

/**
 * Supports the SuperJSON query format used by api handlers:
 */
export function unmarshalQ(value: string, meta: string | undefined) {
    let parsedValue: any;
    try {
        parsedValue = JSON.parse(value);
    } catch {
        throw new Error('invalid "data" query parameter');
    }

    if (meta) {
        let parsedMeta: any;
        try {
            parsedMeta = JSON.parse(meta);
        } catch {
            throw new Error('invalid "meta" query parameter');
        }

        if (parsedMeta.serialization) {
            return SuperJSON.deserialize({ json: parsedValue, meta: parsedMeta.serialization });
        }
    }

    return parsedValue;
}
