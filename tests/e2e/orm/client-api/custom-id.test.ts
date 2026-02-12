import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

const schema = `
    model User {
        uid      String  @id @default(customId())
        posts Post[]
    }

    model Post {
        pid      String  @id @default(customId())
        userId String?
        user User? @relation(fields: [userId], references: [uid])
        comments Comment[]
    }

    model Comment {
        cid      String  @id @default(customId())
        postId String?
        post Post? @relation(fields: [postId], references: [pid])
    }
`;

describe('customId', () => {
    it('works with no arguments', async () => {
        const client = await createTestClient(schema, {
            customId: ({ model, field, length }) => `${model}.${field}.${length ?? 16}`,
        });

        await expect(client.user.create({ data: {} })).resolves.toMatchObject({
            uid: 'User.uid.16',
        });

        await expect(client.post.create({ data: {} })).resolves.toMatchObject({
            pid: 'Post.pid.16',
        });

        await expect(client.comment.create({ data: {} })).resolves.toMatchObject({
            cid: 'Comment.cid.16',
        });
    });

    it('works with arguments', async () => {
        const schema = `
            model User {
                uid      String  @id @default(customId(8))
                posts Post[]
            }

            model Post {
                pid      String  @id @default(customId(8))
                userId String?
                user User? @relation(fields: [userId], references: [uid])
                comments Comment[]
            }

            model Comment {
                cid      String  @id @default(customId(8))
                postId String?
                post Post? @relation(fields: [postId], references: [pid])
            }
        `;

        const client = await createTestClient(schema, {
            customId: ({ model, field, length }) => `${model}.${field}.${length}`,
        });

        await expect(client.user.create({ data: {} })).resolves.toMatchObject({
            uid: 'User.uid.8',
        });

        await expect(client.post.create({ data: {} })).resolves.toMatchObject({
            pid: 'Post.pid.8',
        });

        await expect(client.comment.create({ data: {} })).resolves.toMatchObject({
            cid: 'Comment.cid.8',
        });
    });

    it('works with nested', async () => {
        const client = await createTestClient(schema, {
            customId: ({ model, field, length }) => `${model}.${field}.${length ?? 16}`,
        });

        await expect(client.user.create({
            data: {
                posts: {
                    create: {},
                },
            },
        })).resolves.toMatchObject({
            uid: 'User.uid.16',
        });

        await expect(client.post.findUnique({
            where: {
                pid: 'Post.pid.16',
            }
        })).resolves.toBeTruthy();
    });

    it('works with deeply nested', async () => {
        const client = await createTestClient(schema, {
            customId: ({ model, field, length }) => `${model}.${field}.${length ?? 16}`,
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
            uid: 'User.uid.16',
        });

        await expect(client.post.findUnique({
            where: {
                pid: 'Post.pid.16',
            }
        })).resolves.toBeTruthy();

        await expect(client.comment.findUnique({
            where: {
                cid: 'Comment.cid.16',
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
