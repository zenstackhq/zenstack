import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1997', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model Tenant {
                id            String          @id @default(uuid())
            
                users         User[]
                posts         Post[]
                comments      Comment[]
                postUserLikes PostUserLikes[]
            }
            
            model User {
                id       String          @id @default(uuid())
                tenantId String          @default(auth().tenantId)
                tenant   Tenant          @relation(fields: [tenantId], references: [id])
                posts    Post[]
                likes    PostUserLikes[]
            
                @@allow('all', true)
            }
            
            model Post {
                tenantId String          @default(auth().tenantId)
                tenant   Tenant          @relation(fields: [tenantId], references: [id])
                id       String          @default(uuid())
                author   User            @relation(fields: [authorId], references: [id])
                authorId String          @default(auth().id)
            
                comments Comment[]
                likes    PostUserLikes[]
            
                @@id([tenantId, id])
            
                @@allow('all', true)
            }
            
            model PostUserLikes {
                tenantId String @default(auth().tenantId)
                tenant   Tenant @relation(fields: [tenantId], references: [id])
                id       String @default(uuid())
            
                userId   String
                user     User   @relation(fields: [userId], references: [id])
            
                postId   String
                post     Post   @relation(fields: [tenantId, postId], references: [tenantId, id])
            
                @@id([tenantId, id])
                @@unique([tenantId, userId, postId])
            
                @@allow('all', true)
            }
            
            model Comment {
                tenantId String @default(auth().tenantId)
                tenant   Tenant @relation(fields: [tenantId], references: [id])
                id       String @default(uuid())
                postId   String
                post     Post   @relation(fields: [tenantId, postId], references: [tenantId, id])
            
                @@id([tenantId, id])
            
                @@allow('all', true)
            }
            `,
            { logPrismaQuery: true }
        );

        const tenant = await prisma.tenant.create({
            data: {},
        });
        const user = await prisma.user.create({
            data: { tenantId: tenant.id },
        });

        const db = enhance({ id: user.id, tenantId: tenant.id });

        await expect(
            db.post.create({
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
            })
        ).resolves.toMatchObject({
            authorId: user.id,
            likes: [
                {
                    tenantId: tenant.id,
                    userId: user.id,
                },
            ],
        });

        await expect(
            db.post.create({
                data: {
                    comments: {
                        createMany: {
                            data: [{}],
                        },
                    },
                },
                include: {
                    comments: true,
                },
            })
        ).resolves.toMatchObject({
            authorId: user.id,
            comments: [
                {
                    tenantId: tenant.id,
                },
            ],
        });
    });
});
