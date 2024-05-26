import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1014', () => {
    it('update', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id() @default(autoincrement())
                name String
                posts Post[]
            }

            model Post {
                id Int @id() @default(autoincrement())
                title String
                content String?
                author User? @relation(fields: [authorId], references: [id])
                authorId Int? @allow('update', true, true)
            
                @@allow('read', true)
            }
            `
        );

        const db = enhance();

        const user = await prisma.user.create({ data: { name: 'User1' } });
        const post = await prisma.post.create({ data: { title: 'Post1' } });
        await expect(db.post.update({ where: { id: post.id }, data: { authorId: user.id } })).toResolveTruthy();
    });

    it('read', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model Post {
                id Int @id() @default(autoincrement())
                title String @allow('read', true, true)
                content String
            }
            `
        );

        const db = enhance();

        const post = await prisma.post.create({ data: { title: 'Post1', content: 'Content' } });
        await expect(db.post.findUnique({ where: { id: post.id } })).toResolveNull();
        await expect(db.post.findUnique({ where: { id: post.id }, select: { title: true } })).resolves.toEqual({
            title: 'Post1',
        });
    });
});
