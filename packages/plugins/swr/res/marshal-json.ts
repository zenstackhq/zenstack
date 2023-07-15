function marshal(value: unknown) {
    const { json, meta } = SuperJSON.serialize(value);
    if (meta) {
        return JSON.stringify({ ...(json as any), meta: { serialization: meta } });
    } else {
        return JSON.stringify(json);
    }
}

function unmarshal(value: string) {
    const parsed = JSON.parse(value);
    if (parsed.data && parsed.meta?.serialization) {
        const deserializedData = SuperJSON.deserialize({ json: parsed.data, meta: parsed.meta.serialization });
        return { ...parsed, data: deserializedData };
    } else {
        return parsed;
    }
}

function makeUrl(url: string, args: unknown) {
    if (!args) {
        return url;
    }

    const { json, meta } = SuperJSON.serialize(args);
    let result = `${url}?q=${encodeURIComponent(JSON.stringify(json))}`;
    if (meta) {
        result += `&meta=${encodeURIComponent(JSON.stringify({ serialization: meta }))}`;
    }
    return result;
}
