import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1642', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id
                name String
                posts Post[]

                @@allow('read', true)
                @@allow('all', auth().id == 1)
            }

            model Post {
                id Int @id
                title String
                description String
                author User @relation(fields: [authorId], references: [id])
                authorId Int

                // delegate all access policies to the author:
                @@allow('all', check(author))

                @@allow('update', future().title == 'hello')
            }
            `
        );

        await prisma.user.create({ data: { id: 1, name: 'User1' } });
        await prisma.post.create({ data: { id: 1, title: 'hello', description: 'desc1', authorId: 1 } });

        const db = enhance({ id: 2 });
        await expect(
            db.post.update({ where: { id: 1 }, data: { title: 'world', description: 'desc2' } })
        ).toBeRejectedByPolicy();

        await expect(db.post.update({ where: { id: 1 }, data: { description: 'desc2' } })).toResolveTruthy();
    });
});
