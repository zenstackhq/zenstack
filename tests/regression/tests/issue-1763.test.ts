import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1763', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model Post {
                id   Int    @id @default(autoincrement())
                name String

                type String
                @@delegate(type)

                // full access by author
                @@allow('all', true)
            }

            model ConcretePost extends Post {
                age Int
            }
            `,
            {
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { PrismaClient as Prisma } from '@prisma/client';
import { enhance } from '@zenstackhq/runtime';

async function test() {
    const prisma = new Prisma();
    const db = enhance(prisma);
    await db.concretePost.create({
        data: {
            id: 5,
            name: 'a name',
            age: 20,
        },
    });
}                        `,
                    },
                ],
            }
        );
    });
});
