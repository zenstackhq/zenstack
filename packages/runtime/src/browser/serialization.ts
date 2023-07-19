/* eslint-disable @typescript-eslint/no-explicit-any */
import Decimal from 'decimal.js';
import SuperJSON from 'superjson';

SuperJSON.registerCustom<Decimal, string>(
    {
        isApplicable: (v): v is Decimal => Decimal.isDecimal(v),
        serialize: (v) => v.toJSON(),
        deserialize: (v) => new Decimal(v),
    },
    'Decimal'
);

SuperJSON.registerCustom<Buffer, string>(
    {
        isApplicable: (v): v is Buffer => Buffer.isBuffer(v),
        serialize: (v) => v.toString('base64'),
        deserialize: (v) => Buffer.from(v, 'base64'),
    },
    'Bytes'
);

/**
 * Serialize the given value with superjson
 */
export function serialize(value: unknown): { data: unknown; meta: unknown } {
    const { json, meta } = SuperJSON.serialize(value);
    return { data: json, meta };
}

/**
 * Deserialize the given value with superjson using the given metadata
 */
export function deserialize(value: unknown, meta: any): unknown {
    return SuperJSON.deserialize({ json: value as any, meta });
}
