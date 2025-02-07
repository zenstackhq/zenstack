import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1978', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id
                posts Post[]
                secret String @allow('read', posts?[published])
                @@allow('all', true)
            }
            
            model Post {
                id Int @id
                author User @relation(fields: [authorId], references: [id])
                authorId Int
                published Boolean @default(false)
                @@allow('all', true)
            }
            `,
            { logPrismaQuery: true }
        );

        const user1 = await prisma.user.create({
            data: { id: 1, secret: 'secret', posts: { create: { id: 1, published: true } } },
        });
        const user2 = await prisma.user.create({
            data: { id: 2, secret: 'secret' },
        });

        const db = enhance();
        await expect(db.user.findFirst({ where: { id: 1 } })).resolves.toMatchObject({ secret: 'secret' });
        await expect(db.user.findFirst({ where: { id: 1 }, select: { id: true } })).resolves.toEqual({ id: 1 });

        let r = await db.user.findFirst({ where: { id: 2 } });
        expect(r.secret).toBeUndefined();
        r = await db.user.findFirst({ where: { id: 2 }, select: { id: true } });
        expect(r.secret).toBeUndefined();
    });
});
