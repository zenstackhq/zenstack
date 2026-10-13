import { type ClientContract, type MutationHookEntity } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { DeleteQueryNode, InsertQueryNode, UpdateQueryNode } from 'kysely';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { schema } from '../schemas/basic';
import { schema as delegateSchemaTyped } from '../schemas/delegate/schema';
import { schema as typingSchema } from '../schemas/typing/schema';

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
                $all: {
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
                $all: {
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
                $all: {
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
                $all: {
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
                $all: {
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
                $all: {
                    async afterEntityMutation(args) {
                        triggered.push({
                            action: args.action,
                            model: args.model,
                            afterMutationEntities: await args.loadAfterMutationEntities(),
                        });
                    },
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
                    $all: {
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
                    $all: {
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
                    $all: {
                        async beforeEntityMutation() {
                            throw new Error('trigger failure');
                        },
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
                    $all: {
                        async afterEntityMutation() {
                            intercepted = true;
                            throw new Error('trigger rollback');
                        },
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
                    $all: {
                        runAfterMutationWithinTransaction: true,
                        async afterEntityMutation(ctx) {
                            intercepted = true;
                            await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                            throw new Error('trigger rollback');
                        },
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
                    $all: {
                        async afterEntityMutation(ctx) {
                            intercepted = true;
                            await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                        },
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
                    $all: {
                        runAfterMutationWithinTransaction: true,
                        async afterEntityMutation(ctx) {
                            intercepted = true;
                            await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                        },
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
                    $all: {
                        async beforeEntityMutation(args) {
                            if (args.action === 'update') {
                                intercepted = true;
                                await expect(args.loadBeforeMutationEntities()).resolves.toEqual([
                                    expect.objectContaining({ email: 'u1@test.com' }),
                                ]);
                            }
                        },
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
                    $all: {
                        async beforeEntityMutation(ctx) {
                            intercepted = true;
                            await ctx.client.profile.create({
                                data: { bio: 'Bio1' },
                            });
                        },
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
                    $all: {
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
                    $all: {
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
                    $all: {
                        async afterEntityMutation(ctx) {
                            intercepted = true;
                            await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                            throw new Error('trigger error');
                        },
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
                    $all: {
                        runAfterMutationWithinTransaction: true,
                        async afterEntityMutation(ctx) {
                            intercepted = true;
                            await ctx.client.user.create({ data: { email: 'u2@test.com' } });
                            throw new Error('trigger error');
                        },
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

    it('can use per-model hooks with typed entities', async () => {
        let userBeforeEntities: any;
        let postBeforeEntities: any;
        let userAfterEntities: any;
        let postAfterEntities: any;

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                User: {
                    async beforeEntityMutation(args) {
                        expect(args.model).toBe('User');
                        userBeforeEntities = await args.loadBeforeMutationEntities();
                    },
                    async afterEntityMutation(args) {
                        expect(args.model).toBe('User');
                        userAfterEntities = await args.loadAfterMutationEntities();
                    },
                },
                Post: {
                    async beforeEntityMutation(args) {
                        expect(args.model).toBe('Post');
                        postBeforeEntities = await args.loadBeforeMutationEntities();
                    },
                    async afterEntityMutation(args) {
                        expect(args.model).toBe('Post');
                        postAfterEntities = await args.loadAfterMutationEntities();
                    },
                },
            },
        });

        const user = await client.user.create({
            data: { email: 'u1@test.com' },
        });

        // User after hook should have fired, Post hooks should not
        expect(userAfterEntities).toEqual([expect.objectContaining({ email: 'u1@test.com' })]);
        expect(postAfterEntities).toBeUndefined();

        await client.user.update({
            where: { id: user.id },
            data: { email: 'u2@test.com' },
        });

        // User before hook should have captured old entity
        expect(userBeforeEntities).toEqual([expect.objectContaining({ email: 'u1@test.com' })]);
        // User after hook should have captured new entity
        expect(userAfterEntities).toEqual([expect.objectContaining({ email: 'u2@test.com' })]);
        // Post hooks still untouched
        expect(postBeforeEntities).toBeUndefined();
    });

    it('can combine per-model and catch-all hooks', async () => {
        const catchAllModels: string[] = [];
        const perModelModels: string[] = [];

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                $all: {
                    afterEntityMutation(args) {
                        catchAllModels.push(args.model);
                    },
                },
                User: {
                    afterEntityMutation(args) {
                        perModelModels.push(args.model);
                    },
                },
            },
        });

        await client.user.create({
            data: { email: 'u1@test.com', posts: { create: { title: 'Post1' } } },
        });

        // catch-all fires for both User and Post
        expect(catchAllModels).toContain('User');
        expect(catchAllModels).toContain('Post');

        // per-model fires only for User
        expect(perModelModels).toEqual(['User']);
    });

    it('per-model hooks provide beforeMutationEntities in after hook', async () => {
        let beforeEntitiesInAfterHook: any;

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                User: {
                    async beforeEntityMutation(args) {
                        await args.loadBeforeMutationEntities();
                    },
                    async afterEntityMutation(args) {
                        beforeEntitiesInAfterHook = args.beforeMutationEntities;
                    },
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

        expect(beforeEntitiesInAfterHook).toEqual([expect.objectContaining({ email: 'u1@test.com' })]);
    });

    it('per-model hooks infer correct entity types', async () => {
        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                User: {
                    async afterEntityMutation(args) {
                        const entities = await args.loadAfterMutationEntities();
                        if (entities) {
                            const entity = entities[0];
                            expect(entity).toBeDefined();
                            if (!entity) {
                                return;
                            }
                            // This access compiles without casts because entity is a User
                            const _email: string = entity.email;
                            expect(_email).toBeTruthy();
                        }
                    },
                },
            },
        });

        await client.user.create({
            data: { email: 'u1@test.com' },
        });
    });

    it('after-mutation entities match $qb rows', async () => {
        let postEntity: any;
        let userEntity: any;

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                Post: {
                    async afterEntityMutation(args) {
                        const entities = await args.loadAfterMutationEntities();
                        postEntity = entities?.[0];
                        // entity type must be identical to a `$qb` selectAll row
                        expectTypeOf(entities!).items.toEqualTypeOf<Awaited<ReturnType<typeof qbPostQuery>>>();
                    },
                },
                User: {
                    async afterEntityMutation(args) {
                        const entities = await args.loadAfterMutationEntities();
                        userEntity = entities?.[0];
                    },
                },
            },
        });

        const qbPostQuery = () => client.$qb.selectFrom('Post').selectAll().executeTakeFirstOrThrow();

        const user = await client.user.create({
            data: {
                email: 'u1@test.com',
                meta: { foo: 'bar' },
                posts: { create: { title: 'P1', published: true } },
            },
        });

        const qbPost = await client.$qb
            .selectFrom('Post')
            .selectAll()
            .where('authorId', '=', user.id)
            .executeTakeFirstOrThrow();
        const qbUser = await client.$qb
            .selectFrom('User')
            .selectAll()
            .where('id', '=', user.id)
            .executeTakeFirstOrThrow();

        expect(postEntity).toEqual(qbPost);
        expect(userEntity).toEqual(qbUser);
    });

    it('before-mutation entities match $qb rows', async () => {
        let beforeEntity: any;
        let beforeEntityInAfterHook: any;

        const client = _client.$use({
            id: 'test',
            onEntityMutation: {
                Post: {
                    async beforeEntityMutation(args) {
                        beforeEntity = (await args.loadBeforeMutationEntities())?.[0];
                    },
                    afterEntityMutation(args) {
                        beforeEntityInAfterHook = args.beforeMutationEntities?.[0];
                    },
                },
            },
        });

        const user = await client.user.create({ data: { email: 'u1@test.com' } });
        const post = await client.post.create({ data: { title: 'P1', published: true, authorId: user.id } });
        const qbPostBefore = await client.$qb
            .selectFrom('Post')
            .selectAll()
            .where('id', '=', post.id)
            .executeTakeFirstOrThrow();

        await client.post.update({ where: { id: post.id }, data: { title: 'P2' } });

        expect(beforeEntity).toEqual(qbPostBefore);
        expect(beforeEntityInAfterHook).toEqual(qbPostBefore);
    });

    it('supports legacy-shaped onEntityMutation (hooks directly under onEntityMutation) with a warning', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const calls: string[] = [];
            let thisArg: unknown;
            const legacy = {
                id: 'legacy',
                beforeEntityMutation(args: any) {
                    calls.push(`before:${args.model}:${args.action}`);
                },
                onEntityMutation: {
                    beforeEntityMutation(this: any, args: any) {
                        thisArg = this;
                        calls.push(`before:${args.model}:${args.action}`);
                    },
                    afterEntityMutation(args: any) {
                        calls.push(`after:${args.model}:${args.action}`);
                    },
                    runAfterMutationWithinTransaction: true,
                },
            };

            const client = _client.$use(legacy as any);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0]![0]).toContain('deprecated');

            await client.user.create({ data: { email: 'u1@test.com' } });
            expect(calls).toEqual(['before:User:create', 'after:User:create']);
            // `this` is the plugin object
            expect(thisArg).toBe(legacy);

            // derived clients (e.g., transactions) should not warn again
            await client.$transaction(async (tx) => {
                await tx.user.create({ data: { email: 'u2@test.com' } });
            });
            expect(warn).toHaveBeenCalledTimes(1);
            expect(calls).toContain('after:User:create');
        } finally {
            warn.mockRestore();
        }
    });

    it('explicit $all takes precedence over legacy keys when both are present', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const calls: string[] = [];
            const client = _client.$use({
                id: 'mixed',
                onEntityMutation: {
                    afterEntityMutation() {
                        calls.push('legacy');
                    },
                    $all: {
                        afterEntityMutation() {
                            calls.push('$all');
                        },
                    },
                },
            } as any);

            await client.user.create({ data: { email: 'u1@test.com' } });
            expect(calls).toEqual(['$all']);
        } finally {
            warn.mockRestore();
        }
    });

    it('warns on onEntityMutation keys that are not $all or a known model name', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const client = _client.$use({
                id: 'typo',
                onEntityMutation: {
                    user: {
                        afterEntityMutation() {},
                    },
                },
            } as any);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0]![0]).toContain('"user"');

            // no repeated warnings for derived clients
            await client.$transaction(async (tx) => {
                await tx.user.create({ data: { email: 'u1@test.com' } });
            });
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });
});

