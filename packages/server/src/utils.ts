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
