import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1991', () => {
    it('regression', async () => {
        await loadSchema(
            `
        type FooMetadata {
            isLocked Boolean
        }

        type FooOptionMetadata {
            color String
        }

        model Foo {
            id   String      @id @db.Uuid @default(uuid())
            meta FooMetadata @json
        }

        model FooOption {
            id   String            @id @db.Uuid @default(uuid())
            meta FooOptionMetadata @json
        }
            `,
            {
                provider: 'postgresql',
                pushDb: false,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
                        import { PrismaClient } from '@prisma/client';
                        import { enhance } from '.zenstack/enhance';

                        const prisma = new PrismaClient();
                        const db = enhance(prisma);

                        db.fooOption.create({
                            data: { meta: { color: 'red' } }
                        })
                        `,
                    },
                ],
            }
        );
    });
});
