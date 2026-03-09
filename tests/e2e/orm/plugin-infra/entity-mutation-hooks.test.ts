import { type ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { DeleteQueryNode, InsertQueryNode, UpdateQueryNode } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/basic';

describe('Entity mutation hooks tests', () => {
    let _client: ClientContract<typeof schema>;

    beforeEach(async () => {
        _client = await createTestClient(schema);
    });

    afterEach(async () => {
        await _client?.$disconnect();
    });

    it('can intercept all mutations', async () => {
        const beforeCalled = { create: false, update: false, delete: false };
        const afterCalled = { create: false, update: false, delete: false };

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                beforeEntityMutation(args) {
                    beforeCalled[args.action] = true;
                    if (args.action === 'create') {
                        expect(InsertQueryNode.is(args.queryNode)).toBe(true);
                    }
                    if (args.action === 'update') {
                        expect(UpdateQueryNode.is(args.queryNode)).toBe(true);
                    }
                    if (args.action === 'delete') {
                        expect(DeleteQueryNode.is(args.queryNode)).toBe(true);
                    }
                },
                afterEntityMutation(args) {
                    afterCalled[args.action] = true;
                },
            },
        });

        const user = await client.user.create({
            data: { email: 'u1@test.com' },
        });
        await client.user.update({
            where: { id: user.id },
            data: { email: 'u2@test.com' },
        });
        await client.user.delete({ where: { id: user.id } });

        expect(beforeCalled).toEqual({
            create: true,
            update: true,
            delete: true,
        });
        expect(afterCalled).toEqual({
            create: true,
            update: true,
            delete: true,
        });
    });

    it('can intercept with loading before mutation entities', async () => {
        const queryIds = {
            update: { before: '', after: '' },
            delete: { before: '', after: '' },
        };

        let beforeMutationEntitiesInAfterHooks: Record<string, unknown>[] | undefined;

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                async beforeEntityMutation(args) {
                    if (args.action === 'update' || args.action === 'delete') {
                        await expect(args.loadBeforeMutationEntities()).resolves.toEqual([
                            expect.objectContaining({
                                email: args.action === 'update' ? 'u1@test.com' : 'u3@test.com',
                            }),
                        ]);
                        queryIds[args.action].before = args.queryId.queryId;
                    }
                },
                async afterEntityMutation(args) {
                    if (args.action === 'update' || args.action === 'delete') {
                        queryIds[args.action].after = args.queryId.queryId;
                    }

                    if (args.action === 'update') {
                        beforeMutationEntitiesInAfterHooks = args.beforeMutationEntities;
                    }
                },
            },
        });

        const user = await client.user.create({
            data: { email: 'u1@test.com' },
        });
        await client.user.create({
            data: { email: 'u2@test.com' },
        });

        await client.user.update({
            where: { id: user.id },
            data: { email: 'u3@test.com' },
        });
        // beforeMutationEntities in after hooks is available because we called loadBeforeMutationEntities in before hook
        expect(beforeMutationEntitiesInAfterHooks).toEqual([expect.objectContaining({ email: 'u1@test.com' })]);

        await client.user.delete({ where: { id: user.id } });

        expect(queryIds.update.before).toBeTruthy();
        expect(queryIds.delete.before).toBeTruthy();
        expect(queryIds.update.before).toBe(queryIds.update.after);
        expect(queryIds.delete.before).toBe(queryIds.delete.after);
    });

    it('can intercept with loading after mutation entities', async () => {
        let userCreateIntercepted = false;
        let userUpdateIntercepted = false;
        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                async afterEntityMutation(args) {
                    if (args.action === 'create' || args.action === 'update') {
                        if (args.action === 'create') {
                            userCreateIntercepted = true;
                        }
                        if (args.action === 'update') {
                            userUpdateIntercepted = true;
                        }
                        await expect(args.loadAfterMutationEntities()).resolves.toEqual(
                            expect.arrayContaining([
                                expect.objectContaining({
                                    email: args.action === 'create' ? 'u1@test.com' : 'u2@test.com',
                                }),
                            ]),
                        );
                    }
                },
            },
        });

        const user = await client.user.create({
            data: { email: 'u1@test.com' },
        });
        await client.user.update({
            where: { id: user.id },
            data: { email: 'u2@test.com' },
        });

        expect(userCreateIntercepted).toBe(true);
        expect(userUpdateIntercepted).toBe(true);
    });

    it('can intercept multi-entity mutations', async () => {
        let userCreateIntercepted = false;
        let userUpdateIntercepted = false;
        let userDeleteIntercepted = false;

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                async afterEntityMutation(args) {
                    if (args.action === 'create') {
                        userCreateIntercepted = true;
                        await expect(args.loadAfterMutationEntities()).resolves.toEqual(
                            expect.arrayContaining([
                                expect.objectContaining({ email: 'u1@test.com' }),
                                expect.objectContaining({ email: 'u2@test.com' }),
                            ]),
                        );
                    } else if (args.action === 'update') {
                        userUpdateIntercepted = true;
                        await expect(args.loadAfterMutationEntities()).resolves.toEqual(
                            expect.arrayContaining([
                                expect.objectContaining({
                                    email: 'u1@test.com',
                                    name: 'A user',
                                }),
                                expect.objectContaining({
                                    email: 'u2@test.com',
                                    name: 'A user',
                                }),
                            ]),
                        );
                    } else if (args.action === 'delete') {
                        userDeleteIntercepted = true;
                        await expect(args.loadAfterMutationEntities()).resolves.toEqual(
                            expect.arrayContaining([
                                expect.objectContaining({ email: 'u1@test.com' }),
                                expect.objectContaining({ email: 'u2@test.com' }),
                            ]),
                        );
                    }
                },
            },
        });

        await client.user.createMany({
            data: [{ email: 'u1@test.com' }, { email: 'u2@test.com' }],
        });
        await client.user.updateMany({
            data: { name: 'A user' },
        });

        expect(userCreateIntercepted).toBe(true);
        expect(userUpdateIntercepted).toBe(true);
        expect(userDeleteIntercepted).toBe(false);
    });

    it('can intercept nested mutations', async () => {
        let post1Intercepted = false;
        let post2Intercepted = false;
        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                async afterEntityMutation(args) {
                    if (args.action === 'create') {
                        if (args.model === 'Post') {
                            const afterEntities = await args.loadAfterMutationEntities();
                            if ((afterEntities![0] as any).title === 'Post1') {
                                post1Intercepted = true;
                            }
                            if ((afterEntities![0] as any).title === 'Post2') {
                                post2Intercepted = true;
                            }
                        }
                    }
                },
            },
        });

        const user = await client.user.create({
            data: {
                email: 'u1@test.com',
                posts: { create: { title: 'Post1' } },
            },
        });
        await client.user.update({
            where: { id: user.id },
            data: {
                email: 'u2@test.com',
                posts: { create: { title: 'Post2' } },
            },
        });

        expect(post1Intercepted).toBe(true);
        expect(post2Intercepted).toBe(true);
    });

    it('triggers multiple afterEntityMutation hooks for multiple mutations', async () => {
        const triggered: any[] = [];

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                async afterEntityMutation(args) {
                    triggered.push({
                        action: args.action,
                        model: args.model,
                        afterMutationEntities: await args.loadAfterMutationEntities(),
                    });
                },
            },
        });

        await client.$transaction(async (tx) => {
            await tx.user.create({
                data: { email: 'u1@test.com' },
            });
            await tx.user.update({
                where: { email: 'u1@test.com' },
                data: { email: 'u2@test.com' },
            });
            await tx.user.delete({ where: { email: 'u2@test.com' } });
        });

        expect(triggered).toEqual([
            expect.objectContaining({
                action: 'create',
                model: 'User',
                afterMutationEntities: [expect.objectContaining({ email: 'u1@test.com' })],
            }),
            expect.objectContaining({
                action: 'update',
                model: 'User',
                afterMutationEntities: [expect.objectContaining({ email: 'u2@test.com' })],
            }),
            expect.objectContaining({
                action: 'delete',
                model: 'User',
                afterMutationEntities: undefined,
            }),
        ]);
    });

    describe('Without outer transaction', () => {
        it('persists hooks db side effects when run out of tx', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    async beforeEntityMutation(ctx) {
                        await ctx.client.profile.create({
                            data: { bio: 'Bio1' },
                        });
                    },
                    async afterEntityMutation(ctx) {
                        intercepted = true;
                        await ctx.client.user.update({
                            where: { email: 'u1@test.com' },
                            data: { email: 'u2@test.com' },
                        });
                    },
                },
            });

            await client.user.create({
                data: { email: 'u1@test.com' },
            });
            expect(intercepted).toBe(true);
            // both the mutation and hook's side effect are persisted
            await expect(client.profile.findMany()).toResolveWithLength(1);
            await expect(client.user.findFirst()).resolves.toMatchObject({ email: 'u2@test.com' });
        });

        it('persists hooks db side effects when run within tx', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    runAfterMutationWithinTransaction: true,
                    async beforeEntityMutation(ctx) {
                        await ctx.client.profile.create({
                            data: { bio: 'Bio1' },
                        });
                    },
                    async afterEntityMutation(ctx) {
                        intercepted = true;
                        await ctx.client.user.update({
                            where: { email: 'u1@test.com' },
                            data: { email: 'u2@test.com' },
                        });
                    },
                },
            });

            await client.user.create({
                data: { email: 'u1@test.com' },
            });
            expect(intercepted).toBe(true);
            // both the mutation and hook's side effect are persisted
            await expect(client.profile.findMany()).toResolveWithLength(1);
            await expect(client.user.findFirst()).resolves.toMatchObject({ email: 'u2@test.com' });
        });

        it('fails the mutation if before mutation hook throws', async () => {
            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    async beforeEntityMutation() {
                        throw new Error('trigger failure');
                    },
                },
            });

            await expect(
                client.user.create({
                    data: { email: 'u1@test.com' },
                }),
            ).rejects.toThrow();

            // mutation is persisted
            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('does not affect the database operation if after mutation hook throws', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    async afterEntityMutation() {
                        intercepted = true;
                        throw new Error('trigger rollback');
                    },
                },
            });

            await client.user.create({
                data: { email: 'u1@test.com' },
            });

            expect(intercepted).toBe(true);
            // mutation is persisted
            await expect(client.user.findMany()).toResolveWithLength(1);
        });

        it('fails the entire transaction if specified to run inside the tx', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    runAfterMutationWithinTransaction: true,
                    async afterEntityMutation(ctx) {
                        intercepted = true;
                        await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                        throw new Error('trigger rollback');
                    },
                },
            });

            await expect(
                client.user.create({
                    data: { email: 'u1@test.com' },
                }),
            ).rejects.toThrow();

            expect(intercepted).toBe(true);
            // mutation is not persisted
            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('does not trigger afterEntityMutation hook if a transaction is rolled back', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    async afterEntityMutation(ctx) {
                        intercepted = true;
                        await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                    },
                },
            });

            try {
                await client.$transaction(async (tx) => {
                    await tx.user.create({
                        data: { email: 'u1@test.com' },
                    });
                    throw new Error('trigger rollback');
                });
            } catch {
                // noop
            }

            expect(intercepted).toBe(false);
            // neither the mutation nor the hook's side effect are persisted
            await expect(client.user.findMany()).toResolveWithLength(0);
        });

        it('triggers afterEntityMutation hook if a transaction is rolled back but hook runs within tx', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    runAfterMutationWithinTransaction: true,
                    async afterEntityMutation(ctx) {
                        intercepted = true;
                        await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                    },
                },
            });

            try {
                await client.$transaction(async (tx) => {
                    await tx.user.create({
                        data: { email: 'u1@test.com' },
                    });
                    throw new Error('trigger rollback');
                });
            } catch {
                // noop
            }

            expect(intercepted).toBe(true);
            // neither the mutation nor the hook's side effect are persisted
            await expect(client.user.findMany()).toResolveWithLength(0);
        });
    });

    describe('With outer transaction', () => {
        it('sees changes in the transaction prior to reading before mutation entities', async () => {
            let intercepted = false;
            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    async beforeEntityMutation(args) {
                        if (args.action === 'update') {
                            intercepted = true;
                            await expect(args.loadBeforeMutationEntities()).resolves.toEqual([
                                expect.objectContaining({ email: 'u1@test.com' }),
                            ]);
                        }
                    },
                },
            });

            await client.$transaction(async (tx) => {
                await tx.user.create({ data: { email: 'u1@test.com' } });
                await tx.user.update({
                    where: { email: 'u1@test.com' },
                    data: { email: 'u2@test.com' },
                });
            });

            expect(intercepted).toBe(true);
        });

        it('runs before mutation hook within the transaction', async () => {
            let intercepted = false;
            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    async beforeEntityMutation(ctx) {
                        intercepted = true;
                        await ctx.client.profile.create({
                            data: { bio: 'Bio1' },
                        });
                    },
                },
            });

            await expect(
                client.$transaction(async (tx) => {
                    await tx.user.create({
                        data: { email: 'u1@test.com' },
                    });
                    throw new Error('trigger rollback');
                }),
            ).rejects.toThrow();

            expect(intercepted).toBe(true);
            await expect(client.user.findMany()).toResolveWithLength(0);
            await expect(client.profile.findMany()).toResolveWithLength(0);
        });

        it('persists hooks db side effects when run out of tx', async () => {
            let intercepted = false;
            let txVisible = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    async beforeEntityMutation(ctx) {
                        const r = await ctx.client.user.findUnique({ where: { email: 'u1@test.com' } });
                        if (r) {
                            // second create
                            txVisible = true;
                        } else {
                            // first create
                            await ctx.client.profile.create({
                                data: { bio: 'Bio1' },
                            });
                        }
                    },
                    async afterEntityMutation(ctx) {
                        if (intercepted) {
                            return;
                        }
                        intercepted = true;
                        await ctx.client.user.update({
                            where: { email: 'u1@test.com' },
                            data: { email: 'u3@test.com' },
                        });
                    },
                },
            });

            await client.$transaction(async (tx) => {
                await tx.user.create({
                    data: { email: 'u1@test.com' },
                });
                await tx.user.create({
                    data: { email: 'u2@test.com' },
                });
            });

            expect(intercepted).toBe(true);
            expect(txVisible).toBe(true);

            // both the mutation and hook's side effect are persisted
            await expect(client.profile.findMany()).toResolveWithLength(1);
            await expect(client.user.findMany()).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ email: 'u2@test.com' }),
                    expect.objectContaining({ email: 'u3@test.com' }),
                ]),
            );
        });

        it('persists hooks db side effects when run within tx', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    runAfterMutationWithinTransaction: true,
                    async afterEntityMutation(ctx) {
                        if (intercepted) {
                            return;
                        }
                        intercepted = true;
                        await ctx.client.user.update({
                            where: { email: 'u1@test.com' },
                            data: { email: 'u3@test.com' },
                        });
                    },
                },
            });

            await client.$transaction(async (tx) => {
                await tx.user.create({
                    data: { email: 'u1@test.com' },
                });
                await tx.user.create({
                    data: { email: 'u2@test.com' },
                });
            });

            expect(intercepted).toBe(true);

            // both the mutation and hook's side effect are persisted
            await expect(client.user.findMany()).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ email: 'u2@test.com' }),
                    expect.objectContaining({ email: 'u3@test.com' }),
                ]),
            );
        });

        it('persists mutation when run out of tx and throws', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    async afterEntityMutation(ctx) {
                        intercepted = true;
                        await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                        throw new Error('trigger error');
                    },
                },
            });

            await client.$transaction(async (tx) => {
                await tx.user.create({
                    data: { email: 'u1@test.com' },
                });
            });

            expect(intercepted).toBe(true);

            // both the mutation and hook's side effect are persisted
            await expect(client.user.findMany()).toResolveWithLength(2);
        });

        it('rolls back mutation when run within tx and throws', async () => {
            let intercepted = false;

            const client = _client.$use({
                id: 'test',
                onEntityMutation: {
                    runAfterMutationWithinTransaction: true,
                    async afterEntityMutation(ctx) {
                        intercepted = true;
                        await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                        throw new Error('trigger error');
                    },
                },
            });

            await expect(
                client.$transaction(async (tx) => {
                    await tx.user.create({
                        data: { email: 'u1@test.com' },
                    });
                }),
            ).rejects.toThrow();

            expect(intercepted).toBe(true);

            // both the mutation and hook's side effect are rolled back
            await expect(client.user.findMany()).toResolveWithLength(0);
        });
    });
});

describe('Entity mutation hooks - delegate model interaction', () => {
    it('update on child model succeeds with afterEntityMutation plugin', async () => {
        console.log('RUNNING!!!!');
        const client = await createTestClient(
            `
model Base {
    id Int @id @default(autoincrement())
    orgId Int
    type String
    @@delegate(type)
}

model Child extends Base {
    childField Int
}
`,
        );

        const withPlugin = client.$use({
            id: 'test',
            onEntityMutation: {
                afterEntityMutation() {},
            },
        });

        const created = await withPlugin.child.create({
            data: { orgId: 1, childField: 10 },
        });

        const updated = await withPlugin.child.update({
            where: { id: created.id },
            data: { orgId: 2, childField: 20 },
        });

        expect(updated).toBeTruthy();
        expect(updated.orgId).toBe(2);
        expect(updated.childField).toBe(20);

        await client.$disconnect();
    });
});
