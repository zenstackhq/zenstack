import { createTestClient } from '@zenstackhq/testtools';
import { describe, it } from 'vitest';
import { schema } from './schema';

// https://github.com/zenstackhq/zenstack/issues/2788

describe('Regression for issue #2788', () => {
    it('Promise.all does not break upsert', async () => {
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
        console.log('User created:', user);

        const posts: any[] = await db.post.findMany();

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

        const postsUpdated = await db.post.findMany();
        console.log('posts upserted:', postsUpdated);
    });
});
