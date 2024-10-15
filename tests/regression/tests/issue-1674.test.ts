import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1674', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id       String @id @default(cuid())
                email    String @unique @email @length(6, 32)
                password String @password @omit
                posts    Post[]

                // everybody can signup
                @@allow('create', true)

                // full access by self
                @@allow('all', auth() == this)
            }

            model Blog {
                id        String   @id @default(cuid())
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt

                post      Post? @relation(fields: [postId], references: [id], onDelete: Cascade)
                postId String?
            }

            model Post {
                id        String   @id @default(cuid())
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
                title     String   @length(1, 256)
                content   String
                published Boolean  @default(false)
                author    User     @relation(fields: [authorId], references: [id])
                authorId  String

                blogs Blog[] 

                type String

                // allow read for all signin users
                @@allow('read', auth() != null && published)

                // full access by author
                @@allow('all', author == auth())

                @@delegate(type)
            }

            model PostA extends Post {
            }

            model PostB extends Post {
            }
            `
        );

        const user = await prisma.user.create({
            data: { email: 'abc@def.com', password: 'password' },
        });

        const blog = await prisma.blog.create({
            data: {},
        });

        const db = enhance(user);
        await expect(
            db.postA.create({
                data: {
                    content: 'content',
                    title: 'title',
                    blogs: {
                        connect: {
                            id: blog.id,
                        },
                    },
                    author: {
                        connect: {
                            id: user.id,
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });
});
