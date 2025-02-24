import { loadSchema } from '@zenstackhq/testtools';

describe('Enhancement typing tests', () => {
    it('infers correct typing', async () => {
        await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                posts Post[]
            }
            
            model Post {
                id Int @id @default(autoincrement())
                title String
                author User @relation(fields: [authorId], references: [id])
                authorId Int @default(auth().id)
            }
            `,
            {
                pushDb: false,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { PrismaClient } from '@prisma/client';
import type { Enhanced } from '.zenstack/enhance';

async function withoutClientExtension() {
    const prisma = new PrismaClient();
    const db = {} as any as Enhanced<typeof prisma>;
    // note that "author" becomes optional
    const r = await db.post.create({ data: { title: 'Post1' }});
    console.log(r);
}

async function withClientExtension() {
    const prisma = (new PrismaClient())
        .$extends({
            client: {
                $log: (message: string) => {
                    console.log(message);
                },
            },
        });
    const db = {} as any as Enhanced<typeof prisma>;
    // note that "author" becomes optional
    const r = await db.post.create({ data: { title: 'Post1' }});
    console.log(r);

    // note that "$log" is preserved
    db.$log('hello');
}
                        `,
                    },
                ],
            }
        );
    });
});
