import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, describe, expect, it } from 'vitest';

type LogEvent = { level: 'query' | 'error'; query: { sql: string } };

// https://github.com/zenstackhq/zenstack/issues/2355
describe('Regression for issue 2355', () => {
    const schema = `
model User {
    id    Int    @id @default(autoincrement())
    email String @unique
}
    `;

    let db: any;

    afterEach(async () => {
        await db?.$disconnect();
    });

    function collect() {
        const events: LogEvent[] = [];
        const log = (event: LogEvent) => {
            events.push(event);
        };
        return { events, log, queries: () => events.filter((e) => e.level === 'query').map((e) => e.query.sql) };
    }

    it('enables logging with $setOptions', async () => {
        db = await createTestClient(schema);
        const logger = collect();

        const client = db.$setOptions({ ...db.$options, log: logger.log });
        await client.user.findMany();

        expect(logger.queries().some((sql) => /select/i.test(sql))).toBe(true);
    });

    it('logs to the logger of the client that ran the query', async () => {
        const base = collect();
        db = await createTestClient(schema, { log: base.log });
        // ignore the queries run while setting up the test database
        base.events.length = 0;
        const derived = collect();
        const client = db.$setOptions({ ...db.$options, log: derived.log });

        await client.user.create({ data: { email: 'derived@test.com' } });
        expect(derived.queries().some((sql) => /insert/i.test(sql))).toBe(true);
        expect(base.events).toHaveLength(0);

        await db.user.count();
        expect(base.queries().some((sql) => /count/i.test(sql))).toBe(true);
        expect(derived.queries().some((sql) => /count/i.test(sql))).toBe(false);
    });

    it('disables logging with $setOptions', async () => {
        const base = collect();
        db = await createTestClient(schema, { log: base.log });
        // ignore the queries run while setting up the test database
        base.events.length = 0;

        const { log: _log, ...options } = db.$options;
        await db.$setOptions(options).user.findMany();

        expect(base.events).toHaveLength(0);
    });

    it('logs queries of transactions started from the derived client', async () => {
        db = await createTestClient(schema);
        const logger = collect();
        const client = db.$setOptions({ ...db.$options, log: logger.log });

        await client.$transaction(async (tx: any) => {
            await tx.user.create({ data: { email: 'tx@test.com' } });
        });

        expect(logger.queries().some((sql) => /insert/i.test(sql))).toBe(true);
    });

    it('logs failed queries of the derived client as errors', async () => {
        db = await createTestClient(schema);
        const logger = collect();
        const client = db.$setOptions({ ...db.$options, log: logger.log });

        await client.user.create({ data: { email: 'dup@test.com' } });
        // violates the unique constraint on `email`
        await expect(client.user.create({ data: { email: 'dup@test.com' } })).rejects.toThrow();

        expect(logger.events.some((e) => e.level === 'error')).toBe(true);
    });

    it('logs raw query builder queries of the derived client', async () => {
        db = await createTestClient(schema);
        const logger = collect();
        const client = db.$setOptions({ ...db.$options, log: logger.log });

        await client.$qbRaw.selectFrom('User').selectAll().execute();

        expect(logger.queries().some((sql) => /select/i.test(sql))).toBe(true);
    });

    it('logs concurrent queries to the logger of the client that ran them', async () => {
        const base = collect();
        db = await createTestClient(schema, { log: base.log });
        base.events.length = 0;
        const derived = collect();
        const client = db.$setOptions({ ...db.$options, log: derived.log });

        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                i % 2 === 0
                    ? db.user.create({ data: { email: `base${i}@test.com` } })
                    : client.user.create({ data: { email: `derived${i}@test.com` } }),
            ),
        );

        const params = (events: LogEvent[]) => events.flatMap((e) => (e.query as any).parameters ?? []).join(' ');
        expect(params(base.events)).not.toMatch(/derived/);
        expect(params(derived.events)).not.toMatch(/base/);
        expect(params(base.events)).toMatch(/base0/);
        expect(params(derived.events)).toMatch(/derived1/);
    });

    it('keeps the logger for clients derived without changing it', async () => {
        const base = collect();
        db = await createTestClient(schema, { log: base.log });
        base.events.length = 0;

        await db.$setAuth({ id: 1 }).user.findMany();
        expect(base.queries().some((sql) => /select/i.test(sql))).toBe(true);

        base.events.length = 0;
        await db.$transaction(async (tx: any) => {
            await tx.user.count();
        });
        expect(base.queries().some((sql) => /count/i.test(sql))).toBe(true);
    });
});
