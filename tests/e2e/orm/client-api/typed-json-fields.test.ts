import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestClient } from '@zenstackhq/testtools';

describe('Typed JSON fields', () => {
    const schema = `
type Identity {
    providers IdentityProvider[]
}

type IdentityProvider {
    id   String
    name String?
}

model User {
    id        Int       @id @default(autoincrement())
    identity  Identity? @json
}
    `;

    let client: any;

    beforeEach(async () => {
        client = await createTestClient(schema, {
            usePrismaPush: true,
        });
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('works with create', async () => {
        await expect(
            client.user.create({
                data: {},
            }),
        ).resolves.toMatchObject({
            identity: null,
        });

        await expect(
            client.user.create({
                data: {
                    identity: {
                        providers: [
                            {
                                id: '123',
                                name: 'Google',
                            },
                        ],
                    },
                },
            }),
        ).resolves.toMatchObject({
            identity: {
                providers: [
                    {
                        id: '123',
                        name: 'Google',
                    },
                ],
            },
        });

        await expect(
            client.user.create({
                data: {
                    identity: {
                        providers: [
                            {
                                id: '123',
                            },
                        ],
                    },
                },
            }),
        ).resolves.toMatchObject({
            identity: {
                providers: [
                    {
                        id: '123',
                    },
                ],
            },
        });

        await expect(
            client.user.create({
                data: {
                    identity: {
                        providers: [
                            {
                                id: '123',
                                foo: 1,
                            },
                        ],
                    },
                },
            }),
        ).resolves.toMatchObject({
            identity: {
                providers: [
                    {
                        id: '123',
                        foo: 1,
                    },
                ],
            },
        });

        await expect(
            client.user.create({
                data: {
                    identity: {
                        providers: [
                            {
                                name: 'Google',
                            },
                        ],
                    },
                },
            }),
        ).rejects.toThrow('data.identity.providers[0].id');
    });

    it('works with find', async () => {
        await expect(
            client.user.create({
                data: { id: 1 },
            }),
        ).toResolveTruthy();
        await expect(client.user.findUnique({ where: { id: 1 } })).resolves.toMatchObject({
            identity: null,
        });

        await expect(
            client.user.create({
                data: {
                    id: 2,
                    identity: {
                        providers: [
                            {
                                id: '123',
                                name: 'Google',
                            },
                        ],
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(client.user.findUnique({ where: { id: 2 } })).resolves.toMatchObject({
            identity: {
                providers: [
                    {
                        id: '123',
                        name: 'Google',
                    },
                ],
            },
        });
    });

    it('works with update', async () => {
        await expect(
            client.user.create({
                data: { id: 1 },
            }),
        ).toResolveTruthy();

        await expect(
            client.user.update({
                where: { id: 1 },
                data: {
                    identity: {
                        providers: [
                            {
                                id: '123',
                                name: 'Google',
                                foo: 1,
                            },
                        ],
                    },
                },
            }),
        ).resolves.toMatchObject({
            identity: {
                providers: [
                    {
                        id: '123',
                        name: 'Google',
                        foo: 1,
                    },
                ],
            },
        });

        await expect(
            client.user.update({
                where: { id: 1 },
                data: {
                    identity: {
                        providers: [
                            {
                                name: 'GitHub',
                            },
                        ],
                    },
                },
            }),
        ).rejects.toThrow(/invalid/i);
    });

    it('rejects unknown fields when type is strict', async () => {
        const schema = `
type Profile {
    name String

    @@strict
}

model User {
    id       Int       @id @default(autoincrement())
    profile  Profile? @json
}
    `;

        const client = await createTestClient(schema, {
            usePrismaPush: true,
        });

        try {
            await expect(
                client.user.create({
                    data: {
                        profile: {
                            name: 'Test',
                            unknown: true,
                        },
                    },
                }),
            ).rejects.toThrowError(/Unrecognized key: "unknown"/);
        } finally {
            await client.$disconnect();
        }
    });
});
