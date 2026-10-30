import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/basic';
import { createTestClient } from '@zenstackhq/testtools';

describe('Client exists tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('works with no args', async () => {
        await expect(client.user.exists()).resolves.toBe(false);

        await client.user.create({
            data: {
                email: 'test@email.com',
            },
        });

        await expect(client.user.exists()).resolves.toBe(true);
    });

    it('works with empty args', async () => {
        await expect(client.user.exists({})).resolves.toBe(false);

        await client.user.create({
            data: {
                email: 'test@email.com',
            },
        });

        await expect(client.user.exists({})).resolves.toBe(true);
    });

    it('works with empty where', async () => {
        await expect(client.user.exists({ where: {} })).resolves.toBe(false);

        await client.user.create({
            data: {
                email: 'test@email.com',
            },
        });

        await expect(client.user.exists({ where: {} })).resolves.toBe(true);
    });

    it('works with toplevel', async () => {
        await client.user.create({
            data: {
                email: 'test@email.com',
            },
        });

        await expect(
            client.user.exists({
                where: {
                    email: 'test@email.com',
                },
            }),
        ).resolves.toBe(true);

        await expect(
            client.user.exists({
                where: {
                    email: 'wrong@email.com',
                },
            }),
        ).resolves.toBe(false);
    });

    it('works with nested', async () => {
        await client.user.create({
            data: {
                email: 'test@email.com',
                posts: {
                    create: {
                        title: 'Test title',
                    },
                },
            },
        });

        await expect(
            client.user.exists({
                where: {
                    posts: {
                        some: {
                            title: 'Test title',
                        },
                    },
                },
            }),
        ).resolves.toBe(true);

        await expect(
            client.user.exists({
                where: {
                    posts: {
                        some: {
                            title: 'Wrong test title',
                        },
                    },
                },
            }),
        ).resolves.toBe(false);

        await expect(
            client.post.exists({
                where: {
                    title: 'Test title',
                },
            }),
        ).resolves.toBe(true);

        await expect(
            client.post.exists({
                where: {
                    title: 'Wrong test title',
                },
            }),
        ).resolves.toBe(false);
    });

    it('works with deeply nested', async () => {
        await client.user.create({
            data: {
                email: 'test@email.com',
                posts: {
                    create: {
                        title: 'Test title',
                        comments: {
                            create: {
                                content: 'Test content',
                            },
                        },
                    },
                },
            },
        });

        await expect(
            client.user.exists({
                where: {
                    posts: {
                        some: {
                            title: 'Test title',
                            comments: {
                                some: {
                                    content: 'Test content',
                                },
                            },
                        },
                    },
                },
            }),
        ).resolves.toBe(true);

        await expect(
            client.user.exists({
                where: {
                    posts: {
                        some: {
                            title: 'Test title',
                            comments: {
                                some: {
                                    content: 'Wrong test content',
                                },
                            },
                        },
                    },
                },
            }),
        ).resolves.toBe(false);

        await expect(
            client.user.exists({
                where: {
                    posts: {
                        some: {
                            title: 'Wrong test title',
                            comments: {
                                some: {
                                    content: 'Test content',
                                },
                            },
                        },
                    },
                },
            }),
        ).resolves.toBe(false);
    });
});
