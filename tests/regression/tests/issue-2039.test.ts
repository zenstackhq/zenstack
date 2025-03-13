import { createPostgresDb, loadSchema } from '@zenstackhq/testtools';

describe('issue 2039', () => {
    it('regression', async () => {
        const dbUrl = await createPostgresDb('issue-2039');
        const { zodSchemas, enhance } = await loadSchema(
            `
type Foo {
    a String
}

model Bar {
    id         String   @id   @default(cuid())
    foo        Foo      @json @default("{ \\"a\\": \\"a\\" }")
    fooList    Foo[]    @json @default("[{ \\"a\\": \\"b\\" }]")
    @@allow('all', true)
}
            `,
            {
                fullZod: true,
                provider: 'postgresql',
                dbUrl,
            }
        );

        // Ensure default values are correctly set
        const db = enhance();
        await expect(db.bar.create({ data: {} })).resolves.toMatchObject({
            id: expect.any(String),
            foo: { a: 'a' },
            fooList: [{ a: 'b' }],
        });

        // Ensure Zod Schemas are correctly generated
        expect(
            zodSchemas.objects.BarCreateInputObjectSchema.safeParse({
                foo: { a: 'a' },
                fooList: [{ a: 'a' }],
            }).success
        ).toBeTruthy();
    });
});
