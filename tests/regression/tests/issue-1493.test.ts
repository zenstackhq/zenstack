import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1493', () => {
    it('regression', async () => {
        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url = 'file:./dev.db'
            }

            generator js {
                provider = 'prisma-client-js'
            }

            plugin enhancer {
                provider = '@core/enhancer'
                output = './zenstack'
            }
            
            model User {
                id Int @id
                email String
                posts Post[]
            }

            model Post {
                id Int @id
                title String
                content String
                author User @relation(fields: [authorId], references: [id])
                authorId Int @default(auth().id)
            }
            `,
            {
                addPrelude: false,
                compile: true,
                getPrismaOnly: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
            import { PrismaClient } from '@prisma/client';
            import { enhance } from './zenstack/enhance';
            const prisma = new PrismaClient().$extends({
                result: {
                    user: {
                        gravatarUrl: {
                            needs: { email: true },
                            compute(user) {
                                return user.email + 'hash';
                            },
                        },
                    },
                },
            });

            prisma.user.findFirst().then((user) => user?.gravatarUrl);
            const db = enhance(prisma, undefined, { kinds: [] });
            db.user.findFirst().then((user) => user?.gravatarUrl);
                        `,
                    },
                ],
            }
        );
    });
});
