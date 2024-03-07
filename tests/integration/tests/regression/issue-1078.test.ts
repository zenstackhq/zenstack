import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1078', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model Counter {
                id String @id
              
                name String
                value Int
              
                @@validate(value >= 0)
                @@allow('all', true)
              }
            `
        );

        const db = enhance();

        const counter = await db.counter.create({
            data: { id: '1', name: 'It should create', value: 1 },
        });

        //! This query fails validation
        const updated = await db.counter.update({
            where: { id: '1' },
            data: { name: 'It should update' },
        });
    });

    it('read', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model Post {
                id Int @id() @default(autoincrement())
                title String @allow('read', true, true)
                content String
            }
            `,
            { logPrismaQuery: true }
        );

        const db = enhance();

        const post = await prisma.post.create({ data: { title: 'Post1', content: 'Content' } });
        await expect(db.post.findUnique({ where: { id: post.id } })).toResolveNull();
        await expect(db.post.findUnique({ where: { id: post.id }, select: { title: true } })).resolves.toEqual({
            title: 'Post1',
        });
    });
});
