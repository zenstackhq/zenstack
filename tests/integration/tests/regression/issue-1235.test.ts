import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1235', () => {
    it('regression1', async () => {
        const { enhance } = await loadSchema(
            `
            model Post {
                id Int @id @default(autoincrement())
                @@deny("update", future().id != id)
                @@allow("all", true)
            }
            `
        );

        const db = enhance();
        const post = await db.post.create({ data: {} });
        await expect(db.post.update({ data: { id: post.id + 1 }, where: { id: post.id } })).toBeRejectedByPolicy();
    });

    it('regression2', async () => {
        const { enhance } = await loadSchema(
            `
            model Post {
                id Int @id @default(autoincrement())
                @@deny("update", future().id != this.id)
                @@allow("all", true)
            }
            `
        );

        const db = enhance();
        const post = await db.post.create({ data: {} });
        await expect(db.post.update({ data: { id: post.id + 1 }, where: { id: post.id } })).toBeRejectedByPolicy();
    });
});
