import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/custom-type-primitive/schema';
import { createTestClient } from '@zenstackhq/testtools';

describe('Custom type primitive tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema, {
            provider: 'postgresql',
        });
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('works with scalars', async () => {
        await expect(
            client.user.create({
                data: {
                    name: 'test',
                },
            }),
        ).resolves.toMatchObject({
            name: 'test',
        });

        await expect(
            client.user.create({
                data: {
                    name: 't',
                },
            }),
        ).rejects.toThrow(/Too small/);

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    age: 17,
                },
            }),
        ).rejects.toThrow(/Too small/);
    });

    it('works with arrays', async () => {
        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    contacts: ['+15555555555'],
                },
            }),
        ).resolves.toMatchObject({
            name: 'test',
            contacts: ['+15555555555'],
        });

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    contacts: ['15555555555'],
                },
            }),
        ).rejects.toThrow(/Invalid E.164/);

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    posts: {
                        create: {
                            tags: ['abc', '123'],
                        },
                    },
                },

                include: {
                    posts: true,
                },
            }),
        ).resolves.toMatchObject({
            name: 'test',
            posts: [
                {
                    tags: ['abc', '123'],
                },
            ],
        });

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    posts: {
                        create: {
                            tags: [''],
                        },
                    },
                },
            }),
        ).rejects.toThrow(/Too small/);

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    posts: {
                        create: {
                            tags: ['', ''],
                        },
                    },
                },
            }),
        ).rejects.toThrow(/Too small/);

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    posts: {
                        create: {
                            tags: ['a'],
                        },
                    },
                },
            }),
        ).rejects.toThrow(/Too small/);

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    posts: {
                        create: {
                            tags: [],
                        },
                    },
                },
            }),
        ).rejects.toThrow(/Too small/);

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    posts: {
                        create: {
                            tags: ['abc', '123', 'xyz', 'def'],
                        },
                    },
                },
            }),
        ).rejects.toThrow(/Too big/);

        await expect(
            client.user.create({
                data: {
                    name: 'test',
                    posts: {
                        create: {
                            tags: ['abcdefghijklm'],
                        },
                    },
                },
            }),
        ).rejects.toThrow(/Too big/);
    });
});
