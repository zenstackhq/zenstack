import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { schema } from './schema';

// https://github.com/zenstackhq/zenstack/issues/2788

describe('Regression for issue #2788', () => {
    it('does not error during concurrent upserts', async () => {
        const db = await createTestClient(schema);
        const user = await db.user.create({
            data: {
                email: 'test@zenstack.dev',
                posts: {
                    create: [
                        {
                            title: 'Post 1',
                            content: 'This is a test post',
                        },
                    ],
                },
            },
            include: { posts: true },
        });

        let posts: any[] = await db.post.findMany();

        posts[0].title = 'Post 1 Updated';

        posts.push({
            id: 'cmstai1q2000104js3i7s2d8l',
            title: 'Post 2',
            content: 'This is a test post',
            authorId: user.id,
        });

        await Promise.all(
            posts.map(async (p) => {
                await db.post.upsert({
                    where: { id: p.id },
                    update: { ...p },
                    create: { title: p.title!, content: p.content!, authorId: p.authorId! },
                });
            }),
        );

        posts = await db.post.findMany();

        expect(posts.find((p) => p.title === 'Post 1 Updated')).toMatchObject({
            title: 'Post 1 Updated',
            content: 'This is a test post',
            published: false,
        });

        expect(posts.find((p) => p.title === 'Post 2')).toMatchObject({
            title: 'Post 2',
            content: 'This is a test post',
            published: false,
        });

        await expect(
            db.post.findUnique({
                where: {
                    id: 'cmstai1q2000104js3i7s2d8l',
                },
            }),
        ).resolves.toBeNull();
    });
});
