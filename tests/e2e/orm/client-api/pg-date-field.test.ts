import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// This test verifies that plain date strings are accepted for DateTime fields.
describe('plain date string filter tests for DateTime fields', () => {
    const schema = `
model Event {
    id        Int      @id @default(autoincrement())
    name      String
    eventDate DateTime @db.Date
    createdAt DateTime @default(now())
}
    `;

    let client: any;

    beforeEach(async () => {
        client = await createTestClient(schema, {
            usePrismaPush: true,
            provider: 'postgresql',
        });
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('accepts a plain date string ("YYYY-MM-DD") in an equality filter on a @db.Date field', async () => {
        const filterSchema = client.$zod.makeFindManySchema('Event');
        const result = filterSchema.safeParse({ where: { eventDate: '2007-05-23' } });
        expect(result.success, `Expected plain date string to be accepted, got: ${JSON.stringify(result.error)}`).toBe(
            true,
        );
    });

    it('accepts an ISO datetime string in a filter on a @db.Date field', async () => {
        const filterSchema = client.$zod.makeFindManySchema('Event');
        const result = filterSchema.safeParse({ where: { eventDate: '2007-05-23T00:00:00.000Z' } });
        expect(result.success).toBe(true);
    });

    it('accepts a Date object in a filter on a @db.Date field', async () => {
        const filterSchema = client.$zod.makeFindManySchema('Event');
        const result = filterSchema.safeParse({ where: { eventDate: new Date('2007-05-23') } });
        expect(result.success).toBe(true);
    });

    it('rejects an invalid date string in a filter on a @db.Date field', async () => {
        const filterSchema = client.$zod.makeFindManySchema('Event');
        const result = filterSchema.safeParse({ where: { eventDate: 'not-a-date' } });
        expect(result.success).toBe(false);
    });

    it('filters records correctly using a plain date string', async () => {
        await client.event.create({ data: { name: 'Conference', eventDate: new Date('2007-05-23') } });
        await client.event.create({ data: { name: 'Workshop', eventDate: new Date('2024-01-15') } });

        const found = await client.event.findMany({ where: { eventDate: '2007-05-23' } });
        expect(found).toHaveLength(1);
        expect(found[0].name).toBe('Conference');
    });

    it('supports gt/lt filters with plain date strings on a @db.Date field', async () => {
        await client.event.create({ data: { name: 'Past', eventDate: new Date('2020-01-01') } });
        await client.event.create({ data: { name: 'Middle', eventDate: new Date('2024-01-01') } });
        await client.event.create({ data: { name: 'Future', eventDate: new Date('2030-01-01') } });

        const filterSchema = client.$zod.makeFindManySchema('Event');
        const result = filterSchema.safeParse({ where: { eventDate: { gt: '2025-01-01' } } });
        expect(result.success, `Expected gt filter to be accepted, got: ${JSON.stringify(result.error)}`).toBe(true);

        const lessThanResult = filterSchema.safeParse({ where: { eventDate: { lt: '2025-01-01' } } });
        expect(
            lessThanResult.success,
            `Expected lt filter to be accepted, got: ${JSON.stringify(lessThanResult.error)}`,
        ).toBe(true);

        const found = await client.event.findMany({ where: { eventDate: { gt: '2025-01-01' } } });
        expect(found).toHaveLength(1);
        expect(found[0].name).toBe('Future');

        const lessThanFound = await client.event.findMany({ where: { eventDate: { lt: '2025-01-01' } } });
        expect(lessThanFound).toHaveLength(2);
        expect(lessThanFound.map((item: { name: string }) => item.name).sort()).toEqual(['Middle', 'Past']);
    });

    it('accepts plain date strings in create and update payloads for @db.Date and non-@db.Date fields', async () => {
        const createSchema = client.$zod.makeCreateSchema('Event');
        const createResult = createSchema.safeParse({ data: { name: 'Conference', eventDate: '2007-05-23' } });
        expect(
            createResult.success,
            `Expected create payload for @db.Date field to be accepted, got: ${JSON.stringify(createResult.error)}`,
        ).toBe(true);

        const invalidCreateResult = createSchema.safeParse({ data: { name: 'Conference', createdAt: '2007-05-23' } });
        expect(invalidCreateResult.success).toBe(false);

        const created = await client.event.create({
            data: { name: 'Conference', eventDate: '2007-05-23', createdAt: '2007-05-23' },
        });
        expect(created.eventDate).toEqual(new Date('2007-05-23:00:00:00.000Z'));
        expect(created.createdAt).toEqual(new Date('2007-05-23:00:00:00.000Z'));

        const updateSchema = client.$zod.makeUpdateSchema('Event');
        const updateResult = updateSchema.safeParse({ where: { id: created.id }, data: { eventDate: '2008-05-23' } });
        expect(
            updateResult.success,
            `Expected update payload for @db.Date field to be accepted, got: ${JSON.stringify(updateResult.error)}`,
        ).toBe(true);

        const nonDbDateUpdateResult = updateSchema.safeParse({
            where: { id: created.id },
            data: { createdAt: '2008-05-23' },
        });
        expect(nonDbDateUpdateResult.success).toBe(true);

        const r = await client.event.update({
            where: { id: created.id },
            data: {
                // @db.Date
                eventDate: '2008-05-23',
                // non @db.Date
                createdAt: '2009-01-01',
            },
        });

        // both updates should result in correct UTC date time
        expect(r.eventDate).toEqual(new Date('2008-05-23:00:00:00.000Z'));
        expect(r.createdAt).toEqual(new Date('2009-01-01:00:00:00.000Z'));

        const updated = await client.event.findMany({ where: { id: created.id, eventDate: '2008-05-23' } });
        expect(updated).toHaveLength(1);
    });
});
