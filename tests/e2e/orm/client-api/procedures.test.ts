import type { ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/procedures/schema';
import type { User } from '../schemas/procedures/models';

describe('Procedures tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema, {
            procedures: {
                // Query procedure that returns a single User
                getUser: async ({ client, args: { id } }) => {
                    return await client.user.findUniqueOrThrow({
                        where: { id },
                    });
                },

                // Query procedure that returns an array of Users
                listUsers: async ({ client }) => {
                    return await client.user.findMany();
                },

                // Mutation procedure that creates a User
                signUp: async ({ client, args: { name, role } }) => {
                    return await client.user.create({
                        data: {
                            name,
                            role,
                        },
                    });
                },

                // Query procedure that returns Void
                setAdmin: async ({ client, args: { userId } }) => {
                    await client.user.update({
                        where: { id: userId },
                        data: { role: 'ADMIN' },
                    });
                },

                // Query procedure that returns a custom type
                getOverview: async ({ client }) => {
                    const userIds = await client.user.findMany({ select: { id: true } });
                    const total = await client.user.count();
                    return {
                        userIds: userIds.map((u) => u.id),
                        total,
                        roles: ['ADMIN', 'USER'],
                        meta: { hello: 'world' },
                    };
                },

                createMultiple: async ({ client, args: { names } }) => {
                    return await client.$transaction(async (tx) => {
                        const createdUsers: User[] = [];
                        for (const name of names) {
                            const user = await tx.user.create({
                                data: { name },
                            });
                            createdUsers.push(user);
                        }
                        return createdUsers;
                    });
                },

                updateProfile: async ({ client, args: { userId, profile } }) => {
                    await client.user.update({
                        data: {
                            profile,
                        },

                        where: {
                            id: userId,
                        },
                    });
                },
            },
        });
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('works with query proc with parameters', async () => {
        // Create a user first
        const created = await client.user.create({
            data: {
                name: 'Alice',
                role: 'USER',
            },
        });

        // Call the procedure
        const result = await client.$procs.getUser({ args: { id: created.id } });

        expect(result).toMatchObject({
            id: created.id,
            name: 'Alice',
            role: 'USER',
        });
    });

    it('works with query proc without parameters', async () => {
        // Create multiple users
        await client.user.create({
            data: { name: 'Alice', role: 'USER' },
        });
        await client.user.create({
            data: { name: 'Bob', role: 'ADMIN' },
        });
        await client.user.create({
            data: { name: 'Charlie', role: 'USER' },
        });

        const result = await client.$procs.listUsers();

        expect(result).toHaveLength(3);
        expect(result).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Alice', role: 'USER' }),
                expect.objectContaining({ name: 'Bob', role: 'ADMIN' }),
                expect.objectContaining({ name: 'Charlie', role: 'USER' }),
            ]),
        );
    });

    it('works with mutation with parameters', async () => {
        const result = await client.$procs.signUp({ args: { name: 'Alice' } });

        expect(result).toMatchObject({
            id: expect.any(Number),
            name: 'Alice',
            role: 'USER',
        });

        // Verify user was created in database
        const users = await client.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({
            name: 'Alice',
            role: 'USER',
        });

        // accepts optional role parameter
        const result1 = await client.$procs.signUp({
            args: {
                name: 'Bob',
                role: 'ADMIN',
            },
        });

        expect(result1).toMatchObject({
            id: expect.any(Number),
            name: 'Bob',
            role: 'ADMIN',
        });

        // Verify user was created with correct role
        const user1 = await client.user.findUnique({
            where: { id: result1.id },
        });
        expect(user1?.role).toBe('ADMIN');
    });

    it('works with mutation proc that returns void', async () => {
        // Create a regular user
        const user = await client.user.create({
            data: { name: 'Alice', role: 'USER' },
        });

        expect(user.role).toBe('USER');

        // Call setAdmin procedure
        const result = await client.$procs.setAdmin({ args: { userId: user.id } });

        // Procedure returns void
        expect(result).toBeUndefined();

        // Verify user role was updated
        const updated = await client.user.findUnique({
            where: { id: user.id },
        });
        expect(updated?.role).toBe('ADMIN');
    });

    it('works with procedure returning custom type', async () => {
        await client.user.create({ data: { name: 'Alice', role: 'USER' } });
        await client.user.create({ data: { name: 'Bob', role: 'ADMIN' } });

        const result = await client.$procs.getOverview();
        expect(result.total).toBe(2);
        expect(result.userIds).toHaveLength(2);
        expect(result.roles).toEqual(expect.arrayContaining(['ADMIN', 'USER']));
        expect(result.meta).toEqual({ hello: 'world' });
    });

    it('works with transactional mutation procs', async () => {
        // unique constraint violation should rollback the transaction
        await expect(client.$procs.createMultiple({ args: { names: ['Alice', 'Alice'] } })).rejects.toThrow();
        await expect(client.user.count()).resolves.toBe(0);

        // successful transaction
        await expect(client.$procs.createMultiple({ args: { names: ['Alice', 'Bob'] } })).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Alice' }),
                expect.objectContaining({ name: 'Bob' }),
            ]),
        );
    });

    it('respects the outer transaction context', async () => {
        // outer client creates a transaction
        await expect(
            client.$transaction(async (tx) => {
                await tx.$procs.signUp({ args: { name: 'Alice' } });
                await tx.$procs.signUp({ args: { name: 'Alice' } });
            }),
        ).rejects.toThrow();
        await expect(client.user.count()).resolves.toBe(0);

        // without transaction
        await client.$procs.signUp({ args: { name: 'Alice' } });
        await expect(client.$procs.signUp({ args: { name: 'Alice' } })).rejects.toThrow();
        await expect(client.user.count()).resolves.toBe(1);
    });

    it('respects strict json', async () => {
        const user = await client.$procs.signUp({ args: { name: 'Alice' } });
        await expect(
            client.$procs.updateProfile({
                args: {
                    userId: user.id,
                    profile: {
                        bio: 'Programmer',
                        // @ts-expect-error
                        unknown: true,
                    },
                },
            }),
        ).rejects.toThrow(/Unrecognized key: "unknown"/);
    });
});
