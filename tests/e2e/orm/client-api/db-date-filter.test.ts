import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @db.Date maps to PostgreSQL's `date` type (date-only, no time component).
// ZenStack's Zod filter schema used to reject plain date strings like "2024-01-15"
// because it only accepted full ISO datetimes. This test verifies the fix.
describe('@db.Date filter tests for postgres', () => {
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
        await client.event.create({ data: { name: 'Future', eventDate: new Date('2030-01-01') } });

        const filterSchema = client.$zod.makeFindManySchema('Event');
        const result = filterSchema.safeParse({ where: { eventDate: { gt: '2025-01-01' } } });
        expect(result.success, `Expected gt filter to be accepted, got: ${JSON.stringify(result.error)}`).toBe(true);

        const found = await client.event.findMany({ where: { eventDate: { gt: '2025-01-01' } } });
        expect(found).toHaveLength(1);
        expect(found[0].name).toBe('Future');
    });

    it('plain date string is rejected on a regular DateTime field (no @db.Date)', async () => {
        // createdAt is a regular DateTime — plain date strings should not be accepted
        const filterSchema = client.$zod.makeFindManySchema('Event');
        const result = filterSchema.safeParse({ where: { createdAt: '2007-05-23' } });
        expect(result.success).toBe(false);
    });
});
