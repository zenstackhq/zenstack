import { createTestClient } from '@zenstackhq/testtools';
import type { UpdateArgs, UpsertArgs } from '@zenstackhq/orm';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { schema, type SchemaType } from './schema';

// https://github.com/zenstackhq/zenstack/issues/2778

// These mirror the types emitted by `zenstack generate` into `input.ts`
type TagUpsertArgs = UpsertArgs<SchemaType, 'Tag'>;
type TagUpdateArgs = UpdateArgs<SchemaType, 'Tag'>;

describe('Regression for issue #2778', () => {
    it('accepts generated UpsertArgs/UpdateArgs with many-to-many relations without deep instantiation', async () => {
        const db = await createTestClient(schema, {
            usePrismaPush: true,
            schemaFile: path.join(__dirname, 'schema.zmodel'),
        });

        // passing the generated args type directly to the client method used to trigger
        // "Type instantiation is excessively deep and possibly infinite"
        const upsertTag = (args: TagUpsertArgs) => db.tag.upsert(args);
        const updateTag = (args: TagUpdateArgs) => db.tag.update(args);

        const tag = await upsertTag({
            where: { name: 't1' },
            create: { name: 't1', products: { create: { name: 'p1' } } },
            update: { name: 't2' },
        });
        expect(tag.name).toBe('t1');

        const updated = await updateTag({
            where: { id: tag.id },
            data: { name: 't3', products: { create: { name: 'p2' } } },
        });
        expect(updated.name).toBe('t3');
        await expect(db.product.count()).resolves.toBe(2);
    });
});
