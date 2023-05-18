import superjson from 'superjson';

function marshal(value: unknown) {
    return superjson.stringify(value);
}

function unmarshal(value: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = JSON.parse(value) as any;
    if (j?.json) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return superjson.parse<any>(value);
    } else {
        return j;
    }
}

function makeUrl(url: string, args: unknown) {
    return args ? url + `?q=${encodeURIComponent(superjson.stringify(args))}` : url;
}
