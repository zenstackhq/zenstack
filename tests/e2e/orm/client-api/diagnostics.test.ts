import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/basic';
import { createTestClient } from '@zenstackhq/testtools';

describe('Client $diagnostics tests', () => {
    describe('without diagnostics option', () => {
        let client: ClientContract<typeof schema>;

        beforeEach(async () => {
            client = await createTestClient(schema);
        });

        afterEach(async () => {
            await client?.$disconnect();
        });

        it('returns zod cache stats', async () => {
            const diagnostics = await client.$diagnostics();
            expect(diagnostics.zodCache).toEqual({ size: 0, keys: [] });
        });

        it('returns zod cache stats after queries', async () => {
            await client.user.create({ data: { email: 'u1@test.com' } });
            const diagnostics = await client.$diagnostics();
            expect(diagnostics.zodCache.size).toBeGreaterThan(0);
            expect(diagnostics.zodCache.keys.length).toBe(diagnostics.zodCache.size);
        });

        it('returns empty slow queries when diagnostics option is not set', async () => {
            await client.user.create({ data: { email: 'u1@test.com' } });
            await client.user.findMany();
            const diagnostics = await client.$diagnostics();
            expect(diagnostics.slowQueries).toEqual([]);
        });
    });

    describe('with diagnostics option', () => {
        let client: ClientContract<typeof schema>;

        beforeEach(async () => {
            client = await createTestClient(schema, {
                diagnostics: {
                    // threshold of 0ms ensures all queries are captured as "slow"
                    slowQueryThresholdMs: 0,
                },
            });
        });

        afterEach(async () => {
            await client?.$disconnect();
        });

        it('records slow queries when threshold is exceeded', async () => {
            await client.user.create({ data: { email: 'u1@test.com' } });
            await client.user.findMany();

            const diagnostics = await client.$diagnostics();
            expect(diagnostics.slowQueries.length).toBeGreaterThan(0);
            for (const query of diagnostics.slowQueries) {
                expect(query.durationMs).toBeGreaterThanOrEqual(0);
                expect(query.sql).toBeTruthy();
            }
        });

        it('does not record queries below threshold', async () => {
            const fastClient = await createTestClient(schema, {
                diagnostics: {
                    // very high threshold to ensure no queries are captured
                    slowQueryThresholdMs: 999999,
                },
            });

            try {
                await fastClient.user.create({ data: { email: 'u1@test.com' } });
                await fastClient.user.findMany();

                const diagnostics = await fastClient.$diagnostics();
                expect(diagnostics.slowQueries).toEqual([]);
            } finally {
                await fastClient.$disconnect();
            }
        });

        it('returns a copy of slow queries', async () => {
            await client.user.create({ data: { email: 'u1@test.com' } });

            const diagnostics1 = await client.$diagnostics();
            const diagnostics2 = await client.$diagnostics();
            expect(diagnostics1.slowQueries).not.toBe(diagnostics2.slowQueries);
            expect(diagnostics1.slowQueries).toEqual(diagnostics2.slowQueries);
        });

        it('shares slow queries across derived clients', async () => {
            await client.user.create({ data: { email: 'u1@test.com' } });

            const derivedClient = client.$setAuth({ id: '1' });
            await derivedClient.user.findMany();

            // both clients should see the same slow queries
            const parentDiag = await client.$diagnostics();
            const derivedDiag = await derivedClient.$diagnostics();
            expect(parentDiag.slowQueries).toEqual(derivedDiag.slowQueries);
        });

        it('shares slow queries across transaction clients', async () => {
            await client.$transaction(async (tx) => {
                await tx.user.create({ data: { email: 'u1@test.com' } });
            });

            const diagnostics = await client.$diagnostics();
            expect(diagnostics.slowQueries.length).toBeGreaterThan(0);
        });
    });

    describe('slowQueryMaxRecords', () => {
        it('limits the number of slow query records', async () => {
            const maxRecords = 3;
            const client = await createTestClient(schema, {
                diagnostics: {
                    slowQueryThresholdMs: 0,
                    slowQueryMaxRecords: maxRecords,
                },
            });

            try {
                // create enough queries to exceed the limit
                for (let i = 0; i < 10; i++) {
                    await client.user.create({ data: { email: `u${i}@test.com` } });
                }

                const diagnostics = await client.$diagnostics();
                expect(diagnostics.slowQueries.length).toBeLessThanOrEqual(maxRecords);
            } finally {
                await client.$disconnect();
            }
        });

        it('keeps the slowest queries when limit is exceeded', async () => {
            const maxRecords = 2;
            const client = await createTestClient(schema, {
                diagnostics: {
                    slowQueryThresholdMs: 0,
                    slowQueryMaxRecords: maxRecords,
                },
            });

            try {
                for (let i = 0; i < 5; i++) {
                    await client.user.create({ data: { email: `u${i}@test.com` } });
                }

                const diagnostics = await client.$diagnostics();
                expect(diagnostics.slowQueries.length).toBeLessThanOrEqual(maxRecords);
                // all entries should have valid data
                for (const query of diagnostics.slowQueries) {
                    expect(query.durationMs).toBeGreaterThanOrEqual(0);
                    expect(query.sql).toBeTruthy();
                }
            } finally {
                await client.$disconnect();
            }
        });
    });
});
