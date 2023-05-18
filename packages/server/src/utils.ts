import superjson from 'superjson';

/**
 * Marshal an object to string
 */
export function marshalToString(value: unknown, useSuperJson = false) {
    return useSuperJson ? superjson.stringify(value) : JSON.stringify(value);
}

/**
 * Marshals an object
 */
export function marshalToObject(value: unknown, useSuperJson = false) {
    return useSuperJson ? JSON.parse(superjson.stringify(value)) : value;
}

/**
 * Unmarshal a string to object
 */
export function unmarshalFromString(value: string, useSuperJson = false) {
    if (value === undefined || value === null) {
        return value;
    }

    const j = JSON.parse(value);
    if (useSuperJson) {
        if (j?.json) {
            // parse with superjson
            return superjson.parse(value);
        } else {
            // parse as regular json
            return j;
        }
    } else {
        return j;
    }
}

/**
 * Unmarshal an object
 */
export function unmarshalFromObject(value: unknown, useSuperJson = false) {
    if (value === undefined || value === null) {
        return value;
    }

    if (useSuperJson) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((value as any).json) {
            // parse with superjson
            return superjson.parse(JSON.stringify(value));
        } else {
            // parse as regular json
            return value;
        }
    } else {
        return value;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildUrlQuery(query: unknown, useSuperJson: boolean) {
    const result: Record<string, string | string[]> = {};

    if (typeof query !== 'object' || query === null) {
        return result;
    }

    for (const [key, v] of Object.entries(query)) {
        if (typeof v !== 'string' && !Array.isArray(v)) {
            continue;
        }

        let value = v as string | string[];

        if (key === 'q') {
            // handle parameter marshalling (potentially using superjson)
            if (Array.isArray(value)) {
                value = value.map((v) => JSON.stringify(unmarshalFromString(v as string, useSuperJson)));
            } else {
                value = JSON.stringify(unmarshalFromString(value as string, useSuperJson));
            }
        }
        result[key] = value;
    }
    return result;
}