describe('Entity mutation hooks - computed fields', () => {
    it('hook entities exclude computed fields in both type and value', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    firstName String
    lastName String
    fullName String @computed
}
`,
            {
                computedFields: {
                    User: {
                        fullName: (eb: any) => eb.fn('concat', [eb.ref('firstName'), sql.lit(' '), eb.ref('lastName')]),
                    },
                },
            } as any,
        );

        let entity: any;
        const client = db.$use({
            id: 'test',
            onEntityMutation: {
                User: {
                    async afterEntityMutation(args: any) {
                        entity = (await args.loadAfterMutationEntities())?.[0];
                    },
                },
            },
        });

        await client.user.create({ data: { firstName: 'Alex', lastName: 'Smith' } });

        // type-level: computed field `postCount` is not part of the hook entity type
        type UserEntity = MutationHookEntity<typeof typingSchema, 'User'>;
        expectTypeOf<UserEntity>().toHaveProperty('email');
        expectTypeOf<UserEntity>().not.toHaveProperty('postCount');
        // relations are not part of the entity either
        expectTypeOf<UserEntity>().not.toHaveProperty('posts');

        expect(entity).toBeDefined();
        expect(entity).toMatchObject({ firstName: 'Alex', lastName: 'Smith' });
        expect(entity).not.toHaveProperty('fullName');

        await db.$disconnect();
    });
});

describe('Entity mutation hooks - delegate model interaction', () => {
    const delegateSchema = `
model Base {
    id Int @id @default(autoincrement())
    orgId Int
    type String
    @@delegate(type)
}

model Child extends Base {
    childField Int
}
`;

    it('hook entity types match per-table rows (no inherited or descendant fields)', () => {
        // Asset (root base): only its own columns
        type AssetEntity = MutationHookEntity<typeof delegateSchemaTyped, 'Asset'>;
        expectTypeOf<AssetEntity>().toHaveProperty('assetType');
        expectTypeOf<AssetEntity>().toHaveProperty('ownerId');
        expectTypeOf<AssetEntity>().not.toHaveProperty('duration');
        expectTypeOf<AssetEntity>().not.toHaveProperty('rating');
        expectTypeOf<AssetEntity>().not.toHaveProperty('owner');

        // Video (sub-model and delegate base): own columns, no inherited ones
        type VideoEntity = MutationHookEntity<typeof delegateSchemaTyped, 'Video'>;
        expectTypeOf<VideoEntity>().toHaveProperty('id');
        expectTypeOf<VideoEntity>().toHaveProperty('duration');
        expectTypeOf<VideoEntity>().toHaveProperty('videoType');
        expectTypeOf<VideoEntity>().not.toHaveProperty('assetType');
        expectTypeOf<VideoEntity>().not.toHaveProperty('viewCount');
        expectTypeOf<VideoEntity>().not.toHaveProperty('rating');

        // RatedVideo (chained sub-model): own columns only
        type RatedVideoEntity = MutationHookEntity<typeof delegateSchemaTyped, 'RatedVideo'>;
        expectTypeOf<RatedVideoEntity>().toHaveProperty('id');
        expectTypeOf<RatedVideoEntity>().toHaveProperty('rating');
        expectTypeOf<RatedVideoEntity>().toHaveProperty('userId');
        expectTypeOf<RatedVideoEntity>().not.toHaveProperty('duration');
        expectTypeOf<RatedVideoEntity>().not.toHaveProperty('assetType');
    });

    it('Child hook entities contain only child-table columns; Base hook entities only base-table columns', async () => {
        const db = await createTestClient(delegateSchema);
        let childEntity: any;
        let baseEntity: any;

        const client = db.$use({
            id: 'test',
            onEntityMutation: {
                Child: {
                    async afterEntityMutation(args: any) {
                        childEntity = (await args.loadAfterMutationEntities())?.[0];
                    },
                },
                Base: {
                    async afterEntityMutation(args: any) {
                        baseEntity = (await args.loadAfterMutationEntities())?.[0];
                    },
                },
            },
        });

        const created = await client.child.create({ data: { orgId: 1, childField: 10 } });

        const qbChild = await db.$qb
            .selectFrom('Child')
            .selectAll()
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();
        const qbBase = await db.$qb
            .selectFrom('Base')
            .selectAll()
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();

        expect(childEntity).toEqual(qbChild);
        expect(childEntity).toEqual({ id: created.id, childField: 10 });

        expect(baseEntity).toEqual(qbBase);
        expect(baseEntity).toEqual({ id: created.id, orgId: 1, type: 'Child' });

        await db.$disconnect();
    });

    it("fires per-model hooks once per table written, keyed by that table's model", async () => {
        const db = await createTestClient(delegateSchema);
        const events: string[] = [];

        const client = db.$use({
            id: 'test',
            onEntityMutation: {
                Base: {
                    afterEntityMutation(args: any) {
                        events.push(`Base:${args.action}`);
                    },
                },
                Child: {
                    afterEntityMutation(args: any) {
                        events.push(`Child:${args.action}`);
                    },
                },
            },
        });

        // create writes both tables
        const created = await client.child.create({ data: { orgId: 1, childField: 10 } });
        expect(events).toEqual(['Base:create', 'Child:create']);

        // updating only a sub-model field writes only the sub-model table
        events.length = 0;
        await client.child.update({ where: { id: created.id }, data: { childField: 11 } });
        expect(events).toEqual(['Child:update']);

        // updating only an inherited field writes only the base table, so only
        // the base model's hook fires
        events.length = 0;
        await client.child.update({ where: { id: created.id }, data: { orgId: 2 } });
        expect(events).toEqual(['Base:update']);

        // updating both writes both tables
        events.length = 0;
        await client.child.update({ where: { id: created.id }, data: { orgId: 3, childField: 12 } });
        expect(events).toEqual(['Base:update', 'Child:update']);

        // deleting a sub-model entity deletes the base row (sub-model row is cascaded),
        // so only the base model's hook fires
        events.length = 0;
        await client.child.delete({ where: { id: created.id } });
        expect(events).toEqual(['Base:delete']);

        await db.$disconnect();
    });

    it('base model hook entities carry the discriminator so the concrete sub-model can be identified', async () => {
        const db = await createTestClient(delegateSchema);
        const types: string[] = [];

        const client = db.$use({
            id: 'test',
            onEntityMutation: {
                Base: {
                    async beforeEntityMutation(args: any) {
                        const entities = await args.loadBeforeMutationEntities();
                        if (entities) {
                            types.push(...entities.map((e: any) => `${args.action}:${e.type}`));
                        }
                    },
                    async afterEntityMutation(args: any) {
                        const entities = await args.loadAfterMutationEntities();
                        if (entities) {
                            types.push(...entities.map((e: any) => `${args.action}:${e.type}`));
                        }
                    },
                },
            },
        });

        const created = await client.child.create({ data: { orgId: 1, childField: 10 } });
        await client.child.update({ where: { id: created.id }, data: { orgId: 2 } });
        await client.child.delete({ where: { id: created.id } });

        expect(types).toEqual(['create:Child', 'update:Child', 'update:Child', 'delete:Child']);

        await db.$disconnect();
    });

    it('update on child model succeeds with afterEntityMutation plugin', async () => {
        const client = await createTestClient(delegateSchema);

        const withPlugin = client.$use({
            id: 'test',
            onEntityMutation: {
                $all: {
                    afterEntityMutation() {},
                },
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
