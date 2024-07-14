import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1585', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Asset {
                id Int @id @default(autoincrement())
                type String
                views Int

                @@allow('all', true)
                @@delegate(type)
            }
            
            model Post extends Asset {
                title String
            }
            `
        );

        const db = enhance();
        await db.post.create({ data: { title: 'Post1', views: 0 } });
        await db.post.create({ data: { title: 'Post2', views: 1 } });
        await expect(
            db.post.count({
                where: { views: { gt: 0 } },
            })
        ).resolves.toBe(1);
    });
});
