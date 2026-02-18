import { AllReadOperations } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { schema } from '../schemas/basic/schema';
import { schema as proceduresSchema } from '../schemas/procedures/schema';

describe('Query slicing tests', () => {
    describe('Model inclusion/exclusion', () => {
        it('includes all models when no slicing config', async () => {
            const db = await createTestClient(schema);

            // All models should be accessible
            expect(db.user).toBeDefined();
            expect(db.post).toBeDefined();
            expect(db.comment).toBeDefined();
            expect(db.profile).toBeDefined();
            expect(db.plain).toBeDefined();
        });

        it('includes only specified models with includedModels', async () => {
            const options = {
                slicing: {
                    includedModels: ['User', 'Post'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // included models should be accessible
            expect(db.user).toBeDefined();
            expect(db.post).toBeDefined();

            // @ts-expect-error - Profile model should not be accessible
            expect(db.profile).toBeUndefined();
            // @ts-expect-error - Plain model should not be accessible
            expect(db.plain).toBeUndefined();
        });

        it('excludes specified models with excludedModels', async () => {
            const options = {
                slicing: {
                    excludedModels: ['Comment', 'Profile'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // non-excluded models should be accessible
            expect(db.user).toBeDefined();
            expect(db.post).toBeDefined();
            expect(db.plain).toBeDefined();

            // excluded models should not be accessible
            // @ts-expect-error - Comment model should be excluded
            expect(db.comment).toBeUndefined();
            // @ts-expect-error - Profile model should be excluded
            expect(db.profile).toBeUndefined();
        });

        it('applies both includedModels and excludedModels (exclusion after inclusion)', async () => {
            const options = {
                slicing: {
                    includedModels: ['User', 'Post', 'Comment'] as const,
                    excludedModels: ['Comment'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // only User and Post should be accessible (Comment excluded after being included)
            expect(db.user).toBeDefined();
            expect(db.post).toBeDefined();

            // Comment should be excluded despite being in includedModels
            // @ts-expect-error - Comment model should be excluded
            expect(db.comment).toBeUndefined();

            // Profile and Plain were never included
            // @ts-expect-error - Profile model was not included
            expect(db.profile).toBeUndefined();
            // @ts-expect-error - Plain model was not included
            expect(db.plain).toBeUndefined();
        });

        it('excludes all models when includedModels is empty array', async () => {
            const options = {
                slicing: {
                    includedModels: [] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // no models should be accessible with empty includedModels
            // @ts-expect-error - User model should not be accessible
            expect(db.user).toBeUndefined();
            // @ts-expect-error - Post model should not be accessible
            expect(db.post).toBeUndefined();
            // @ts-expect-error - Comment model should not be accessible
            expect(db.comment).toBeUndefined();
            // @ts-expect-error - Profile model should not be accessible
            expect(db.profile).toBeUndefined();
            // @ts-expect-error - Plain model should not be accessible
            expect(db.plain).toBeUndefined();
        });

        it('has no effect when excludedModels is empty array', async () => {
            const options = {
                slicing: {
                    excludedModels: [] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // All models should be accessible (empty excludedModels has no effect)
            expect(db.user).toBeDefined();
            expect(db.post).toBeDefined();
            expect(db.comment).toBeDefined();
            expect(db.profile).toBeDefined();
            expect(db.plain).toBeDefined();
        });

        it('works with setOptions to change slicing at runtime', async () => {
            const initialOptions = {
                slicing: {
                    includedModels: ['User', 'Post'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof initialOptions>(schema, initialOptions);

            // Initially only User and Post are accessible
            expect(db.user).toBeDefined();
            expect(db.post).toBeDefined();

            // Change slicing options
            const newOptions = {
                ...initialOptions,
                slicing: {
                    includedModels: ['Comment', 'Profile'] as const,
                },
            } as const;

            const db2 = db.$setOptions(newOptions);

            // After setOptions, different models should be accessible
            expect(db2.comment).toBeDefined();
            expect(db2.profile).toBeDefined();

            // Original client should remain unchanged
            expect(db.user).toBeDefined();
            expect(db.post).toBeDefined();
        });

        it('prevents excluded models from being used in include clause', async () => {
            const options = {
                slicing: {
                    includedModels: ['User', 'Post'] as const,
                    // excludedModels: ['Profile', 'Comment'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            await db.user.create({ data: { email: 'test@example.com', name: 'Test User' } });
            const user = await db.user.findFirst({ where: { email: 'test@example.com' } });

            await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

            // Profile is excluded, so including it should cause type error
            await expect(
                db.user.findMany({
                    // @ts-expect-error - Profile model is excluded
                    include: { profile: true },
                }),
            ).toBeRejectedByValidation(['"profile"', '"include"']);

            // Comment is excluded, so including it should cause type error
            await expect(
                db.post.findMany({
                    // @ts-expect-error - Comment model is excluded
                    include: { comments: true },
                }),
            ).toBeRejectedByValidation(['"comments"', '"include"']);

            // Non-excluded relations should work
            const userWithPosts = await db.user.findMany({
                include: { posts: true },
            });
            expect(userWithPosts[0]!.posts).toBeDefined();
        });

        it('prevents excluded models from being used in select clause', async () => {
            const options = {
                slicing: {
                    excludedModels: ['Profile', 'Comment'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            await db.user.create({ data: { email: 'test@example.com', name: 'Test User' } });
            const user = await db.user.findFirst({ where: { email: 'test@example.com' } });

            await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

            // Profile is excluded, so selecting it should cause type error
            await expect(
                db.user.findMany({
                    // @ts-expect-error - Profile model is excluded
                    select: { id: true, profile: true },
                }),
            ).toBeRejectedByValidation(['"profile"', '"select"']);

            // Comment is excluded, so selecting it should cause type error
            await expect(
                db.post.findMany({
                    // @ts-expect-error - Comment model is excluded
                    select: { id: true, comments: true },
                }),
            ).toBeRejectedByValidation(['"comments"', '"select"']);

            // Non-excluded relations should work in select
            const userWithPosts = await db.user.findMany({
                select: { id: true, posts: true },
            });
            expect(userWithPosts[0]!.posts).toBeDefined();
        });

        it('prevents models not in includedModels from being used in include clause', async () => {
            const options = {
                slicing: {
                    includedModels: ['User', 'Post'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            await db.user.create({ data: { email: 'test@example.com', name: 'Test User' } });
            const user = await db.user.findFirst({ where: { email: 'test@example.com' } });

            await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

            // Profile is not included, so including it should cause type error
            await expect(
                db.user.findMany({
                    // @ts-expect-error - Profile model is not included
                    include: { profile: true },
                }),
            ).toBeRejectedByValidation(['"profile"', '"include"']);

            // Comment is not included, so including it should cause type error
            await expect(
                db.post.findMany({
                    // @ts-expect-error - Comment model is not included
                    include: { comments: true },
                }),
            ).toBeRejectedByValidation(['"comments"', '"include"']);

            // User and Post are included, so relations between them should work
            const userWithPosts = await db.user.findMany({
                include: { posts: true },
            });
            expect(userWithPosts[0]!.posts).toBeDefined();

            const postWithAuthor = await db.post.findMany({
                include: { author: true },
            });
            expect(postWithAuthor[0]!.author).toBeDefined();
        });

        it('prevents models not in includedModels from being used in select clause', async () => {
            const options = {
                slicing: {
                    includedModels: ['User', 'Post'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            await db.user.create({ data: { email: 'test@example.com', name: 'Test User' } });
            const user = await db.user.findFirst({ where: { email: 'test@example.com' } });

            await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

            // Profile is not included, so selecting it should cause type error
            await expect(
                db.user.findMany({
                    // @ts-expect-error - Profile model is not included
                    select: { id: true, profile: true },
                }),
            ).toBeRejectedByValidation(['"profile"', '"select"']);

            // Comment is not included, so selecting it should cause type error
            await expect(
                db.post.findMany({
                    // @ts-expect-error - Comment model is not included
                    select: { id: true, comments: true },
                }),
            ).toBeRejectedByValidation(['"comments"', '"select"']);

            // User and Post are included, so relations between them should work in select
            const userWithPosts = await db.user.findMany({
                select: { id: true, posts: true },
            });
            expect(userWithPosts[0]!.posts).toBeDefined();

            const postWithAuthor = await db.post.findMany({
                select: { id: true, author: true },
            });
            expect(postWithAuthor[0]!.author).toBeDefined();
        });

        it('prevents excluded models from nested include clauses', async () => {
            const options = {
                slicing: {
                    excludedModels: ['Comment'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            await db.user.create({ data: { email: 'test@example.com', name: 'Test User' } });
            const user = await db.user.findFirst({ where: { email: 'test@example.com' } });

            await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

            // Comment is excluded, so including it in nested include should cause type error
            await expect(
                db.user.findMany({
                    include: {
                        posts: {
                            // @ts-expect-error - Comment model is excluded
                            include: { comments: true },
                        },
                    },
                }),
            ).toBeRejectedByValidation(['"comments"']);

            // User -> Post relation should work (Comment is excluded)
            const userWithPosts = await db.user.findMany({
                include: {
                    posts: true,
                },
            });
            expect(userWithPosts[0]!.posts).toBeDefined();
        });

        it('prevents excluded models from nested select clauses', async () => {
            const options = {
                slicing: {
                    excludedModels: ['Comment'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            await db.user.create({ data: { email: 'test@example.com', name: 'Test User' } });
            const user = await db.user.findFirst({ where: { email: 'test@example.com' } });

            await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

            // Comment is excluded, so selecting it in nested select should cause type error
            await expect(
                db.user.findMany({
                    select: {
                        id: true,
                        posts: {
                            // @ts-expect-error - Comment model is excluded
                            select: { id: true, comments: true },
                        },
                    },
                }),
            ).toBeRejectedByValidation(['"comments"']);

            // User -> Post relation should work in nested select (Comment is excluded)
            const userWithPosts = await db.user.findMany({
                select: {
                    id: true,
                    posts: {
                        select: { id: true, title: true },
                    },
                },
            });
            expect(userWithPosts[0]!.posts).toBeDefined();
        });

        it('prevents nested create on excluded models', async () => {
            const options = {
                slicing: {
                    excludedModels: ['Profile'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // Cannot create user with nested profile (Profile is excluded)
            await expect(
                db.user.create({
                    data: {
                        email: 'test@example.com',
                        // @ts-expect-error - Profile model is excluded
                        profile: {
                            create: {
                                bio: 'Test bio',
                            },
                        },
                    },
                }),
            ).toBeRejectedByValidation(['"profile"']);
        });

        it('prevents nested update on excluded models', async () => {
            const options = {
                slicing: {
                    excludedModels: ['Profile'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            const user = await db.user.create({ data: { email: 'test@example.com' } });

            // Cannot update user with nested profile operations (Profile is excluded)
            await expect(
                db.user.update({
                    where: { id: user.id },
                    data: {
                        // @ts-expect-error - Profile model is excluded
                        profile: {
                            create: {
                                bio: 'Test bio',
                            },
                        },
                    },
                }),
            ).toBeRejectedByValidation(['"profile"']);
        });

        it('prevents nested upsert on excluded models', async () => {
            const options = {
                slicing: {
                    excludedModels: ['Comment'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // Cannot update post with nested comment operations (Comment is excluded)
            await expect(
                db.post.update({
                    where: { id: 'post-id' },
                    data: {
                        // @ts-expect-error - Comment model is excluded
                        comments: {
                            upsert: {
                                where: { id: 'comment-id' },
                                create: { content: 'New comment' },
                                update: { content: 'Updated comment' },
                            },
                        },
                    },
                }),
            ).toBeRejectedByValidation(['"comments"']);
        });

        it('allows nested create on included models', async () => {
            const options = {
                slicing: {
                    includedModels: ['User', 'Post'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // Can create user with nested posts (Post is included)
            const user = await db.user.create({
                data: {
                    email: 'test@example.com',
                    posts: {
                        create: [
                            { title: 'Post 1', content: 'Content 1' },
                            { title: 'Post 2', content: 'Content 2' },
                        ],
                    },
                },
                include: { posts: true },
            });

            expect(user.posts).toHaveLength(2);
            expect(user.posts[0]!.title).toBe('Post 1');
        });

        it('allows nested update on included models', async () => {
            const options = {
                slicing: {
                    includedModels: ['User', 'Post'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // Create user with post
            const user = await db.user.create({
                data: {
                    email: 'test@example.com',
                    posts: {
                        create: { title: 'Post 1', content: 'Content 1' },
                    },
                },
                include: { posts: true },
            });

            const postId = user.posts[0]!.id;

            // Can update user with nested post updates (Post is included)
            const updated = await db.user.update({
                where: { id: user.id },
                data: {
                    posts: {
                        update: {
                            where: { id: postId },
                            data: { title: 'Updated Post' },
                        },
                    },
                },
                include: { posts: true },
            });

            expect(updated.posts[0]!.title).toBe('Updated Post');
        });
    });

    describe('Operation inclusion/exclusion', () => {
        it('includes only specified operations with includedOperations', async () => {
            const options = {
                slicing: {
                    models: {
                        user: {
                            includedOperations: ['findMany', 'create'] as const,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // Included operations should be accessible
            expect(db.user.findMany).toBeDefined();
            expect(db.user.create).toBeDefined();

            // Excluded operations should not be accessible
            // @ts-expect-error - findUnique should not be accessible
            expect(db.user.findUnique).toBeUndefined();
            // @ts-expect-error - update should not be accessible
            expect(db.user.update).toBeUndefined();
            // @ts-expect-error - delete should not be accessible
            expect(db.user.delete).toBeUndefined();
        });

        it('excludes specified operations with excludedOperations', async () => {
            const options = {
                slicing: {
                    models: {
                        user: {
                            excludedOperations: ['delete', 'deleteMany', 'update', 'updateMany'] as const,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // Non-excluded operations should be accessible
            expect(db.user.findMany).toBeDefined();
            expect(db.user.create).toBeDefined();
            expect(db.user.count).toBeDefined();

            // Excluded operations should not be accessible
            // @ts-expect-error - delete should be excluded
            expect(db.user.delete).toBeUndefined();
            // @ts-expect-error - deleteMany should be excluded
            expect(db.user.deleteMany).toBeUndefined();
            // @ts-expect-error - update should be excluded
            expect(db.user.update).toBeUndefined();
            // @ts-expect-error - updateMany should be excluded
            expect(db.user.updateMany).toBeUndefined();
        });

        it('applies both includedOperations and excludedOperations', async () => {
            const options = {
                slicing: {
                    models: {
                        user: {
                            includedOperations: ['findMany', 'findUnique', 'create', 'update'] as const,
                            excludedOperations: ['update'] as const,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // Only findMany, findUnique, and create should be accessible
            expect(db.user.findMany).toBeDefined();
            expect(db.user.findUnique).toBeDefined();
            expect(db.user.create).toBeDefined();

            // update should be excluded despite being in includedOperations
            // @ts-expect-error - update should be excluded
            expect(db.user.update).toBeUndefined();

            // delete was never included
            // @ts-expect-error - delete was not included
            expect(db.user.delete).toBeUndefined();
        });

        it('restricts operations for a single model without affecting others', async () => {
            const options = {
                slicing: {
                    models: {
                        user: {
                            includedOperations: ['findMany', 'create'] as const,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // User should have restricted operations
            expect(db.user.findMany).toBeDefined();
            expect(db.user.create).toBeDefined();
            // @ts-expect-error - update not included for User
            expect(db.user.update).toBeUndefined();

            // Post should have all operations (no restrictions)
            expect(db.post.findMany).toBeDefined();
            expect(db.post.create).toBeDefined();
            expect(db.post.update).toBeDefined();
            expect(db.post.delete).toBeDefined();
        });

        it('creates read-only model with only read operations', async () => {
            const options = {
                slicing: {
                    models: {
                        user: {
                            includedOperations: AllReadOperations,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // Read operations should be accessible
            expect(db.user.findMany).toBeDefined();
            expect(db.user.findUnique).toBeDefined();
            expect(db.user.findFirst).toBeDefined();
            expect(db.user.count).toBeDefined();
            expect(db.user.exists).toBeDefined();

            // Write operations should not be accessible
            // @ts-expect-error - create should not be accessible
            expect(db.user.create).toBeUndefined();
            // @ts-expect-error - update should not be accessible
            expect(db.user.update).toBeUndefined();
            // @ts-expect-error - delete should not be accessible
            expect(db.user.delete).toBeUndefined();
        });

        it('excludes all operations when includedOperations is empty', async () => {
            const options = {
                slicing: {
                    models: {
                        user: {
                            includedOperations: [] as const,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // No operations should be accessible
            // @ts-expect-error - findMany should not be accessible
            expect(db.user.findMany).toBeUndefined();
            // @ts-expect-error - create should not be accessible
            expect(db.user.create).toBeUndefined();
            // @ts-expect-error - update should not be accessible
            expect(db.user.update).toBeUndefined();
        });

        it('applies $all slicing to all models when no model-specific config', async () => {
            const options = {
                slicing: {
                    models: {
                        $all: {
                            includedOperations: ['findMany', 'count'] as const,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // All models should have only findMany and count
            expect(db.user.findMany).toBeDefined();
            expect(db.user.count).toBeDefined();
            // @ts-expect-error - create should not be accessible
            expect(db.user.create).toBeUndefined();

            expect(db.post.findMany).toBeDefined();
            expect(db.post.count).toBeDefined();
            // @ts-expect-error - update should not be accessible
            expect(db.post.update).toBeUndefined();
        });

        it('model-specific slicing overrides $all slicing', async () => {
            const options = {
                slicing: {
                    models: {
                        $all: {
                            includedOperations: ['findMany', 'count'] as const,
                        },
                        user: {
                            includedOperations: ['findMany', 'create', 'update'] as const,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // User should have model-specific operations
            expect(db.user.findMany).toBeDefined();
            expect(db.user.create).toBeDefined();
            expect(db.user.update).toBeDefined();
            // @ts-expect-error - count is in $all but User overrides
            expect(db.user.count).toBeUndefined();
            // @ts-expect-error - delete not in User's includedOperations
            expect(db.user.delete).toBeUndefined();

            // Post should have $all operations
            expect(db.post.findMany).toBeDefined();
            expect(db.post.count).toBeDefined();
            // @ts-expect-error - create not in $all
            expect(db.post.create).toBeUndefined();
        });

        it('uses $all excludedOperations as fallback', async () => {
            const options = {
                slicing: {
                    models: {
                        $all: {
                            excludedOperations: ['delete', 'deleteMany'] as const,
                        },
                    },
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof schema, typeof options>(schema, options);

            // All models should exclude delete and deleteMany
            expect(db.user.findMany).toBeDefined();
            expect(db.user.create).toBeDefined();
            // @ts-expect-error - delete should be excluded
            expect(db.user.delete).toBeUndefined();
            // @ts-expect-error - deleteMany should be excluded
            expect(db.user.deleteMany).toBeUndefined();

            expect(db.post.update).toBeDefined();
            // @ts-expect-error - delete should be excluded
            expect(db.post.delete).toBeUndefined();
        });
    });

    describe('Procedure inclusion/exclusion', () => {
        // Mock procedure handlers for testing (simplified versions)
        const mockProcedures = {
            getUser: () => ({ id: 1, name: 'test', role: 'USER' as const }),
            listUsers: () => [],
            signUp: () => ({ id: 1, name: 'test', role: 'USER' as const }),
            setAdmin: () => undefined,
            getOverview: () => ({ userIds: [], total: 0, roles: ['USER' as const], meta: null }),
            createMultiple: () => [],
        };

        it('includes all procedures when no slicing config', async () => {
            const db = await createTestClient(proceduresSchema, {
                procedures: mockProcedures as any,
            });

            // All procedures should be accessible
            expect(db.$procs.getUser).toBeDefined();
            expect(db.$procs.listUsers).toBeDefined();
            expect(db.$procs.signUp).toBeDefined();
            expect(db.$procs.setAdmin).toBeDefined();
            expect(db.$procs.getOverview).toBeDefined();
            expect(db.$procs.createMultiple).toBeDefined();
        });

        it('includes only specified procedures with includedProcedures', async () => {
            const options = {
                procedures: mockProcedures as any,
                slicing: {
                    includedProcedures: ['getUser', 'listUsers'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof proceduresSchema, typeof options>(proceduresSchema, options);

            // Included procedures should be accessible
            expect(db.$procs.getUser).toBeDefined();
            expect(db.$procs.listUsers).toBeDefined();

            // Non-included procedures should not be accessible
            // @ts-expect-error - signUp should not be accessible
            expect(db.$procs.signUp).toBeUndefined();
            // @ts-expect-error - setAdmin should not be accessible
            expect(db.$procs.setAdmin).toBeUndefined();
            // @ts-expect-error - getOverview should not be accessible
            expect(db.$procs.getOverview).toBeUndefined();
            // @ts-expect-error - createMultiple should not be accessible
            expect(db.$procs.createMultiple).toBeUndefined();
        });

        it('excludes specified procedures with excludedProcedures', async () => {
            const options = {
                procedures: mockProcedures as any,
                slicing: {
                    excludedProcedures: ['signUp', 'setAdmin', 'createMultiple'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof proceduresSchema, typeof options>(proceduresSchema, options);

            // Non-excluded procedures should be accessible
            expect(db.$procs.getUser).toBeDefined();
            expect(db.$procs.listUsers).toBeDefined();
            expect(db.$procs.getOverview).toBeDefined();

            // Excluded procedures should not be accessible
            // @ts-expect-error - signUp should be excluded
            expect(db.$procs.signUp).toBeUndefined();
            // @ts-expect-error - setAdmin should be excluded
            expect(db.$procs.setAdmin).toBeUndefined();
            // @ts-expect-error - createMultiple should be excluded
            expect(db.$procs.createMultiple).toBeUndefined();
        });

        it('applies both includedProcedures and excludedProcedures (exclusion takes precedence)', async () => {
            const options = {
                procedures: mockProcedures as any,
                slicing: {
                    includedProcedures: ['getUser', 'listUsers', 'signUp'] as const,
                    excludedProcedures: ['signUp'] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof proceduresSchema, typeof options>(proceduresSchema, options);

            // Only getUser and listUsers should be accessible
            expect(db.$procs.getUser).toBeDefined();
            expect(db.$procs.listUsers).toBeDefined();

            // signUp should be excluded despite being in includedProcedures
            // @ts-expect-error - signUp should be excluded
            expect(db.$procs.signUp).toBeUndefined();

            // Others were never included
            // @ts-expect-error - setAdmin was not included
            expect(db.$procs.setAdmin).toBeUndefined();
            // @ts-expect-error - getOverview was not included
            expect(db.$procs.getOverview).toBeUndefined();
            // @ts-expect-error - createMultiple was not included
            expect(db.$procs.createMultiple).toBeUndefined();
        });

        it('excludes all procedures when includedProcedures is empty array', async () => {
            const options = {
                procedures: mockProcedures as any,
                slicing: {
                    includedProcedures: [] as const,
                },
                dialect: {} as any,
            } as const;

            const db = await createTestClient<typeof proceduresSchema, typeof options>(proceduresSchema, options);

            // No procedures should be accessible with empty includedProcedures
            // @ts-expect-error - getUser should not be accessible
            expect(db.$procs.getUser).toBeUndefined();
            // @ts-expect-error - listUsers should not be accessible
            expect(db.$procs.listUsers).toBeUndefined();
            // @ts-expect-error - signUp should not be accessible
            expect(db.$procs.signUp).toBeUndefined();
            // @ts-expect-error - setAdmin should not be accessible
            expect(db.$procs.setAdmin).toBeUndefined();
            // @ts-expect-error - getOverview should not be accessible
            expect(db.$procs.getOverview).toBeUndefined();
            // @ts-expect-error - createMultiple should not be accessible
            expect(db.$procs.createMultiple).toBeUndefined();
        });

        it('has no effect when excludedProcedures is empty array', async () => {
            const db = await createTestClient(proceduresSchema, {
                procedures: mockProcedures as any,
                slicing: {
                    excludedProcedures: [] as const,
                },
            });

            // All procedures should be accessible (empty excludedProcedures has no effect)
            expect(db.$procs.getUser).toBeDefined();
            expect(db.$procs.listUsers).toBeDefined();
            expect(db.$procs.signUp).toBeDefined();
            expect(db.$procs.setAdmin).toBeDefined();
            expect(db.$procs.getOverview).toBeDefined();
            expect(db.$procs.createMultiple).toBeDefined();
        });
    });

    describe('Filter kind inclusion/exclusion', () => {
        describe('Model-level filter kind slicing', () => {
            it('allows all filter kinds when no slicing config', async () => {
                const db = await createTestClient(schema);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // All filter kinds should work

                // Equality filters
                const equalityResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(equalityResult).toHaveLength(1);

                // empty filters
                const rangeResult = await db.user.findMany({
                    where: {},
                });
                expect(rangeResult).toHaveLength(1);

                // Like filters
                const likeResult = await db.user.findMany({
                    where: { name: { contains: 'Test' } },
                });
                expect(likeResult).toHaveLength(1);
            });

            it('includes only specified filter kinds with includedFilterKinds', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // Equality filters should work
                const equalityResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(equalityResult).toHaveLength(1);

                // Range filters should cause type error
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - gte is not allowed (Range filters excluded)
                        where: { age: { gte: 20 } },
                    }),
                ).toBeRejectedByValidation(['"gte"']);

                // Like filters should cause type error
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - contains is not allowed (Like filters excluded)
                        where: { name: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);
            });

            it('excludes specified filter kinds with excludedFilterKinds', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        excludedFilterKinds: ['Like', 'Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // Equality filters should work
                const equalityResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(equalityResult).toHaveLength(1);

                // Range filters should cause type error
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - gte is excluded
                        where: { age: { gte: 20 } },
                    }),
                ).toBeRejectedByValidation(['"gte"']);

                // Like filters should cause type error
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - contains is excluded
                        where: { name: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);
            });

            it('applies both includedFilterKinds and excludedFilterKinds (exclusion takes precedence)', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Equality', 'Range', 'Like'] as const,
                                        excludedFilterKinds: ['Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // Equality filters should work
                const equalityResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(equalityResult).toHaveLength(1);

                // Like filters should work
                const likeResult = await db.user.findMany({
                    where: { name: { contains: 'Test' } },
                });
                expect(likeResult).toHaveLength(1);

                // Range filters should cause type error (excluded despite being included)
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - gte is excluded
                        where: { age: { gte: 20 } },
                    }),
                ).toBeRejectedByValidation(['"gte"']);
            });

            it('excludes all filter operations when includedFilterKinds is empty', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: [] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // All filter operations should cause type errors
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - no filter operators are allowed
                        where: { email: { equals: 'test@example.com' } },
                    }),
                ).toBeRejectedByValidation(['"where.email"']);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - no filter operators are allowed
                        where: { age: { gte: 20 } },
                    }),
                ).toBeRejectedByValidation(['"where.age"']);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - no filter operators are allowed
                        where: { name: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"where.name"']);
            });

            it('allows only Equality and Range filters for numeric fields', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Equality', 'Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // Equality filters should work
                const inResult = await db.user.findMany({
                    where: { age: { in: [25, 30] } },
                });
                expect(inResult).toHaveLength(1);

                // Range filters should work
                const betweenResult = await db.user.findMany({
                    where: { age: { between: [20, 30] } },
                });
                expect(betweenResult).toHaveLength(1);

                const gteResult = await db.user.findMany({
                    where: { age: { gte: 25, lte: 30 } },
                });
                expect(gteResult).toHaveLength(1);
            });

            it('applies $all filter kind slicing to all models', async () => {
                const options = {
                    slicing: {
                        models: {
                            $all: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'user@example.com', name: 'User' } });
                const user = await db.user.findFirst({ where: { email: 'user@example.com' } });

                await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

                // Equality filters should work for all models
                const userResult = await db.user.findMany({
                    where: { email: { equals: 'user@example.com' } },
                });
                expect(userResult).toHaveLength(1);

                const postResult = await db.post.findMany({
                    where: { title: { equals: 'Test Post' } },
                });
                expect(postResult).toHaveLength(1);

                // Like filters should cause type errors for all models
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - contains is not allowed for User
                        where: { name: { contains: 'User' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);

                await expect(
                    db.post.findMany({
                        // @ts-expect-error - contains is not allowed for Post
                        where: { title: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);
            });

            it('model-specific filter kind slicing overrides $all slicing', async () => {
                const options = {
                    slicing: {
                        models: {
                            $all: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                },
                            },
                            user: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Equality', 'Like'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'user@example.com', name: 'Test User' } });
                const user = await db.user.findFirst({ where: { email: 'user@example.com' } });

                await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

                // User should have Equality and Like filters
                const userLikeResult = await db.user.findMany({
                    where: { name: { contains: 'Test' } },
                });
                expect(userLikeResult).toHaveLength(1);

                // Post should only have Equality filters (from $all)
                const postEqualityResult = await db.post.findMany({
                    where: { title: { equals: 'Test Post' } },
                });
                expect(postEqualityResult).toHaveLength(1);

                // Post should not have Like filters
                await expect(
                    db.post.findMany({
                        // @ts-expect-error - contains is not allowed for Post
                        where: { title: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);
            });

            it('excludes Relation filters to prevent relation queries', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        excludedFilterKinds: ['Relation'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'user@example.com', name: 'Test' } });

                // Scalar filters should work
                const scalarResult = await db.user.findMany({
                    where: { email: { equals: 'user@example.com' } },
                });
                expect(scalarResult).toHaveLength(1);

                // Relation filters should cause type errors
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - posts relation filter should be excluded
                        where: { posts: { some: { title: 'test' } } },
                    }),
                ).toBeRejectedByValidation(['"where.posts"']);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - profile relation filter should be excluded
                        where: { profile: { is: { bio: 'test' } } },
                    }),
                ).toBeRejectedByValidation(['"where.profile"']);
            });

            it('uses $all excludedFilterKinds as fallback', async () => {
                const options = {
                    slicing: {
                        models: {
                            $all: {
                                fields: {
                                    $all: {
                                        excludedFilterKinds: ['Relation', 'Json'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'user@example.com', name: 'User' } });
                const user = await db.user.findFirst({ where: { email: 'user@example.com' } });
                await db.post.create({ data: { title: 'Post', content: 'Content', authorId: user!.id } });

                // Scalar filters should work for all models
                const userResult = await db.user.findMany({
                    where: { email: { equals: 'user@example.com' } },
                });
                expect(userResult).toHaveLength(1);

                // Relation filters should be excluded for all models
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - posts relation filter excluded
                        where: { posts: { some: { title: 'test' } } },
                    }),
                ).toBeRejectedByValidation(['"where.posts"']);

                await expect(
                    db.post.findMany({
                        // @ts-expect-error - author relation filter excluded
                        where: { author: { is: { email: 'test' } } },
                    }),
                ).toBeRejectedByValidation(['"where.author"']);
            });
        });

        describe('Field-level filter kind slicing', () => {
            it('allows field-specific filter kind restrictions', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                // Field-level: restrict 'name' to only Equality filters
                                fields: {
                                    name: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // Equality filters should work on 'name' field
                const equalityResult = await db.user.findMany({
                    where: { name: { equals: 'Test User' } },
                });
                expect(equalityResult).toHaveLength(1);

                // Like filters should cause type error on 'name' field
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - contains is not allowed for 'name' field
                        where: { name: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);

                // Other fields should still support all filter kinds
                const ageRangeResult = await db.user.findMany({
                    where: { age: { gte: 20 } },
                });
                expect(ageRangeResult).toHaveLength(1);

                const emailLikeResult = await db.user.findMany({
                    where: { email: { contains: 'example' } },
                });
                expect(emailLikeResult).toHaveLength(1);
            });

            it('excludes specific filter kinds for a field', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    email: {
                                        excludedFilterKinds: ['Like'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // Equality filters should work on 'email' field
                const equalityResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(equalityResult).toHaveLength(1);

                // Like filters should cause type error on 'email' field
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - contains is excluded for 'email' field
                        where: { email: { contains: 'test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);

                // Other fields should still support Like filters
                const nameLikeResult = await db.user.findMany({
                    where: { name: { contains: 'Test' } },
                });
                expect(nameLikeResult).toHaveLength(1);
            });

            it('applies both field-level includedFilterKinds and excludedFilterKinds', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    name: {
                                        includedFilterKinds: ['Equality', 'Like', 'Range'] as const,
                                        excludedFilterKinds: ['Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // Equality filters should work
                const equalityResult = await db.user.findMany({
                    where: { name: { equals: 'Test User' } },
                });
                expect(equalityResult).toHaveLength(1);

                // Like filters should work
                const likeResult = await db.user.findMany({
                    where: { name: { contains: 'Test' } },
                });
                expect(likeResult).toHaveLength(1);

                // Range filters should cause type error (excluded despite being included)
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Range filters are excluded for 'name'
                        where: { name: { gte: 'A' } },
                    }),
                ).toBeRejectedByValidation(['"gte"']);
            });

            it('field-level slicing with $all fallback', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    // $all: only Equality filters for all fields by default
                                    $all: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                    // Field-level: 'name' gets Equality AND Like filters
                                    name: {
                                        includedFilterKinds: ['Equality', 'Like'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // 'name' field should have Like filters (field-level override)
                const nameLikeResult = await db.user.findMany({
                    where: { name: { contains: 'Test' } },
                });
                expect(nameLikeResult).toHaveLength(1);

                // 'email' field should only have Equality filters ($all fallback)
                const emailEqualityResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(emailEqualityResult).toHaveLength(1);

                // 'email' field should not have Like filters
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Like filters not allowed for 'email' (from $all)
                        where: { email: { contains: 'test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);
            });

            it('excludes all filter operations for a field when includedFilterKinds is empty', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    name: {
                                        includedFilterKinds: [] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // All filter operations should cause type errors for 'name' field
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - equals is not allowed for 'name'
                        where: { name: { equals: 'Test User' } },
                    }),
                ).toBeRejectedByValidation(['"where.name"']);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - contains is not allowed for 'name'
                        where: { name: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"where.name"']);

                // Other fields should still work normally
                const emailResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(emailResult).toHaveLength(1);
            });

            it('allows different field-level slicing for multiple fields', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    name: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                    email: {
                                        includedFilterKinds: ['Equality', 'Like'] as const,
                                    },
                                    age: {
                                        includedFilterKinds: ['Equality', 'Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // 'name' should only support Equality
                const nameResult = await db.user.findMany({
                    where: { name: { equals: 'Test User' } },
                });
                expect(nameResult).toHaveLength(1);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Like filters not allowed for 'name'
                        where: { name: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);

                // 'email' should support Equality and Like
                const emailEqualityResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(emailEqualityResult).toHaveLength(1);

                const emailLikeResult = await db.user.findMany({
                    where: { email: { contains: 'example' } },
                });
                expect(emailLikeResult).toHaveLength(1);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Range filters not allowed for 'email'
                        where: { email: { gte: 'a' } },
                    }),
                ).toBeRejectedByValidation(['"gte"']);

                // 'age' should support Equality and Range
                const ageEqualityResult = await db.user.findMany({
                    where: { age: { equals: 25 } },
                });
                expect(ageEqualityResult).toHaveLength(1);

                const ageRangeResult = await db.user.findMany({
                    where: { age: { gte: 20, lte: 30 } },
                });
                expect(ageRangeResult).toHaveLength(1);
            });

            it('field-level excludedFilterKinds with $all fallback', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    // $all: exclude Range filters for all fields
                                    $all: {
                                        excludedFilterKinds: ['Range'] as const,
                                    },
                                    // Field-level override
                                    name: {
                                        excludedFilterKinds: ['Like'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // 'name' should support Equality but not Like or Range
                const nameEqualityResult = await db.user.findMany({
                    where: { name: { equals: 'Test User' } },
                });
                expect(nameEqualityResult).toHaveLength(1);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Like filters excluded for 'name' field
                        where: { name: { contains: 'Test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);

                await db.user.findMany({
                    where: { name: { gte: 'A' } },
                });

                // 'email' should support Equality and Like but not Range ($all excludes Range)
                const emailLikeResult = await db.user.findMany({
                    where: { email: { contains: 'example' } },
                });
                expect(emailLikeResult).toHaveLength(1);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Range filters excluded by $all
                        where: { email: { gte: 'a' } },
                    }),
                ).toBeRejectedByValidation(['"gte"']);
            });

            it('works with numeric fields', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    age: {
                                        includedFilterKinds: ['Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test', age: 25 } });

                // Range filters should work for 'age'
                const gteResult = await db.user.findMany({
                    where: { age: { gte: 20 } },
                });
                expect(gteResult).toHaveLength(1);

                const betweenResult = await db.user.findMany({
                    where: { age: { between: [20, 30] } },
                });
                expect(betweenResult).toHaveLength(1);

                // Equality filters should cause type error for 'age'
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Equality filters not allowed for 'age'
                        where: { age: { equals: 25 } },
                    }),
                ).toBeRejectedByValidation(['"equals"']);
            });

            it('$all.fields specific-field config overrides $all.fields.$all', async () => {
                // Verifies the precedence level: $all.fields[field] > $all.fields.$all
                const options = {
                    slicing: {
                        models: {
                            $all: {
                                fields: {
                                    // Default for every field on every model: Equality only
                                    $all: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                    // Field-specific override within $all: 'name' gets Like too
                                    name: {
                                        includedFilterKinds: ['Equality', 'Like'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                // 'name' should allow Like ($all.fields.name wins over $all.fields.$all)
                const nameLikeResult = await db.user.findMany({
                    where: { name: { contains: 'Test' } },
                });
                expect(nameLikeResult).toHaveLength(1);

                // 'name' still allows Equality
                const nameEqResult = await db.user.findMany({
                    where: { name: { equals: 'Test User' } },
                });
                expect(nameEqResult).toHaveLength(1);

                // 'email' should only allow Equality (falls back to $all.fields.$all)
                const emailEqResult = await db.user.findMany({
                    where: { email: { equals: 'test@example.com' } },
                });
                expect(emailEqResult).toHaveLength(1);

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Like not allowed for 'email' ($all.fields.$all)
                        where: { email: { contains: 'test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);
            });

            it('filter kind precedence: model[field] > model.$all > $all[field] > $all.$all', async () => {
                // Exercises all four levels of the precedence chain end-to-end.
                const options = {
                    slicing: {
                        models: {
                            $all: {
                                fields: {
                                    // Level 4 (lowest): default for all fields on all models
                                    $all: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                    // Level 3: 'title' field on any model gets Like too
                                    title: {
                                        includedFilterKinds: ['Equality', 'Like'] as const,
                                    },
                                },
                            },
                            user: {
                                fields: {
                                    // Level 2: all User fields default to Equality + Range
                                    $all: {
                                        includedFilterKinds: ['Equality', 'Range'] as const,
                                    },
                                    // Level 1 (highest): User.name also gets Like
                                    name: {
                                        includedFilterKinds: ['Equality', 'Like', 'Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });
                const user = await db.user.findFirst({ where: { email: 'test@example.com' } });
                await db.post.create({ data: { title: 'Test Post', content: 'Content', authorId: user!.id } });

                // Level 1 – User.name: Equality + Like + Range
                const nameLike = await db.user.findMany({ where: { name: { contains: 'Test' } } });
                expect(nameLike).toHaveLength(1);
                const nameRange = await db.user.findMany({ where: { name: { gte: 'A' } } });
                expect(nameRange).toHaveLength(1);

                // Level 2 – User.email: Equality + Range (User.$all; Like is NOT included)
                const emailRange = await db.user.findMany({ where: { age: { gte: 20 } } });
                expect(emailRange).toHaveLength(1);
                await expect(
                    db.user.findMany({
                        // @ts-expect-error - Like not allowed for User.email (User.$all wins over $all.fields.*)
                        where: { email: { contains: 'test' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);

                // Level 3 – Post.title: Equality + Like ($all.fields.title; Range is NOT included)
                const titleLike = await db.post.findMany({ where: { title: { contains: 'Test' } } });
                expect(titleLike).toHaveLength(1);
                await expect(
                    db.post.findMany({
                        // @ts-expect-error - Range not allowed for Post.title ($all.fields.title)
                        where: { title: { gte: 'A' } },
                    }),
                ).toBeRejectedByValidation(['"gte"']);

                // Level 4 – Post.content: Equality only ($all.fields.$all fallback)
                const contentEq = await db.post.findMany({ where: { content: { equals: 'Content' } } });
                expect(contentEq).toHaveLength(1);
                await expect(
                    db.post.findMany({
                        // @ts-expect-error - Like not allowed for Post.content ($all.fields.$all)
                        where: { content: { contains: 'Content' } },
                    }),
                ).toBeRejectedByValidation(['"contains"']);
            });
        });

        describe('Direct value filter slicing', () => {
            it('allows direct value filters when Equality kind is included', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Equality'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User' } });

                const user = await db.user.findFirst({
                    where: { email: 'test@example.com' },
                });
                expect(user?.email).toBe('test@example.com');
            });

            it('rejects direct value filters when Equality kind is excluded', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'test@example.com', name: 'Test User', age: 25 } });

                await expect(
                    db.user.findFirst({
                        // @ts-expect-error - direct value shorthand maps to Equality filters
                        where: { email: 'test@example.com' },
                    }),
                ).toBeRejectedByValidation(['"where.email"']);
            });

            it('still allows unique operations to use direct value filters', async () => {
                const options = {
                    slicing: {
                        models: {
                            user: {
                                fields: {
                                    $all: {
                                        includedFilterKinds: ['Range'] as const,
                                    },
                                },
                            },
                        },
                    },
                    dialect: {} as any,
                } as const;

                const db = await createTestClient<typeof schema, typeof options>(schema, options);

                await db.user.create({ data: { email: 'unique@example.com', name: 'Original Name' } });

                await expect(
                    db.user.findMany({
                        // @ts-expect-error - findMany cannot use direct value filters without Equality kind
                        where: { email: 'unique@example.com' },
                    }),
                ).toBeRejectedByValidation(['"where.email"']);

                const uniqueUser = await db.user.findUnique({
                    where: { email: 'unique@example.com' },
                });
                expect(uniqueUser?.name).toBe('Original Name');

                await expect(
                    db.user.findUnique({
                        // @ts-expect-error non-unique fields are still sliced
                        where: { email: 'unique@example.com', age: 10 },
                    }),
                ).toBeRejectedByValidation(['"where.age"']);

                const updated = await db.user.update({
                    where: { email: 'unique@example.com' },
                    data: { name: 'Updated Name' },
                });
                expect(updated.name).toBe('Updated Name');

                const deleted = await db.user.delete({
                    where: { email: 'unique@example.com' },
                });
                expect(deleted.email).toBe('unique@example.com');
            });
        });
    });
});
