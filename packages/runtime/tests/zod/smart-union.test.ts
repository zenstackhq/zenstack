import { z } from 'zod';
import { smartUnion } from '../../src/zod-utils';

describe('Zod smart union', () => {
    it('should work with scalar union', () => {
        const schema = smartUnion(z, [z.string(), z.number()]);
        expect(schema.safeParse('test')).toMatchObject({ success: true, data: 'test' });
        expect(schema.safeParse(1)).toMatchObject({ success: true, data: 1 });
        expect(schema.safeParse(true)).toMatchObject({ success: false });
    });

    it('should work with non-ambiguous object union', () => {
        const schema = smartUnion(z, [z.object({ a: z.string() }), z.object({ b: z.number() }).strict()]);
        expect(schema.safeParse({ a: 'test' })).toMatchObject({ success: true, data: { a: 'test' } });
        expect(schema.safeParse({ b: 1 })).toMatchObject({ success: true, data: { b: 1 } });
        expect(schema.safeParse({ a: 'test', b: 1 })).toMatchObject({ success: true });
        expect(schema.safeParse({ b: 1, c: 'test' })).toMatchObject({ success: false });
        expect(schema.safeParse({ c: 'test' })).toMatchObject({ success: false });
    });

    it('should work with ambiguous object union', () => {
        const schema = smartUnion(z, [
            z.object({ a: z.string(), b: z.number() }),
            z.object({ a: z.string(), c: z.boolean() }),
        ]);
        expect(schema.safeParse({ a: 'test', b: 1 })).toMatchObject({ success: true, data: { a: 'test', b: 1 } });
        expect(schema.safeParse({ a: 'test', c: true })).toMatchObject({ success: true, data: { a: 'test', c: true } });
        expect(schema.safeParse({ a: 'test', b: 1, z: 'z' })).toMatchObject({
            success: true,
            data: { a: 'test', b: 1 },
        });
        expect(schema.safeParse({ a: 'test', c: true, z: 'z' })).toMatchObject({
            success: true,
            data: { a: 'test', c: true },
        });
        expect(schema.safeParse({ c: 'test' })).toMatchObject({ success: false });
    });

    it('should work with non-ambiguous array union', () => {
        const schema = smartUnion(z, [
            z.object({ a: z.string() }).array(),
            z.object({ b: z.number() }).strict().array(),
        ]);

        expect(schema.safeParse([{ a: 'test' }])).toMatchObject({ success: true, data: [{ a: 'test' }] });
        expect(schema.safeParse([{ a: 'test' }, { a: 'test1' }])).toMatchObject({
            success: true,
            data: [{ a: 'test' }, { a: 'test1' }],
        });

        expect(schema.safeParse([{ b: 1 }])).toMatchObject({ success: true, data: [{ b: 1 }] });
        expect(schema.safeParse([{ a: 'test', b: 1 }])).toMatchObject({ success: true });
        expect(schema.safeParse([{ b: 1, c: 'test' }])).toMatchObject({ success: false });
        expect(schema.safeParse([{ c: 'test' }])).toMatchObject({ success: false });

        // all items must match the same candidate
        expect(schema.safeParse([{ a: 'test' }, { b: 1 }])).toMatchObject({ success: false });
    });

    it('should work with ambiguous array union', () => {
        const schema = smartUnion(z, [
            z.object({ a: z.string(), b: z.number() }).array(),
            z.object({ a: z.string(), c: z.boolean() }).array(),
        ]);

        expect(schema.safeParse([{ a: 'test', b: 1 }])).toMatchObject({ success: true, data: [{ a: 'test', b: 1 }] });
        expect(schema.safeParse([{ a: 'test', c: true }])).toMatchObject({
            success: true,
            data: [{ a: 'test', c: true }],
        });
        expect(schema.safeParse([{ a: 'test', b: 1, z: 'z' }])).toMatchObject({
            success: true,
            data: [{ a: 'test', b: 1 }],
        });
        expect(schema.safeParse([{ a: 'test', c: true, z: 'z' }])).toMatchObject({
            success: true,
            data: [{ a: 'test', c: true }],
        });
        expect(schema.safeParse([{ c: 'test' }])).toMatchObject({ success: false });

        // all items must match the same candidate
        expect(schema.safeParse([{ a: 'test' }, { c: true }])).toMatchObject({ success: false });
    });

    it('should work with lazy schemas', () => {
        const schema = smartUnion(z, [
            z.lazy(() => z.object({ a: z.string(), b: z.number() })),
            z.lazy(() => z.object({ a: z.string(), c: z.boolean() })),
        ]);
        expect(schema.safeParse({ a: 'test', b: 1 })).toMatchObject({ success: true, data: { a: 'test', b: 1 } });
        expect(schema.safeParse({ a: 'test', c: true })).toMatchObject({ success: true, data: { a: 'test', c: true } });
        expect(schema.safeParse({ a: 'test', b: 1, z: 'z' })).toMatchObject({
            success: true,
            data: { a: 'test', b: 1 },
        });
    });

    it('should work with mixed object and array unions', () => {
        const schema = smartUnion(z, [
            z.object({ a: z.string() }).strict(),
            z.object({ b: z.number() }).strict().array(),
        ]);

        expect(schema.safeParse({ a: 'test' })).toMatchObject({ success: true, data: { a: 'test' } });
        expect(schema.safeParse([{ b: 1 }])).toMatchObject({ success: true, data: [{ b: 1 }] });
        expect(schema.safeParse({ a: 'test', b: 1 })).toMatchObject({ success: false });
        expect(schema.safeParse([{ a: 'test' }])).toMatchObject({ success: false });
    });
});
