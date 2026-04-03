import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2452
describe('Regression for issue 2452', () => {
    it('should return correct _count for self-referential relations in delegate models', async () => {
        const db = await createTestClient(
            `
enum ContentType {
    POST
    ARTICLE
    QUESTION
}

model Content {
    id   Int         @id @default(autoincrement())
    type ContentType
    @@delegate(type)
}

model Post extends Content {
    replies  Post[]  @relation("PostReplies")
    parentId Int?
    parent   Post?   @relation("PostReplies", fields: [parentId], references: [id])
}
        `,
        );

        // Create a parent post with 2 replies
        const parent = await db.post.create({
            data: {
                replies: {
                    create: [{}, {}],
                },
            },
        });

        // Query with _count should return the correct count
        const result = await db.post.findFirst({
            where: { id: parent.id },
            include: { _count: { select: { replies: true } } },
        });

        expect(result).toBeTruthy();
        expect(result._count.replies).toBe(2);
    });
});
