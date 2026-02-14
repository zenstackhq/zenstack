import { AllReadOperations } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { schema } from '../schemas/basic/schema';

describe('Model slicing tests', () => {
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
    });

    describe('Operation inclusion/exclusion', () => {
        it('includes only specified operations with includedOperations', async () => {
            const options = {
                slicing: {
                    models: {
                        User: {
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
                        User: {
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
                        User: {
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
                        User: {
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
                        User: {
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
                        User: {
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
                        User: {
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
});
