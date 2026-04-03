import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/basic';
import { createTestClient } from '@zenstackhq/testtools';

describe('Client filter tests ', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    async function createUser(
        email = 'u1@test.com',
        restFields: any = {
            name: 'User1',
            role: 'ADMIN',
            profile: { create: { bio: 'My bio' } },
        },
    ) {
        return client.user.create({
            data: {
                ...restFields,
                email,
            },
        });
    }

    async function createPosts(authorId: string) {
        return [
            await client.post.create({
                data: { title: 'Post1', published: true, authorId },
            }),
            await client.post.create({
                data: { title: 'Post2', published: false, authorId },
            }),
        ] as const;
    }

    it('supports string filters', async () => {
        const user1 = await createUser('u1@test.com');
        const user2 = await createUser('u2@test.com', { name: null });
        await createUser('u3%@test.com', { name: null });

        // equals
        await expect(client.user.findFirst({ where: { id: user1.id } })).toResolveTruthy();
        await expect(client.user.findFirst({ where: { id: { equals: user1.id } } })).toResolveTruthy();
        await expect(client.user.findFirst({ where: { id: { equals: '1' } } })).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: {
                    id: user1.id,
                    name: null,
                },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: {
                    id: user1.id,
                    name: { equals: null },
                },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: {
                    id: user2.id,
                    name: { equals: null },
                },
            }),
        ).toResolveTruthy();

        if (client.$schema.provider.type === 'sqlite') {
            // sqlite: equalities are case-sensitive, match is case-insensitive
            await expect(
                client.user.findFirst({
                    where: { email: { equals: 'u1@Test.com' } },
                }),
            ).toResolveFalsy();

            await expect(
                client.user.findFirst({
                    where: { email: { equals: 'u1@test.com' } },
                }),
            ).toResolveTruthy();

            await expect(
                client.user.findFirst({
                    where: { email: { contains: 'test' } },
                }),
            ).toResolveTruthy();
            await expect(
                client.user.findFirst({
                    where: { email: { contains: '%test' } },
                }),
            ).toResolveNull();
            await expect(
                client.user.findFirst({
                    where: { email: { contains: 'u3%' } },
                }),
            ).toResolveTruthy();
            await expect(
                client.user.findFirst({
                    where: { email: { contains: 'u3a' } },
                }),
            ).toResolveNull();
            await expect(
                client.user.findFirst({
                    where: { email: { contains: 'Test' } },
                }),
            ).toResolveTruthy();

            await expect(
                client.user.findFirst({
                    where: { email: { startsWith: 'u1' } },
                }),
            ).toResolveTruthy();
            await expect(
                client.user.findFirst({
                    where: { email: { startsWith: '%u1' } },
                }),
            ).toResolveNull();
            await expect(
                client.user.findFirst({
                    where: { email: { startsWith: 'U1' } },
                }),
            ).toResolveTruthy();
            await expect(
                client.user.findFirst({
                    where: { email: { startsWith: 'u3a' } },
                }),
            ).toResolveNull();
            await expect(
                client.user.findFirst({
                    where: { email: { startsWith: 'u3%' } },
                }),
            ).toResolveTruthy();

            await expect(
                client.user.findFirst({
                    where: {
                        email: { in: ['u1@Test.com'] },
                    },
                }),
            ).toResolveFalsy();
            await expect(
                client.user.findFirst({
                    where: {
                        email: { in: ['u1@test.com'] },
                    },
                }),
            ).toResolveTruthy();
        } else if (client.$schema.provider.type === 'postgresql') {
            // postgresql: default is case-sensitive, but can be toggled with "mode"

            await expect(
                client.user.findFirst({
                    where: { email: { equals: 'u1@Test.com' } },
                }),
            ).toResolveFalsy();
            await expect(
                client.user.findFirst({
                    where: {
                        email: { equals: 'u1@Test.com', mode: 'insensitive' } as any,
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.user.findFirst({
                    where: {
                        email: { contains: 'u1@Test.com' },
                    },
                }),
            ).toResolveFalsy();
            await expect(
                client.user.findFirst({
                    where: {
                        email: { contains: 'u1@Test.com', mode: 'insensitive' } as any,
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.user.findFirst({
                    where: {
                        email: { contains: '%u1', mode: 'insensitive' } as any,
                    },
                }),
            ).toResolveNull();
            await expect(
                client.user.findFirst({
                    where: {
                        email: { contains: 'u3%', mode: 'insensitive' } as any,
                    },
                }),
            ).toResolveTruthy();
            await expect(
                client.user.findFirst({
                    where: {
                        email: { contains: 'u3a', mode: 'insensitive' } as any,
                    },
                }),
            ).toResolveNull();

            await expect(
                client.user.findFirst({
                    where: {
                        email: { endsWith: 'Test.com' },
                    },
                }),
            ).toResolveFalsy();
            await expect(
                client.user.findFirst({
                    where: {
                        email: { endsWith: 'Test.com', mode: 'insensitive' } as any,
                    },
                }),
            ).toResolveTruthy();

            await expect(
                client.user.findFirst({
                    where: {
                        email: { in: ['u1@Test.com'] },
                    },
                }),
            ).toResolveFalsy();
            await expect(
                client.user.findFirst({
                    where: {
                        email: { in: ['u1@Test.com'], mode: 'insensitive' } as any,
                    },
                }),
            ).toResolveTruthy();
        }

        // in
        await expect(
            client.user.findFirst({
                where: { email: { in: [] } },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { email: { in: ['u1@test.com', 'u3@test.com'] } },
            }),
        ).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { email: { in: ['u3@test.com'] } },
            }),
        ).toResolveFalsy();

        // notIn
        await expect(
            client.user.findFirst({
                where: { email: { notIn: [] } },
            }),
        ).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { email: { notIn: ['u1@test.com', 'u2@test.com', 'u3%@test.com'] } },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { email: { notIn: ['u2@test.com'] } },
            }),
        ).toResolveTruthy();

        // lt/gt/lte/gte
        await expect(
            client.user.findMany({
                where: { email: { lt: 'a@test.com' } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { email: { lt: 'z@test.com' } },
            }),
        ).toResolveWithLength(3);
        await expect(
            client.user.findMany({
                where: { email: { lte: 'u1@test.com' } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.user.findMany({
                where: { email: { lte: 'u2@test.com' } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findMany({
                where: { email: { gt: 'a@test.com' } },
            }),
        ).toResolveWithLength(3);
        await expect(
            client.user.findMany({
                where: { email: { gt: 'z@test.com' } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { email: { gte: 'u1@test.com' } },
            }),
        ).toResolveWithLength(3);
        await expect(
            client.user.findMany({
                where: { email: { gte: 'u2@test.com' } },
            }),
        ).toResolveWithLength(2);

        // between
        await expect(
            client.user.findMany({
                where: { email: { between: ['a@test.com', 'a@test.com'] } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { email: { between: ['a@test.com', 'b@test.com'] } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { email: { between: ['z@test.com', 'a@test.com'] } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { email: { between: ['u1@test.com', 'u1@test.com'] } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.user.findMany({
                where: { email: { between: ['u2@test.com', 'u2@test.com'] } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.user.findMany({
                where: { email: { between: ['u1@test.com', 'u2@test.com'] } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findMany({
                where: { email: { between: ['u2@test.com', 'u3%@test.com'] } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findMany({
                where: { email: { between: ['a@test.com', 'u3%@test.com'] } },
            }),
        ).toResolveWithLength(3);
        await expect(
            client.user.findMany({
                where: { email: { between: ['a@test.com', 'z@test.com'] } },
            }),
        ).toResolveWithLength(3);
        await expect(
            client.user.findMany({
                where: { email: { between: ['u1@test.com', 'u3%@test.com'] } },
            }),
        ).toResolveWithLength(3);

        // contains
        await expect(
            client.user.findFirst({
                where: { email: { contains: '1@' } },
            }),
        ).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { email: { contains: '4@' } },
            }),
        ).toResolveFalsy();

        // startsWith
        await expect(
            client.user.findFirst({
                where: { email: { startsWith: 'u1@' } },
            }),
        ).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { email: { startsWith: '1@' } },
            }),
        ).toResolveFalsy();

        // endsWith
        await expect(
            client.user.findFirst({
                where: { email: { endsWith: '@test.com' } },
            }),
        ).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { email: { endsWith: '@test' } },
            }),
        ).toResolveFalsy();

        // not
        await expect(
            client.user.findFirst({
                where: { email: { not: { contains: 'test' } } },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { email: { not: { not: { contains: 'test' } } } },
            }),
        ).toResolveTruthy();

        // not null (issue #2472)
        await expect(
            client.user.findMany({
                where: { name: { not: null } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.user.findFirst({
                where: { name: { not: null } },
            }),
        ).resolves.toMatchObject({ id: user1.id });
    });

    it('supports numeric filters', async () => {
        await createUser('u1@test.com', {
            profile: { create: { id: '1', age: 20, bio: 'My bio' } },
        });
        await createUser('u2@test.com', {
            profile: { create: { id: '2', bio: 'My bio' } },
        });

        // equals
        await expect(client.profile.findFirst({ where: { age: 20 } })).resolves.toMatchObject({ id: '1' });
        await expect(client.profile.findFirst({ where: { age: { equals: 20 } } })).resolves.toMatchObject({
            id: '1',
        });
        await expect(client.profile.findFirst({ where: { age: { equals: 10 } } })).toResolveFalsy();
        await expect(client.profile.findFirst({ where: { age: null } })).resolves.toMatchObject({ id: '2' });
        await expect(client.profile.findFirst({ where: { age: { equals: null } } })).resolves.toMatchObject({
            id: '2',
        });

        // in
        await expect(client.profile.findFirst({ where: { age: { in: [] } } })).toResolveFalsy();
        await expect(client.profile.findFirst({ where: { age: { in: [20, 21] } } })).resolves.toMatchObject({
            id: '1',
        });
        await expect(client.profile.findFirst({ where: { age: { in: [21] } } })).toResolveFalsy();

        // notIn
        await expect(client.profile.findFirst({ where: { age: { notIn: [] } } })).toResolveTruthy();
        await expect(
            client.profile.findFirst({
                where: { age: { notIn: [20, 21] } },
            }),
        ).toResolveFalsy();
        await expect(client.profile.findFirst({ where: { age: { notIn: [21] } } })).toResolveTruthy();

        // lt/gt/lte/gte
        await expect(client.profile.findMany({ where: { age: { lt: 20 } } })).toResolveWithLength(0);
        await expect(client.profile.findMany({ where: { age: { lt: 21 } } })).toResolveWithLength(1);
        await expect(client.profile.findMany({ where: { age: { lte: 20 } } })).toResolveWithLength(1);
        await expect(client.profile.findMany({ where: { age: { lte: 19 } } })).toResolveWithLength(0);
        await expect(client.profile.findMany({ where: { age: { gt: 20 } } })).toResolveWithLength(0);
        await expect(client.profile.findMany({ where: { age: { gt: 19 } } })).toResolveWithLength(1);
        await expect(client.profile.findMany({ where: { age: { gte: 20 } } })).toResolveWithLength(1);
        await expect(client.profile.findMany({ where: { age: { gte: 21 } } })).toResolveWithLength(0);

        // between
        await expect(client.profile.findMany({ where: { age: { between: [20, 20] } } })).toResolveWithLength(1);
        await expect(client.profile.findMany({ where: { age: { between: [19, 20] } } })).toResolveWithLength(1);
        await expect(client.profile.findMany({ where: { age: { between: [20, 21] } } })).toResolveWithLength(1);
        await expect(client.profile.findMany({ where: { age: { between: [19, 19] } } })).toResolveWithLength(0);
        await expect(client.profile.findMany({ where: { age: { between: [21, 21] } } })).toResolveWithLength(0);
        await expect(client.profile.findMany({ where: { age: { between: [21, 20] } } })).toResolveWithLength(0);

        // not
        await expect(
            client.profile.findFirst({
                where: { age: { not: { equals: 20 } } },
            }),
        ).toResolveFalsy();
        await expect(
            client.profile.findFirst({
                where: { age: { not: { not: { equals: 20 } } } },
            }),
        ).toResolveTruthy();
        await expect(
            client.profile.findFirst({
                where: { age: { not: { equals: null } } },
            }),
        ).toResolveTruthy();
        await expect(
            client.profile.findFirst({
                where: { age: { not: { not: { equals: null } } } },
            }),
        ).toResolveTruthy();

        // not null shorthand (issue #2472)
        await expect(
            client.profile.findMany({
                where: { age: { not: null } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.profile.findFirst({
                where: { age: { not: null } },
            }),
        ).resolves.toMatchObject({ id: '1' });
    });

    it('supports boolean filters', async () => {
        const user = await createUser('u1@test.com', {
            profile: { create: { id: '1', age: 20, bio: 'My bio' } },
        });
        const [post1, post2] = await createPosts(user.id);

        // equals
        await expect(client.post.findFirst({ where: { published: true } })).resolves.toMatchObject(post1);
        await expect(
            client.post.findFirst({
                where: { published: { equals: false } },
            }),
        ).resolves.toMatchObject(post2);

        // not
        await expect(
            client.post.findFirst({
                where: { published: { not: { equals: true } } },
            }),
        ).resolves.toMatchObject(post2);
        await expect(
            client.post.findFirst({
                where: { published: { not: { not: { equals: true } } } },
            }),
        ).resolves.toMatchObject(post1);
    });

    it('supports date filters', async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 1);
        const future = new Date(now.getTime() + 2);
        const user1 = await createUser('u1@test.com', {
            createdAt: now,
        });
        const user2 = await createUser('u2@test.com', {
            createdAt: new Date(now.getTime() + 1),
        });

        // equals
        await expect(
            client.user.findFirst({
                where: { createdAt: user2.createdAt },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: { createdAt: user2.createdAt.toISOString() },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: { createdAt: { equals: user2.createdAt } },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: {
                    createdAt: { equals: user2.createdAt.toISOString() },
                },
            }),
        ).resolves.toMatchObject(user2);

        // in
        await expect(client.user.findFirst({ where: { createdAt: { in: [] } } })).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { createdAt: { in: [user2.createdAt] } },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: {
                    createdAt: { in: [user2.createdAt.toISOString()] },
                },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: { createdAt: { in: [new Date()] } },
            }),
        ).toResolveFalsy();

        // notIn
        await expect(client.user.findFirst({ where: { createdAt: { notIn: [] } } })).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { createdAt: { notIn: [user1.createdAt] } },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: {
                    createdAt: { notIn: [user1.createdAt.toISOString()] },
                },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: {
                    createdAt: {
                        notIn: [user1.createdAt, user2.createdAt],
                    },
                },
            }),
        ).toResolveFalsy();

        // lt/gt/lte/gte
        await expect(
            client.user.findFirst({
                where: { createdAt: { lt: user1.createdAt } },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { createdAt: { lt: user2.createdAt } },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findFirst({
                where: { createdAt: { lte: user1.createdAt } },
            }),
        ).resolves.toMatchObject(user1);
        await expect(
            client.user.findMany({
                where: { createdAt: { lte: user2.createdAt } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findFirst({
                where: { createdAt: { gt: user2.createdAt } },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { createdAt: { gt: user1.createdAt } },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findMany({
                where: { createdAt: { gte: user1.createdAt } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findFirst({
                where: { createdAt: { gte: user2.createdAt } },
            }),
        ).resolves.toMatchObject(user2);

        // between
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [user1.createdAt, user1.createdAt] } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [user1.createdAt, user2.createdAt] } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [user2.createdAt, user2.createdAt] } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [user2.createdAt, user1.createdAt] } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [past, past] } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [past, user1.createdAt] } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [past.toISOString(), user1.createdAt] } },
            }),
        ).toResolveWithLength(1);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [past, user2.createdAt] } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [past, future] } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [past.toISOString(), future.toISOString()] } },
            }),
        ).toResolveWithLength(2);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [future, past] } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [future, user1.createdAt] } },
            }),
        ).toResolveWithLength(0);
        await expect(
            client.user.findMany({
                where: { createdAt: { between: [future, future] } },
            }),
        ).toResolveWithLength(0);

        // not
        await expect(
            client.user.findFirst({
                where: { createdAt: { not: { equals: user1.createdAt } } },
            }),
        ).resolves.toMatchObject(user2);
        await expect(
            client.user.findFirst({
                where: {
                    createdAt: {
                        not: { not: { equals: user1.createdAt } },
                    },
                },
            }),
        ).resolves.toMatchObject(user1);
    });

    it('supports enum filters', async () => {
        await createUser();

        // equals
        await expect(client.user.findFirst({ where: { role: 'ADMIN' } })).toResolveTruthy();
        await expect(client.user.findFirst({ where: { role: 'USER' } })).toResolveFalsy();

        // in
        await expect(client.user.findFirst({ where: { role: { in: [] } } })).toResolveFalsy();
        await expect(client.user.findFirst({ where: { role: { in: ['ADMIN'] } } })).toResolveTruthy();
        await expect(client.user.findFirst({ where: { role: { in: ['USER'] } } })).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { role: { in: ['ADMIN', 'USER'] } },
            }),
        ).toResolveTruthy();

        // notIn
        await expect(client.user.findFirst({ where: { role: { notIn: [] } } })).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { role: { notIn: ['ADMIN'] } },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { role: { notIn: ['USER'] } },
            }),
        ).toResolveTruthy();
        await expect(
            client.user.findFirst({
                where: { role: { notIn: ['ADMIN', 'USER'] } },
            }),
        ).toResolveFalsy();

        // not
        await expect(
            client.user.findFirst({
                where: { role: { not: { equals: 'ADMIN' } } },
            }),
        ).toResolveFalsy();
        await expect(
            client.user.findFirst({
                where: { role: { not: { not: { equals: 'ADMIN' } } } },
            }),
        ).toResolveTruthy();
    });

    it('ignores undefined filters', async () => {
        await createUser();
        await expect(client.user.findMany({ where: { id: undefined } })).toResolveWithLength(1);
    });

    it('ignores undefined branch inside OR filters', async () => {
        await createUser('u1@test.com', {
            name: 'First',
            role: 'ADMIN',
            profile: { create: { id: 'p1', bio: 'bio1' } },
        });
        const user2 = await createUser('u2@test.com', {
            name: 'Second',
            role: 'USER',
            profile: { create: { id: 'p2', bio: 'bio2' } },
        });

        const baseline = await client.user.findFirst({
            where: {
                OR: [{ id: user2.id }],
            } as any,
            orderBy: { createdAt: 'asc' },
        });

        const withUndefinedBranch = await client.user.findFirst({
            where: {
                OR: [{ id: undefined }, { id: user2.id }],
            } as any,
            orderBy: { createdAt: 'asc' },
        });

        const onlyUndefinedBranch = await client.user.findFirst({
            where: {
                OR: [{ id: undefined }],
            } as any,
            orderBy: { createdAt: 'asc' },
        });

        expect(baseline?.email).toBe(user2.email);
        expect(withUndefinedBranch?.email).toBe(baseline?.email);
        expect(onlyUndefinedBranch).toBeNull();
    });

    it('strips undefined filter operators inside OR branches', async () => {
        await createUser('alice@test.com', { name: 'Alice', role: 'ADMIN' });
        await createUser('bob@test.com', { name: 'Bob', role: 'USER' });

        const result = await client.user.findMany({
            where: {
                OR: [{ name: { startsWith: 'A', contains: undefined } }],
            } as any,
        });

        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe('Alice');
    });

    describe('AND/OR/NOT with no-op filters', () => {
        beforeEach(async () => {
            await createUser('u1@test.com', { name: 'Alice', role: 'ADMIN' });
            await createUser('u2@test.com', { name: 'Bob', role: 'USER' });
        });

        it('AND is no-op for empty array, array with all-undefined object, and plain all-undefined object', async () => {
            await expect(client.user.findMany({ where: { AND: [] } })).toResolveWithLength(2);
            await expect(client.user.findMany({ where: { AND: [{ id: undefined }] } })).toResolveWithLength(2);
            await expect(client.user.findMany({ where: { AND: { id: undefined } } as any })).toResolveWithLength(2);
        });

        it('OR returns no records for empty array, array with all-undefined object, and plain all-undefined object', async () => {
            await expect(client.user.findMany({ where: { OR: [] } })).toResolveWithLength(0);
            await expect(client.user.findMany({ where: { OR: [{ id: undefined }] } })).toResolveWithLength(0);
        });

        it('NOT is no-op for empty array, array with all-undefined object, and plain all-undefined object', async () => {
            await expect(client.user.findMany({ where: { NOT: [] } })).toResolveWithLength(2);
            await expect(client.user.findMany({ where: { NOT: [{ id: undefined }] } })).toResolveWithLength(2);
            await expect(client.user.findMany({ where: { NOT: { id: undefined } } })).toResolveWithLength(2);
        });
    });

    // TODO: filter for bigint, decimal, bytes
});
