import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Regression for #2633: writes to `@db.Time` / `@db.Timetz` columns failed
// with PG `22007 invalid input syntax for type time` because the dialect
// serialized JS Date values as ISO datetime strings. The dialect now reads
// the field's `@db.*` attribute and formats `HH:MM:SS.fff[+ZZ:ZZ]` for TIME
// / TIMETZ columns; other DateTime columns keep the existing ISO behaviour.
describe('Issue 2633 — write to @db.Time columns', () => {
    describe.each([
        { name: '@db.Time', dbType: '@db.Time(6)' },
        { name: '@db.Timetz', dbType: '@db.Timetz(6)' },
    ])('$name', ({ dbType }) => {
        const schema = `
model TradingHour {
    id    Int      @id @default(autoincrement())
    open  DateTime ${dbType}
    close DateTime ${dbType}
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

        it('accepts a Date for the open / close fields', async () => {
            const open = new Date('1970-01-01T09:00:00.000Z');
            const close = new Date('1970-01-01T16:30:00.000Z');

            const row = await client.tradingHour.create({ data: { open, close } });

            expect(row.id).toBeDefined();
        });

        it('round-trips the time-of-day via createMany', async () => {
            await client.tradingHour.createMany({
                data: [
                    { open: new Date('1970-01-01T09:00:00.000Z'), close: new Date('1970-01-01T16:00:00.000Z') },
                    { open: new Date('1970-01-01T10:30:00.000Z'), close: new Date('1970-01-01T17:30:00.000Z') },
                ],
            });

            const rows = await client.tradingHour.findMany({ orderBy: { id: 'asc' } });
            expect(rows).toHaveLength(2);
            // The application reads `tw.open` / `tw.close` as Date objects.
            expect(rows[0].open).toBeInstanceOf(Date);
            expect(rows[0].close).toBeInstanceOf(Date);
        });
    });
});
