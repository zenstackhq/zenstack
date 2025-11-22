import { loadSchema } from '@zenstackhq/testtools';

describe('Issue 2291', () => {
    it('should work', async () => {
        const { zodSchemas } = await loadSchema(
            `
enum SomeEnum {
    Ex1
    Ex2
}

/// Post model
model Post {
    id        String   @id @default(cuid())
    e SomeEnum @default(Ex1)
}
`,
            { fullZod: true }
        );

        expect(zodSchemas.models.PostSchema.parse({ id: '1' })).toEqual({ id: '1', e: 'Ex1' });
    });
});
