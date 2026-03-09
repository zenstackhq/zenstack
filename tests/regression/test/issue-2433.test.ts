import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2433
describe('Regression for issue 2433', () => {
    it('should accept short string when only @length(max: N) is specified', async () => {
        const db = await createTestClient(
            `
model Post {
    id      String @id @default(cuid())
    content String @length(max: 10000)
}
            `,
        );
        // Should succeed: short content is within max limit
        await expect(db.post.create({ data: { content: 'hello' } })).resolves.toMatchObject({
            content: 'hello',
        });
        // Should fail validation: content exceeds max
        await expect(
            db.post.create({ data: { content: 'x'.repeat(10001) } }),
        ).toBeRejectedByValidation();
    });

    it('should reject short string when only @length(min: N) is specified', async () => {
        const db = await createTestClient(
            `
model Post {
    id      String @id @default(cuid())
    content String @length(min: 5)
}
            `,
        );
        // Should succeed: content meets min length
        await expect(db.post.create({ data: { content: 'hello world' } })).resolves.toMatchObject({
            content: 'hello world',
        });
        // Should fail validation: content is too short
        await expect(
            db.post.create({ data: { content: 'hi' } }),
        ).toBeRejectedByValidation();
    });
});
