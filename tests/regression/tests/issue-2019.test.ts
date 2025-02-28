import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2019', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model Tenant {
                id      String    @id @default(uuid())

                users   User[]
                content Content[]
            }

            model User {
                id       String          @id @default(uuid())
                tenantId String          @default(auth().tenantId)
                tenant   Tenant          @relation(fields: [tenantId], references: [id])
                posts    Post[]
                likes    PostUserLikes[]

                @@allow('all', true)
            }

            model Content {
                tenantId    String @default(auth().tenantId)
                tenant      Tenant @relation(fields: [tenantId], references: [id])
                id          String @id @default(uuid())
                contentType String

                @@delegate(contentType)
                @@allow('all', true)
            }

            model Post extends Content {
                author   User            @relation(fields: [authorId], references: [id])
                authorId String          @default(auth().id)

                comments Comment[]
                likes    PostUserLikes[]

                @@allow('all', true)
            }

            model PostUserLikes extends Content {
                userId String
                user   User   @relation(fields: [userId], references: [id])

                postId String
                post   Post   @relation(fields: [postId], references: [id])

                @@unique([userId, postId])

                @@allow('all', true)
            }

            model Comment extends Content {
                postId String
                post   Post   @relation(fields: [postId], references: [id])

                @@allow('all', true)
            }
            `,
            { logPrismaQuery: true }
        );

        const tenant = await prisma.tenant.create({ data: {} });
        const user = await prisma.user.create({ data: { tenantId: tenant.id } });
        const db = enhance({ id: user.id, tenantId: tenant.id });
        const result = await db.post.create({
            data: {
                likes: {
                    createMany: {
                        data: [
                            {
                                userId: user.id,
                            },
                        ],
                    },
                },
            },
            include: {
                likes: true,
            },
        });
        expect(result.likes[0].tenantId).toBe(tenant.id);
    });
});
