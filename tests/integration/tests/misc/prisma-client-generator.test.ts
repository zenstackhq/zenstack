import { loadSchema } from '@zenstackhq/testtools';

describe('New prisma-client generator tests', () => {
    it('works with `auth` in `@default`', async () => {
        const { enhance, prisma } = await loadSchema(
            `
            datasource db {
                provider = "sqlite"
                url = "file:./dev.db"
            }

            generator client {
                provider = "prisma-client"
                output = "./prisma-generated"
                moduleFormat = "cjs"
            }

            model User {
                id Int @id
                posts Post[]
                @@allow('all', true)
            }
            
            model Post {
                id Int @id
                title String
                author User @relation(fields: [authorId], references: [id])
                authorId Int @default(auth().id)
                @@allow('all', true)
            }
            `,
            {
                addPrelude: false,
                output: './zenstack',
                compile: true,
                prismaLoadPath: './prisma/prisma-generated/client',
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { PrismaClient } from './prisma/prisma-generated/client';
import { enhance } from './zenstack/enhance';

const prisma = new PrismaClient();
const db = enhance(prisma);

async function main() {
    const post = await db.post.create({ data: { id: 1, title: 'Hello World' } });
    console.log(post.authorId);
}

main();
`,
                    },
                ],
            }
        );

        const user = await prisma.user.create({ data: { id: 1 } });
        const db = enhance({ id: user.id });
        await expect(db.post.create({ data: { id: 1, title: 'Hello World' } })).resolves.toMatchObject({
            authorId: user.id,
        });
    });

    it('works with delegate models', async () => {
        const { enhance } = await loadSchema(
            `
            datasource db {
                provider = "sqlite"
                url = "file:./dev.db"
            }

            generator client {
                provider = "prisma-client"
                output = "./prisma-generated"
                moduleFormat = "cjs"
            }

            model Asset {
                id Int @id
                name String
                type String
                @@delegate(type)
            }

            model Post extends Asset {
                title String
            }
            `,
            {
                enhancements: ['delegate'],
                addPrelude: false,
                output: './zenstack',
                compile: true,
                prismaLoadPath: './prisma/prisma-generated/client',
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { PrismaClient } from './prisma/prisma-generated/client';
import { enhance } from './zenstack/enhance';

const prisma = new PrismaClient();
const db = enhance(prisma);

async function main() {
    const post = await db.post.create({ data: { id: 1, name: 'Test Post', title: 'Hello World' } });
    console.log(post.type, post.name, post.title);
}

main();
`,
                    },
                ],
            }
        );

        const db = enhance();
        await expect(
            db.post.create({ data: { id: 1, name: 'Test Post', title: 'Hello World' } })
        ).resolves.toMatchObject({ id: 1, name: 'Test Post', type: 'Post', title: 'Hello World' });
    });
});
