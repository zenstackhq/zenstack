import { describe, expect, it } from 'vitest';
import { schema } from '../schemas/basic';
import { createTestClient } from '@zenstackhq/testtools';

describe('Client $diagnostics tests', () => {
    describe('without diagnostics option', () => {
        it('returns zod cache stats', async () => {
            const client = await createTestClient(schema);
            try {
                const diagnostics = await client.$diagnostics();
                expect(diagnostics.zodCache).toEqual({ size: 0, keys: [] });
            } finally {
                await client.$disconnect();
            }
        });

        it('returns zod cache stats after queries', async () => {
            const client = await createTestClient(schema);
            try {
                await client.user.create({ data: { email: 'u1@test.com' } });
                const diagnostics = await client.$diagnostics();
                expect(diagnostics.zodCache.size).toBeGreaterThan(0);
                expect(diagnostics.zodCache.keys.length).toBe(diagnostics.zodCache.size);
            } finally {
                await client.$disconnect();
            }
        });

        it('returns empty slow queries when diagnostics option is not set', async () => {
            const client = await createTestClient(schema);
            try {
                await client.user.create({ data: { email: 'u1@test.com' } });
                await client.user.findMany();
                const diagnostics = await client.$diagnostics();
                expect(diagnostics.slowQueries).toEqual([]);
            } finally {
                await client.$disconnect();
            }
        });
    });

    describe('with diagnostics option', () => {
        it('records slow queries when threshold is exceeded', async () => {
            const client = await createTestClient(schema, {
                diagnostics: { slowQueryThresholdMs: 0 },
            });
            try {
                await client.user.create({ data: { email: 'u1@test.com' } });
                await client.user.findMany();

                const diagnostics = await client.$diagnostics();
                expect(diagnostics.slowQueries.length).toBeGreaterThan(0);
                for (const query of diagnostics.slowQueries) {
                    expect(query.startedAt).toBeInstanceOf(Date);
                    expect(query.durationMs).toBeGreaterThanOrEqual(0);
                    expect(query.sql).toBeTruthy();
                }
            } finally {
                await client.$disconnect();
            }
        });

        it('does not record queries below threshold', async () => {
            const client = await createTestClient(schema, {
                diagnostics: { slowQueryThresholdMs: 999999 },
            });
            try {
                await client.user.create({ data: { email: 'u1@test.com' } });
                await client.user.findMany();

                const diagnostics = await client.$diagnostics();
                expect(diagnostics.slowQueries).toEqual([]);
            } finally {
                await client.$disconnect();
            }
        });

        it('returns a copy of slow queries', async () => {
            const client = await createTestClient(schema, {
                diagnostics: { slowQueryThresholdMs: 0 },
            });
            try {
                await client.user.create({ data: { email: 'u1@test.com' } });

                const diagnostics1 = await client.$diagnostics();
                const diagnostics2 = await client.$diagnostics();
                expect(diagnostics1.slowQueries).not.toBe(diagnostics2.slowQueries);
                expect(diagnostics1.slowQueries).toEqual(diagnostics2.slowQueries);
            } finally {
                await client.$disconnect();
            }
        });

        it('shares slow queries across derived clients', async () => {
            const client = await createTestClient(schema, {
                diagnostics: { slowQueryThresholdMs: 0 },
            });
            try {
                await client.user.create({ data: { email: 'u1@test.com' } });

                const derivedClient = client.$setAuth({ id: '1' });
                await derivedClient.user.findMany();

                // both clients should see the same slow queries
                const parentDiag = await client.$diagnostics();
                const derivedDiag = await derivedClient.$diagnostics();
                expect(parentDiag.slowQueries).toEqual(derivedDiag.slowQueries);
            } finally {
                await client.$disconnect();
            }
        });

        it('shares slow queries across transaction clients', async () => {
            const client = await createTestClient(schema, {
                diagnostics: { slowQueryThresholdMs: 0 },
            });
            try {
                await client.$transaction(async (tx) => {
                    await tx.user.create({ data: { email: 'u1@test.com' } });
                });

                const diagnostics = await client.$diagnostics();
                expect(diagnostics.slowQueries.length).toBeGreaterThan(0);
            } finally {
                await client.$disconnect();
            }
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
                for (let i = 0; i < 10; i++) {
                    await client.user.create({ data: { email: `u${i}@test.com` } });
                }

                const diagnostics = await client.$diagnostics();
                expect(diagnostics.slowQueries.length).toBeLessThanOrEqual(maxRecords);
            } finally {
                await client.$disconnect();
            }
        });

        it('accepts Infinity as slowQueryMaxRecords', async () => {
            const client = await createTestClient(schema, {
                diagnostics: {
                    slowQueryThresholdMs: 0,
                    slowQueryMaxRecords: Infinity,
                },
            });
            try {
                for (let i = 0; i < 5; i++) {
                    await client.user.create({ data: { email: `u${i}@test.com` } });
                }

                const diagnostics = await client.$diagnostics();
                expect(diagnostics.slowQueries.length).toBeGreaterThanOrEqual(5);
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
                for (const query of diagnostics.slowQueries) {
                    expect(query.startedAt).toBeInstanceOf(Date);
                    expect(query.durationMs).toBeGreaterThanOrEqual(0);
                    expect(query.sql).toBeTruthy();
                }
            } finally {
                await client.$disconnect();
            }
        });
    });
});
