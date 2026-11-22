import { definePlugin, type ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import z from 'zod';
import { schema } from '../schemas/basic';

describe('Zod schema factory sharing across derived clients', () => {
    let db: ClientContract<typeof schema>;

    beforeEach(async () => {
        db = await createTestClient(schema);
    });

    afterEach(async () => {
        await db?.$disconnect();
    });

    it('shares the factory with a $use client whose plugin does not extend schemas', async () => {
        const derived = db.$use(
            definePlugin({
                id: 'noop',
                onQuery: ({ args, proceed }) => proceed(args),
            }),
        );
        expect(derived.$zod).toBe(db.$zod);

        await derived.user.findMany();
        const base = await db.$diagnostics;
        const ext = await derived.$diagnostics;
        expect(base.zodCache.size).toBeGreaterThan(0);
        expect(ext.zodCache).toEqual(base.zodCache);
    });

    it('gives a fresh factory to a $use client whose plugin extends query args', () => {
        const derived = db.$use(
            definePlugin({
                id: 'cache',
                queryArgs: { $read: z.object({ cache: z.boolean().optional() }) },
                onQuery: ({ args, proceed }) => proceed(args),
            }),
        );
        expect(derived.$zod).not.toBe(db.$zod);
    });

    it('shares the factory when only validation or non-schema options change', () => {
        expect(db.$setInputValidation(false).$zod).toBe(db.$zod);
        expect(db.$setOptions({ ...db.$options }).$zod).toBe(db.$zod);
    });

    it('gives a fresh factory when a schema-shaping option changes', () => {
        const derived = db.$setOptions({ ...db.$options, allowQueryTimeOmitOverride: false });
        expect(derived.$zod).not.toBe(db.$zod);
    });
});
