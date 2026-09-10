import { ExpressionUtils, type AttributeApplication } from '@zenstackhq/schema';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { addStringValidation } from '../src/utils';

function attr(name: string, args: { name?: string; value: string | number | boolean }[]): AttributeApplication {
    return { name, args: args.map((a) => ({ name: a.name, value: ExpressionUtils.literal(a.value) })) };
}

function validate(attribute: AttributeApplication, value: string) {
    return addStringValidation(z.string(), [attribute]).safeParse(value).success;
}

describe('string validation attributes', () => {
    const uuidV4 = '20ef31c8-a2c6-4dca-b87b-838e364ab4b3';
    const uuidV7 = '0199a1b2-c3d4-7abc-8def-0123456789ab';

    it('accepts any uuid version when no version is given', () => {
        expect(validate(attr('@uuid', []), uuidV4)).toBe(true);
        expect(validate(attr('@uuid', []), uuidV7)).toBe(true);
        expect(validate(attr('@uuid', []), 'not-a-uuid')).toBe(false);
    });

    it('respects a named version arg regardless of argument order', () => {
        const versionFirst = attr('@uuid', [
            { name: 'version', value: 7 },
            { name: 'message', value: 'custom' },
        ]);
        expect(validate(versionFirst, uuidV7)).toBe(true);
        expect(validate(versionFirst, uuidV4)).toBe(false);

        const messageFirst = attr('@uuid', [
            { name: 'message', value: 'custom' },
            { name: 'version', value: 7 },
        ]);
        expect(validate(messageFirst, uuidV7)).toBe(true);
        expect(validate(messageFirst, uuidV4)).toBe(false);

        const v4 = attr('@uuid', [
            { name: 'message', value: 'custom' },
            { name: 'version', value: 4 },
        ]);
        expect(validate(v4, uuidV4)).toBe(true);
        expect(validate(v4, uuidV7)).toBe(false);
    });

    it('resolves @time precision from a named arg in any order', () => {
        const messageFirst = attr('@time', [
            { name: 'message', value: 'custom' },
            { name: 'precision', value: 3 },
        ]);
        expect(validate(messageFirst, '12:00:00.123')).toBe(true);
        expect(validate(messageFirst, '12:00:00')).toBe(false);
    });
});
