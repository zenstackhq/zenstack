import Decimal from 'decimal.js';
import superjson from 'superjson';

export function registerSerializers() {
    superjson.registerCustom<Buffer, string>(
        {
            isApplicable: (v): v is Buffer => Buffer.isBuffer(v),
            serialize: (v) => JSON.stringify(v.toJSON().data),
            deserialize: (v) => Buffer.from(JSON.parse(v)),
        },
        'Buffer'
    );
    superjson.registerCustom<Decimal, string>(
        {
            isApplicable: (v): v is Decimal => Decimal.isDecimal(v),
            serialize: (v) => v.toJSON(),
            deserialize: (v) => new Decimal(v),
        },
        'decimal.js'
    );
}

export function marshal(value: unknown) {
    return superjson.stringify(value);
}

export function unmarshal(value: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return superjson.parse<any>(value);
}
