import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Regression for #2631: ZenStack 3.5+ replaced Prisma's permissive
// datetime input coercion with a strict zod union, breaking every caller
// that passed ISO strings to `DateTime` fields. The default behaviour now
// coerces strings; `ClientOptions.strictDateInput: true` opts back in to
// the strict semantics.
describe('Issue 2631 — strictDateInput option', () => {
    const schema = `
model Event {
    id      Int      @id @default(autoincrement())
    label   String
    when    DateTime
}
    `;

    describe('default (strictDateInput unset / false)', () => {
        let db: any;

        beforeEach(async () => {
            db = await createTestClient(schema, { usePrismaPush: true, provider: 'sqlite' });
        });
        afterEach(async () => db?.$disconnect());

        it('accepts a Date object', async () => {
            const e = await db.event.create({ data: { label: 'date', when: new Date('2024-01-15T10:30:00Z') } });
            expect(e.when).toBeInstanceOf(Date);
        });

        it('accepts an ISO datetime string and coerces to Date', async () => {
            const e = await db.event.create({ data: { label: 'iso', when: '2024-01-15T10:30:00.000Z' } });
            expect(e.when).toBeInstanceOf(Date);
        });

        it('accepts an ISO date string and coerces to Date', async () => {
            const e = await db.event.create({ data: { label: 'date-only', when: '2024-01-15' } });
            expect(e.when).toBeInstanceOf(Date);
        });

        it('accepts a bare time-only string anchored to the Unix epoch', async () => {
            const e = await db.event.create({ data: { label: 'time-only', when: '09:30:00' } });
            expect(e.when).toBeInstanceOf(Date);
            expect((e.when as Date).getUTCHours()).toBe(9);
            expect((e.when as Date).getUTCMinutes()).toBe(30);
        });

        it('rejects a non-parseable string', async () => {
            await expect(db.event.create({ data: { label: 'junk', when: 'not-a-date' as any } })).rejects.toThrow();
        });
    });

    describe('strictDateInput: true', () => {
        let db: any;

        beforeEach(async () => {
            db = await createTestClient(schema, { usePrismaPush: true, provider: 'sqlite', strictDateInput: true });
        });
        afterEach(async () => db?.$disconnect());

        it('accepts a Date object', async () => {
            const e = await db.event.create({ data: { label: 'date', when: new Date('2024-01-15T10:30:00Z') } });
            expect(e.when).toBeInstanceOf(Date);
        });

        it('rejects an ISO datetime string', async () => {
            await expect(db.event.create({ data: { label: 'iso', when: '2024-01-15T10:30:00.000Z' as any } })).rejects.toThrow();
        });

        it('rejects an ISO date string', async () => {
            await expect(db.event.create({ data: { label: 'date-only', when: '2024-01-15' as any } })).rejects.toThrow();
        });

        it('rejects a bare time-only string', async () => {
            await expect(db.event.create({ data: { label: 'time-only', when: '09:30:00' as any } })).rejects.toThrow();
        });
    });
});
