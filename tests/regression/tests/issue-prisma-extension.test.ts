import { loadSchema } from '@zenstackhq/testtools';

describe('issue prisma extension', () => {
    it('extend enhanced client', async () => {
        const { enhance, prisma } = await loadSchema(
            `
            model Post {
                id Int @id
                title String
                published Boolean

                @@allow('create', true)
                @@allow('read', published)
            }
            `
        );

        await prisma.post.create({ data: { id: 1, title: 'post1', published: true } });
        await prisma.post.create({ data: { id: 2, title: 'post2', published: false } });

        const db = enhance();
        await expect(db.post.findMany()).resolves.toHaveLength(1);

        const extended = db.$extends({
            model: {
                post: {
                    findManyListView: async (args: any) => {
                        return { view: true, data: await db.post.findMany(args) };
                    },
                },
            },
        });

        await expect(extended.post.findManyListView()).resolves.toMatchObject({
            view: true,
            data: [{ id: 1, title: 'post1', published: true }],
        });
        await expect(extended.post.findMany()).resolves.toHaveLength(1);
    });

    it('enhance extended client', async () => {
        const { enhanceRaw, prisma } = await loadSchema(
            `
            model Post {
                id Int @id
                title String
                published Boolean

                @@allow('create', true)
                @@allow('read', published)
            }
            `
        );

        await prisma.post.create({ data: { id: 1, title: 'post1', published: true } });
        await prisma.post.create({ data: { id: 2, title: 'post2', published: false } });

        const extended = prisma.$extends({
            model: {
                post: {
                    findManyListView: async (args: any) => {
                        return { view: true, data: await prisma.post.findMany(args) };
                    },
                },
            },
        });

        await expect(extended.post.findMany()).resolves.toHaveLength(2);
        await expect(extended.post.findManyListView()).resolves.toMatchObject({
            view: true,
            data: [
                { id: 1, title: 'post1', published: true },
                { id: 2, title: 'post2', published: false },
            ],
        });

        const db = enhanceRaw(extended);
        await expect(db.post.findMany()).resolves.toHaveLength(1);
        await expect(db.post.findManyListView()).resolves.toMatchObject({
            view: true,
            data: [
                { id: 1, title: 'post1', published: true },
                { id: 2, title: 'post2', published: false },
            ],
        });
    });
});
