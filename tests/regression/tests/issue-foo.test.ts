import { loadSchema } from '@zenstackhq/testtools';

describe('issue [...]', () => {
    it('regression', async () => {
        const { zodSchemas } = await loadSchema(
            `
            enum FooType {
                Bar
                Baz
            }
            type Meta {
                test String?
            }
            model Foo {
                id   String  @id @db.Uuid @default(uuid())
                type FooType
                meta Meta @json
                @@validate(type == Bar, "FooType must be Bar")
            }
            `,
            {
                provider: 'postgresql',
                pushDb: false,
            }
        );
        expect(
            zodSchemas.models.FooSchema.safeParse({
                id: '123e4567-e89b-12d3-a456-426614174000',
                type: 'Bar',
                meta: { test: 'test' },
            })
        ).toMatchObject({
            success: true,
        });
    });
});
