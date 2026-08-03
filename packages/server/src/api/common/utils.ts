import SuperJSON from 'superjson';

/**
 * Supports the SuperJSON request payload format used by api handlers
 * `{ meta: { serialization }, ...json }`.
 */
export async function processSuperJsonRequestPayload(
    payload: unknown,
): Promise<{ result: unknown; error: string | undefined }> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('meta' in (payload as any))) {
        return { result: payload, error: undefined };
    }

    const { meta, ...rest } = payload as any;
    if (meta?.serialization) {
        try {
            return {
                result: SuperJSON.deserialize({ json: rest, meta: meta.serialization }),
                error: undefined,
            };
        } catch (err) {
            return {
                result: undefined,
                error: `failed to deserialize request payload: ${(err as Error).message}`,
            };
        }
    }

    // drop meta when no serialization info is present
    return { result: rest, error: undefined };
}

/**
 * Supports the SuperJSON query format used by api handlers:
 */
export function unmarshalQ(value: string, meta: string | undefined) {
    let parsedValue: any;
    try {
        parsedValue = JSON.parse(value);
    } catch {
        throw new Error('invalid "q" query parameter');
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
