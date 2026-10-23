import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import Decimal from 'decimal.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/custom-type-primitive-output/schema';

const seenAt = new Date('2026-01-02T03:04:05.000Z');

const itemData = {
    label: 'hello',
    active: true,
    quantity: 3,
    ratio: 1.5,
    views: 12345678901234n,
    price: new Decimal('19.99'),
    seenAt,
    payload: new Uint8Array([1, 2, 3]),
    meta: { a: 1, tags: ['x'] },
};

// asserts that each primitive type def field is returned in its base type's runtime representation
function expectConverted(item: Record<string, unknown>, { withPayload = true } = {}) {
    expect(item['label']).toBe('hello');
    expect(item['active']).toBe(true);
    expect(item['quantity']).toBe(3);
    expect(item['ratio']).toBe(1.5);
    expect(item['views']).toBe(12345678901234n);
    expect(Decimal.isDecimal(item['price'])).toBe(true);
    expect((item['price'] as Decimal).toString()).toBe('19.99');
    expect(item['seenAt']).toBeInstanceOf(Date);
    expect((item['seenAt'] as Date).toISOString()).toBe(seenAt.toISOString());
    if (withPayload) {
        expect(item['payload']).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(item['payload'])).toBe(false);
        expect(Array.from(item['payload'] as Uint8Array)).toEqual([1, 2, 3]);
    }
    expect(item['meta']).toEqual({ a: 1, tags: ['x'] });
    expect(item['note']).toBeNull();
}

describe('Custom type primitive output conversion tests', () => {
    let client: ClientContract<typeof schema>;
    let ownerId: number;

    beforeEach(async () => {
        client = await createTestClient(schema);
        const owner = await client.owner.create({ data: {} });
        ownerId = owner.id;
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('converts fields returned from create', async () => {
        const item = await client.item.create({ data: { ...itemData, ownerId } });
        expectConverted(item);
    });

    it('converts fields on direct reads', async () => {
        const { id } = await client.item.create({ data: { ...itemData, ownerId } });

        expectConverted(await client.item.findUniqueOrThrow({ where: { id } }));

        const [item] = await client.item.findMany();
        expectConverted(item!);

        const selected = await client.item.findFirstOrThrow({ select: { views: true, price: true, active: true } });
        expect(selected.views).toBe(12345678901234n);
        expect(Decimal.isDecimal(selected.price)).toBe(true);
        expect(selected.active).toBe(true);
    });

    it('converts fields of nested relations', async () => {
        await client.item.create({ data: { ...itemData, ownerId } });

        // SQLite can't put BLOB values into the JSON it builds for nested relations (same for plain `Bytes`)
        const withPayload = client.$schema.provider.type !== 'sqlite';
        const omit = { payload: !withPayload };

        const owner = await client.owner.findUniqueOrThrow({ where: { id: ownerId }, include: { items: { omit } } });
        expectConverted(owner.items[0]!, { withPayload });

        const selected = await client.owner.findUniqueOrThrow({
            where: { id: ownerId },
            select: {
                items: { select: { views: true, price: true, seenAt: true, payload: withPayload, active: true } },
            },
        });
        expect(selected.items[0]!.views).toBe(12345678901234n);
        expect(Decimal.isDecimal(selected.items[0]!.price)).toBe(true);
        expect(selected.items[0]!.seenAt).toBeInstanceOf(Date);
        expect(selected.items[0]!.active).toBe(true);
        if (withPayload) {
            expect(Buffer.isBuffer(selected.items[0]!.payload)).toBe(false);
            expect(Array.from(selected.items[0]!.payload as Uint8Array)).toEqual([1, 2, 3]);
        }

        const item = await client.item.findFirstOrThrow({ include: { owner: { include: { items: { omit } } } } });
        expectConverted(item);
        expectConverted(item.owner.items[0]!, { withPayload });
    });

    it('converts fields returned from update', async () => {
        const { id } = await client.item.create({ data: { ...itemData, ownerId } });
        const updated = await client.item.update({ where: { id }, data: { quantity: 4 } });
        expectConverted({ ...updated, quantity: 3 });
        expect(updated.quantity).toBe(4);
    });
});
