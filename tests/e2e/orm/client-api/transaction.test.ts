import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/basic';
import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import { createTestClient } from '@zenstackhq/testtools';

describe('Client raw query tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    describe('interactive transaction', () => {
        it('works with simple successful transaction', async () => {
            const users = await client.$transaction(async (tx) => {
                const u1 = await tx.user.create({
                    data: {
                        email: 'u1@test.com',
                    },
                });
                const u2 = await tx.user.create({
                    data: {
                        email: 'u2@test.com',
                    },
                });
                return [u1, u2];
            });

            expect(users).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ email: 'u1@test.com' }),
                    expect.objectContaining({ email: 'u2@test.com' }),
                ]),
            );

            await expect(client.user.findMany()).toResolveWithLength(2);
        });

        it('works with simple failed transaction', async () => {
            await expect(
                client.$transaction(async (tx) => {
                    const u1 = await tx.user.create({
                        data: {
                            email: 'u1@test.com',
                        },
                    });
                    const u2 = await tx.user.create({
                        data: {
                            email: 'u1@test.com',
                        },
                    });
                    return [u1, u2];
                }),
            ).rejects.toThrow();

            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('works with nested successful transactions', async () => {
            await client.$transaction(async (tx) => {
                const u1 = await tx.user.create({
                    data: {
                        email: 'u1@test.com',
                    },
                });
                const u2 = await (tx as any).$transaction((tx2: any) =>
                    tx2.user.create({
                        data: {
                            email: 'u2@test.com',
                        },
                    }),
                );
                return [u1, u2];
            });

            await expect(client.user.findMany()).toResolveWithLength(2);
        });

        it('works with nested failed transaction', async () => {
            await expect(
                client.$transaction(async (tx) => {
                    const u1 = await tx.user.create({
                        data: {
                            email: 'u1@test.com',
                        },
                    });
                    const u2 = await (tx as any).$transaction((tx2: any) =>
                        tx2.user.create({
                            data: {
                                email: 'u1@test.com',
                            },
                        }),
                    );
                    return [u1, u2];
                }),
            ).rejects.toThrow();

            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('$unuseAll preserves transaction isolation', async () => {
            await expect(
                client.$transaction(async (tx) => {
                    await tx.$unuseAll().user.create({
                        data: { email: 'u1@test.com' },
                    });
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('$unuse preserves transaction isolation', async () => {
            await expect(
                client.$transaction(async (tx) => {
                    await tx.$unuse('nonexistent').user.create({
                        data: { email: 'u1@test.com' },
                    });
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('$use preserves transaction isolation', async () => {
            await expect(
                client.$transaction(async (tx) => {
                    await (tx as any)
                        .$use({
                            id: 'noop',
                            onQuery: async ({
                                args,
                                proceed,
                            }: {
                                args: unknown;
                                proceed: (args: unknown) => Promise<unknown>;
                            }) => proceed(args),
                        })
                        .user.create({
                            data: { email: 'u1@test.com' },
                        });
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('$setAuth preserves transaction isolation', async () => {
            await expect(
                client.$transaction(async (tx) => {
                    await tx.$setAuth(undefined).user.create({
                        data: { email: 'u1@test.com' },
                    });
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('$setOptions preserves transaction isolation', async () => {
            await expect(
                client.$transaction(async (tx) => {
                    await (tx as any).$setOptions((tx as any).$options).user.create({
                        data: { email: 'u1@test.com' },
                    });
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('$unuse removes a kysely-level plugin from the derived transaction client', async () => {
            const db = client.$use(new PolicyPlugin());
            await expect(
                db.$transaction(async (tx) => {
                    const unchecked = tx.$unuse('policy');
                    await expect(unchecked.user.create({ data: { email: 'u1@test.com' } })).toResolveTruthy();
                    await expect(unchecked.user.count()).resolves.toBe(1);
                    await expect(tx.user.create({ data: { email: 'u2@test.com' } })).toBeRejectedByPolicy();
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('$setAuth evaluates policies with the new auth inside the transaction', async () => {
            const db = client.$use(new PolicyPlugin());
            await db.$setAuth({ id: 'u1' }).$transaction(async (tx) => {
                const asU2 = tx.$setAuth({ id: 'u2' });
                await expect(asU2.user.create({ data: { id: 'u2', email: 'u2@test.com' } })).toResolveTruthy();
                await expect(asU2.user.create({ data: { id: 'u1', email: 'u1@test.com' } })).toBeRejectedByPolicy();
                await expect(tx.user.create({ data: { id: 'u1', email: 'u1@test.com' } })).toResolveTruthy();
            });

            await expect(client.user.findMany()).toResolveWithLength(2);
        });

        it('$use installs kysely-level and entity mutation hooks on the derived transaction client', async () => {
            const calls: string[] = [];
            await client.$transaction(async (tx) => {
                await tx
                    .$use({
                        id: 'recorder',
                        onKyselyQuery: ({ query, proceed }) => {
                            if (query.kind === 'InsertQueryNode') {
                                calls.push(query.kind);
                            }
                            return proceed(query);
                        },
                        onEntityMutation: {
                            $all: {
                                beforeEntityMutation: ({ action }) => {
                                    calls.push(action);
                                },
                            },
                        },
                    })
                    .user.create({ data: { email: 'u1@test.com' } });
                await tx.user.create({ data: { email: 'u2@test.com' } });
            });

            expect(calls).toEqual(['InsertQueryNode', 'create']);
        });
    });

    describe('sequential transaction', () => {
        it('works with empty array', async () => {
            const users = await client.$transaction([]);
            expect(users).toEqual([]);
        });

        it('does not execute promises directly', async () => {
            const promises = [
                client.user.create({ data: { email: 'u1@test.com' } }),
                client.user.create({ data: { email: 'u2@test.com' } }),
            ];
            await expect(client.user.findMany()).toResolveWithLength(0);
            await client.$transaction(promises);
            await expect(client.user.findMany()).toResolveWithLength(2);
        });

        it('works with simple successful transaction', async () => {
            const users = await client.$transaction([
                client.user.create({ data: { email: 'u1@test.com' } }),
                client.user.create({ data: { email: 'u2@test.com' } }),
                client.user.count(),
            ]);
            expect(users).toEqual([
                expect.objectContaining({ email: 'u1@test.com' }),
                expect.objectContaining({ email: 'u2@test.com' }),
                2,
            ]);
        });

        it('preserves execution order', async () => {
            const users = await client.$transaction([
                client.user.create({ data: { id: '1', email: 'u1@test.com' } }),
                client.user.update({ where: { id: '1' }, data: { email: 'u2@test.com' } }),
            ]);
            expect(users).toEqual([
                expect.objectContaining({ email: 'u1@test.com' }),
                expect.objectContaining({ email: 'u2@test.com' }),
            ]);
        });

        it('rolls back on error', async () => {
            await expect(
                client.$transaction([
                    client.user.create({ data: { id: '1', email: 'u1@test.com' } }),
                    client.user.create({ data: { id: '1', email: 'u2@test.com' } }),
                ]),
            ).rejects.toThrow();
            await expect(client.user.findMany()).toResolveWithLength(0);
        });
    });
});
