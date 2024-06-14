import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1507', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                age Int
            }

            model Profile {
                id Int @id @default(autoincrement())
                age Int

                @@allow('read', auth().age == age)
            }
            `,
            { preserveTsFiles: true, logPrismaQuery: true }
        );

        await prisma.profile.create({ data: { age: 18 } });
        await prisma.profile.create({ data: { age: 20 } });
        const db = enhance({ id: 1, age: 18 });
        await expect(db.profile.findMany()).resolves.toHaveLength(1);
        await expect(db.profile.count()).resolves.toBe(1);
    });
});
