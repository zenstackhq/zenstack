import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

const schema = `
    model User {
        id      String  @id @default(customId())
        posts Post[]
    }

    model Post {
        id      String  @id @default(customId())
        userId String?
        user User? @relation(fields: [userId], references: [id])
        comments Comment[]
    }

    model Comment {
        id      String  @id @default(customId())
        postId String?
        post Post? @relation(fields: [postId], references: [id])
    }
`;

describe('customId', async () => {
    it('works with no arguments', async () => {
        const client = await createTestClient(schema, {
            customId: ({ model, length }) => `${model}.${length ?? 16}`,
        });

        await expect(client.user.create({ data: {} })).resolves.toMatchObject({
            id: 'User.16',
        });

        await expect(client.post.create({ data: {} })).resolves.toMatchObject({
            id: 'Post.16',
        });

        await expect(client.comment.create({ data: {} })).resolves.toMatchObject({
            id: 'Comment.16',
        });
    });

    it('works with arguments', async () => {
        const schema = `
            model User {
                id      String  @id @default(customId(8))
                posts Post[]
            }

            model Post {
                id      String  @id @default(customId(8))
                userId String?
                user User? @relation(fields: [userId], references: [id])
                comments Comment[]
            }

            model Comment {
                id      String  @id @default(customId(8))
                postId String?
                post Post? @relation(fields: [postId], references: [id])
            }
        `;

        const client = await createTestClient(schema, {
            customId: ({ model, length }) => `${model}.${length}`,
        });

        await expect(client.user.create({ data: {} })).resolves.toMatchObject({
            id: 'User.8',
        });

        await expect(client.post.create({ data: {} })).resolves.toMatchObject({
            id: 'Post.8',
        });

        await expect(client.comment.create({ data: {} })).resolves.toMatchObject({
            id: 'Comment.8',
        });
    });

    it('works with nested', async () => {
        const client = await createTestClient(schema, {
            customId: ({ model, length }) => `${model}.${length ?? 16}`,
        });

        await expect(client.user.create({
            data: {
                posts: {
                    create: {},
                },
            },
        })).resolves.toMatchObject({
            id: 'User.16',
        });

        await expect(client.post.findUnique({
            where: {
                id: 'Post.16',
            }
        })).resolves.toBeTruthy();
    });

    it('works with deeply nested', async () => {
        const client = await createTestClient(schema, {
            customId: ({ model, length }) => `${model}.${length ?? 16}`,
        });

        await expect(client.user.create({
            data: {
                posts: {
                    create: {
                        comments: {
                            create: {},
                        },
                    },
                },
            },
        })).resolves.toMatchObject({
            id: 'User.16',
        });

        await expect(client.post.findUnique({
            where: {
                id: 'Post.16',
            }
        })).resolves.toBeTruthy();

        await expect(client.comment.findUnique({
            where: {
                id: 'Comment.16',
            }
        })).resolves.toBeTruthy();
    });

    it('rejects without an implementation', async () => {
        const client = await createTestClient(schema);
        await expect(client.user.create({ data: {} })).rejects.toThrowError('implementation not provided');
    });

    it('rejects without a valid implementation (undefined)', async () => {
        // @ts-expect-error
        const client = await createTestClient(schema, {
            customId: () => undefined,
        });
        // @ts-expect-error
        await expect(client.user.create({ data: {} })).rejects.toThrowError('non-empty string');
    });

    it('rejects without a valid implementation (empty string)', async () => {
        const client = await createTestClient(schema, {
            customId: () => '',
        });
        await expect(client.user.create({ data: {} })).rejects.toThrowError('non-empty string');
    });

    it('rejects without a valid implementation (non-string)', async () => {
        // @ts-expect-error
        const client = await createTestClient(schema, {
            customId: () => 1,
        });
        // @ts-expect-error
        await expect(client.user.create({ data: {} })).rejects.toThrowError('non-empty string');
    });
});
