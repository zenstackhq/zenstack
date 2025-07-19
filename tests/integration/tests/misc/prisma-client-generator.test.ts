import { createProjectAndCompile, loadSchema } from '@zenstackhq/testtools';

const PRISMA_CLIENT_JS_GENERATOR = `
datasource db {
    provider = "sqlite"
    url = "file:./dev.db"
}

generator client {
    provider = "prisma-client-js"
}
`;

const PRISMA_CLIENT_GENERATOR = `
datasource db {
    provider = "sqlite"
    url = "file:./dev.db"
}

generator client {
    provider = "prisma-client"
    output = "../generated/prisma"
    moduleFormat = "cjs"
}
`;

describe.each([
    {
        isNewGenerator: false,
        generator: PRISMA_CLIENT_JS_GENERATOR,
        prismaLoadPath: '@prisma/client',
        clientLoadPath: '@prisma/client',
        modelsLoadPath: '@prisma/client',
        enumsLoadPath: '@prisma/client',
        enhanceLoadPath: '.zenstack/enhance',
        output: undefined,
    },
    {
        isNewGenerator: true,
        generator: PRISMA_CLIENT_GENERATOR,
        prismaLoadPath: './generated/prisma/client',
        clientLoadPath: './generated/zenstack/client',
        modelsLoadPath: './generated/zenstack/models',
        enumsLoadPath: './generated/zenstack/enums',
        enhanceLoadPath: './generated/zenstack/enhance',
        output: './generated/zenstack',
    },
])('Prisma-client generator tests', (config) => {
    describe('regular client', () => {
        it('exports expected modules', async () => {
            await createProjectAndCompile(
                `
            ${config.generator}

            enum Role {
                USER
                ADMIN
            }

            model User {
                id Int @id
                name String
                role Role
            }
            `,
                {
                    addPrelude: false,
                    output: config.output,
                    prismaLoadPath: config.prismaLoadPath,
                    extraSourceFiles: [
                        {
                            name: 'main.ts',
                            content: `
import { Prisma, type User } from '${config.clientLoadPath}';
${config.isNewGenerator ? "import type { UserModel } from '" + config.modelsLoadPath + "';" : ''}
import { Role } from '${config.enumsLoadPath}';

const user: User = { id: 1, name: 'Alice', role: Role.USER };
console.log(user);

${config.isNewGenerator ? "const user1: UserModel = { id: 1, name: 'Alice', role: 'USER' };\nconsole.log(user1);" : ''}

const role = Role.USER;
console.log(role);
                        `,
                        },
                    ],
                }
            );
        });

        it('works with client extension', async () => {
            await createProjectAndCompile(
                `
            ${config.generator}
            model User {
                id Int @id @default(autoincrement())
                email String
            }
            `,
                {
                    addPrelude: false,
                    output: config.output,
                    prismaLoadPath: config.prismaLoadPath,
                    extraSourceFiles: [
                        {
                            name: 'main.ts',
                            content: `
import { Prisma } from '${config.clientLoadPath}';
import { PrismaClient } from '${config.prismaLoadPath}';
import { enhance } from '${config.enhanceLoadPath}';

const prisma = new PrismaClient().$extends({
    model: {
        user: {
            async signUp(email: string) {
                return prisma.user.create({ data: { email } });
            },
        },
    },
});

async function main() {
    const db = enhance(prisma);
    const newUser = await db.user.signUp('user@test.com')
}

main()
                        `,
                        },
                    ],
                }
            );
        });
    });

    describe('logical client', () => {
        it('exports expected modules', async () => {
            await createProjectAndCompile(
                `
            ${config.generator}

            enum Role {
                USER
                ADMIN
            }

            model User {
                id Int @id
                name String
                role Role
            }

            model Post {
                id Int @id
                authorId Int @default(auth().id)
            }
            `,
                {
                    addPrelude: false,
                    output: config.output,
                    prismaLoadPath: config.prismaLoadPath,
                    extraSourceFiles: [
                        {
                            name: 'main.ts',
                            content: `
import { Prisma, type User } from '${config.clientLoadPath}';
${config.isNewGenerator ? "import type { UserModel } from '" + config.modelsLoadPath + "';" : ''}
import { Role } from '${config.enumsLoadPath}';

const user: User = { id: 1, name: 'Alice', role: Role.USER };
console.log(user);

${config.isNewGenerator ? "const user1: UserModel = { id: 1, name: 'Alice', role: 'USER' };\nconsole.log(user1);" : ''}

const role = Role.USER;
console.log(role);
                        `,
                        },
                    ],
                }
            );
        });

        it('works with client extension', async () => {
            await createProjectAndCompile(
                `
            ${config.generator}
            model User {
                id Int @id @default(autoincrement())
                email String
            }

            model Post {
                id Int @id @default(autoincrement())
                authorId Int @default(auth().id)
            }
            `,
                {
                    addPrelude: false,
                    output: config.output,
                    prismaLoadPath: config.prismaLoadPath,
                    extraSourceFiles: [
                        {
                            name: 'main.ts',
                            content: `
import { PrismaClient } from '${config.prismaLoadPath}';
import { enhance } from '${config.enhanceLoadPath}';

const prisma = new PrismaClient().$extends({
    model: {
        user: {
            async signUp(email: string) {
                return prisma.user.create({ data: { email } });
            },
        },
    },
});

async function main() {
    const db = enhance(prisma);
    const newUser = await db.user.signUp('user@test.com')
}

main()
                        `,
                        },
                    ],
                }
            );
        });

        it('works with `auth` in `@default`', async () => {
            const { enhance, prisma } = await loadSchema(
                `
            ${config.generator}

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
                    output: config.output,
                    compile: true,
                    prismaLoadPath: config.prismaLoadPath,
                    extraSourceFiles: [
                        {
                            name: 'main.ts',
                            content: `
import { PrismaClient } from '${config.prismaLoadPath}';
import { enhance } from '${config.enhanceLoadPath}';

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
            ${config.generator}

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
                    output: config.output,
                    compile: true,
                    prismaLoadPath: config.prismaLoadPath,
                    extraSourceFiles: [
                        {
                            name: 'main.ts',
                            content: `
import { PrismaClient } from '${config.prismaLoadPath}';
import { enhance } from '${config.enhanceLoadPath}';

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
});
