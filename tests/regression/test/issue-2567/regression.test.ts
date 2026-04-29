import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { schema } from './schema';
import type { PostUncheckedCreateInput } from './input';

// https://github.com/zenstackhq/zenstack/issues/2567
describe('Regression for issue #2567', () => {
    it('Partial<PostUncheckedCreateInput> can be spread alongside an explicit FK', async () => {
        const db = await createTestClient(schema);
        const user = await db.user.create({ data: { email: 'user@example.com' } });

        // Using PostUncheckedCreateInput (FK-only) for the partial type is the correct
        // pattern — mirrors Prisma's UncheckedCreateInput. No type error.
        async function buildPost(data: Partial<PostUncheckedCreateInput> = {}) {
            return db.post.create({
                data: {
                    title: 'Test Post',
                    content: 'Test Content',
                    authorId: user.id,
                    ...data,
                },
            });
        }

        const post = await buildPost();
        expect(post.title).toBe('Test Post');
        expect(post.authorId).toBe(user.id);

        const customPost = await buildPost({ title: 'Custom title' });
        expect(customPost.title).toBe('Custom title');

        const user2 = await db.user.create({ data: { email: 'user2@example.com' } });
        const postWithUser2 = await buildPost({ authorId: user2.id });
        expect(postWithUser2.authorId).toBe(user2.id);
    });
});
