import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1648', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id      Int      @id @default(autoincrement())
                profile Profile?
                posts   Post[]
            }

            model Profile {
                id     Int  @id @default(autoincrement())
                someText String
                user   User @relation(fields: [userId], references: [id])
                userId Int  @unique
            }

            model Post {
                id     Int    @id @default(autoincrement())
                title  String

                userId Int
                user   User   @relation(fields: [userId], references: [id])

                // this will always be true, even if the someText field is "canUpdate"
                @@deny("update", future().user.profile.someText != "canUpdate")

                @@allow("all", true)
            }
            `
        );

        await prisma.user.create({ data: { id: 1, profile: { create: { someText: 'canUpdate' } } } });
        await prisma.user.create({ data: { id: 2, profile: { create: { someText: 'nothing' } } } });
        await prisma.post.create({ data: { id: 1, title: 'Post1', userId: 1 } });
        await prisma.post.create({ data: { id: 2, title: 'Post2', userId: 2 } });

        const db = enhance();
        await expect(db.post.update({ where: { id: 1 }, data: { title: 'Post1-1' } })).toResolveTruthy();
        await expect(db.post.update({ where: { id: 2 }, data: { title: 'Post2-2' } })).toBeRejectedByPolicy();
    });
});
