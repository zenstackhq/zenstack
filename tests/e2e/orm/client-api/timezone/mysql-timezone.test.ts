import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Timezone handling tests for mysql', () => {
    // Regression for https://github.com/zenstackhq/zenstack/issues/2589 —
    // `@db.Time` values were returned as raw strings / Invalid Date because
    // `new Date("09:30:00Z")` can't parse a bare time string.
    describe('@db.Time fields', () => {
        const schema = `
model Exchange {
    id             Int                     @id @default(autoincrement())
    name           String
    tradingWindows ExchangeTradingWindow[]
}

model ExchangeTradingWindow {
    id          Int      @id @default(autoincrement())
    exchangeId  Int
    exchange    Exchange @relation(fields: [exchangeId], references: [id], onDelete: Cascade)
    open        DateTime @db.Time(6)
    close       DateTime @db.Time(6)
}
        `;

        let client: any;

        beforeEach(async () => {
            client = await createTestClient(schema, {
                usePrismaPush: true,
                provider: 'mysql',
            });
        });

        afterEach(async () => {
            await client?.$disconnect();
        });

        it('returns @db.Time fields as Date via nested include', async () => {
            const exchange = await client.exchange.create({ data: { name: 'NYSE' } });

            await client.$qb
                .insertInto('ExchangeTradingWindow')
                .values({
                    exchangeId: exchange.id,
                    open: '09:30:00',
                    close: '16:00:00',
                })
                .execute();

            const result = await client.exchange.findUnique({
                where: { id: exchange.id },
                include: { tradingWindows: true },
            });

            expect(result.tradingWindows).toHaveLength(1);
            const win = result.tradingWindows[0];

            expect(win.open).toBeInstanceOf(Date);
            expect(win.open.toISOString()).toBe('1970-01-01T09:30:00.000Z');
            expect(win.close).toBeInstanceOf(Date);
            expect(win.close.toISOString()).toBe('1970-01-01T16:00:00.000Z');
        });

        it('returns @db.Time fields as Date on a direct select', async () => {
            const exchange = await client.exchange.create({ data: { name: 'NYSE' } });

            await client.$qb
                .insertInto('ExchangeTradingWindow')
                .values({
                    exchangeId: exchange.id,
                    open: '09:30:00',
                    close: '16:00:00',
                })
                .execute();

            const windows = await client.exchangeTradingWindow.findMany({
                where: { exchangeId: exchange.id },
            });

            expect(windows).toHaveLength(1);
            expect(windows[0].open).toBeInstanceOf(Date);
            expect(windows[0].open.toISOString()).toBe('1970-01-01T09:30:00.000Z');
            expect(windows[0].close).toBeInstanceOf(Date);
        });
    });
});
