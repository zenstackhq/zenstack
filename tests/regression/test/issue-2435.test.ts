import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2435
describe('Regression for issue 2435', () => {
    it('should not throw cyclic dependency error when delegate model has a self-referential relation', async () => {
        await expect(
            createTestClient(
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
    post1s   Post1[]
    replies  Post[]  @relation("PostReplies")
    parentId Int?
    parent   Post?   @relation("PostReplies", fields: [parentId], references: [id])
}

model Post1 extends Content {
    post   Post @relation(fields: [postId], references: [id])
    postId Int
}
        `,
            ),
        ).toResolveTruthy();
    });
});
