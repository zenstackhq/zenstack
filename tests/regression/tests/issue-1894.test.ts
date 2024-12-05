import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1894', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
        model A {
            id Int @id @default(autoincrement())
            b  B[]
        }

        model B {
            id   Int    @id @default(autoincrement())
            a    A      @relation(fields: [aId], references: [id])
            aId  Int

            type String
            @@delegate(type)
        }

        model C extends B {
            f String?
        }
            `,
            {
                enhancements: ['delegate'],
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
        import { enhance } from '.zenstack/enhance';
        import { PrismaClient } from '@prisma/client';

        async function main() {
            const db = enhance(new PrismaClient());
            await db.a.create({ data: { id: 0 } });
            await db.c.create({ data: { a: { connect: { id: 0 } } } });
        }

        main();

                        `,
                    },
                ],
            }
        );

        const db = enhance();
        await db.a.create({ data: { id: 0 } });
        await expect(db.c.create({ data: { a: { connect: { id: 0 } } } })).toResolveTruthy();
    });
});
