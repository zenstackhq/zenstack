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
        expect(zodSchemas.models.FooSchema).toBeTruthy();
    });
});
