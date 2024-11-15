import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1843', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model User {
                id              String    @id @default(cuid())
                email           String    @unique @email @length(6, 32)
                password        String    @password @omit
                contents        Content[]
                postsCoauthored PostWithCoauthor[]

                @@allow('all', true)
            }

            abstract model Owner {
                owner   User   @relation(fields: [ownerId], references: [id])
                ownerId String @default(auth().id)
            }

            abstract model BaseContent extends Owner {
                published Boolean @default(false)

                @@index([published])
            }

            model Content extends BaseContent {
                id          String   @id @default(cuid())
                createdAt   DateTime @default(now())
                updatedAt   DateTime @updatedAt

                contentType String
                @@allow('all', true)

                @@delegate(contentType)
            }

            model PostWithCoauthor extends Content {
                title      String

                coauthor   User   @relation(fields: [coauthorId], references: [id])
                coauthorId String

                @@allow('all', true)
                }

                model Post extends Content {
                title      String

                @@allow('all', true)
            }
            `,
            {
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
            import { PrismaClient } from '@prisma/client';
            import { enhance } from '.zenstack/enhance';

            async function main() {
                const enhanced = enhance(new PrismaClient());
                await enhanced.postWithCoauthor.create({
                    data: {
                        title: "new post",
                        coauthor: {
                            connect: {
                                id: "1"
                            }
                        },
                    }
                });

                await enhanced.postWithCoauthor.create({
                    data: {
                        title: "new post",
                        coauthorId: "1"
                    }
                }); 
            }
            `,
                    },
                ],
            }
        );
    });
});
