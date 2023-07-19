import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('View Policy Test', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('view policy', async () => {
        const { prisma, withPolicy } = await loadSchema(
            `
            datasource db {
                provider = "sqlite"
                url      = "file:./dev.db"
              }
              
              generator client {
                provider        = "prisma-client-js"
                previewFeatures = ["views"]
              }

              model User {
                id    Int     @id @default(autoincrement())
                email String  @unique
                name  String?
                posts Post[]
                userInfo UserInfo?
            }
              
            model Post {
                id        Int     @id @default(autoincrement())
                title     String
                content   String?
                published Boolean @default(false)
                author    User?   @relation(fields: [authorId], references: [id])
                authorId  Int?
            }
              
            view UserInfo {
                id Int    @unique
                name String
                email String
                postCount Int
                user      User   @relation(fields: [id], references: [id])

                @@allow('read', postCount > 1)
            }
            `,
            { addPrelude: false }
        );

        await prisma.$executeRaw`CREATE VIEW UserInfo as select user.id, user.name, user.email, user.id as userId, count(post.id) as postCount from user left join post on user.id = post.authorId group by user.id;`;

        await prisma.user.create({
            data: {
                email: 'alice@prisma.io',
                name: 'Alice',
                posts: {
                    create: {
                        title: 'Check out Prisma with Next.js',
                        content: 'https://www.prisma.io/nextjs',
                        published: true,
                    },
                },
            },
        });
        await prisma.user.create({
            data: {
                email: 'bob@prisma.io',
                name: 'Bob',
                posts: {
                    create: [
                        {
                            title: 'Follow Prisma on Twitter',
                            content: 'https://twitter.com/prisma',
                            published: true,
                        },
                        {
                            title: 'Follow Nexus on Twitter',
                            content: 'https://twitter.com/nexusgql',
                            published: false,
                        },
                    ],
                },
            },
        });

        const db = withPolicy();

        await expect(prisma.userInfo.findMany()).resolves.toHaveLength(2);
        await expect(db.userInfo.findMany()).resolves.toHaveLength(1);

        const r1 = await prisma.userInfo.findFirst({ include: { user: true } });
        expect(r1.user).toBeTruthy();

        // user not readable
        await expect(db.userInfo.findFirst({ include: { user: true } })).toBeRejectedByPolicy();
    });
});
