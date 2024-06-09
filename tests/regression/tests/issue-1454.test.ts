import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1454', () => {
    it('regression1', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                sensitiveInformation String
                username String

                purchases Purchase[]

                @@allow('read', auth() == this)
            }

            model Purchase {
                id Int @id @default(autoincrement())
                purchasedAt DateTime @default(now())
                userId Int
                user User @relation(fields: [userId], references: [id], onDelete: Cascade)

                @@allow('read', true)
            }
            `
        );

        const db = enhance();
        await prisma.user.create({
            data: { username: 'user1', sensitiveInformation: 'sensitive', purchases: { create: {} } },
        });

        await expect(db.purchase.findMany({ where: { user: { username: 'user1' } } })).resolves.toHaveLength(0);
        await expect(db.purchase.findMany({ where: { user: { is: { username: 'user1' } } } })).resolves.toHaveLength(0);
    });

    it('regression2', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                username String @allow('read', false)

                purchases Purchase[]

                @@allow('read', true)
            }

            model Purchase {
                id Int @id @default(autoincrement())
                purchasedAt DateTime @default(now())
                userId Int
                user User @relation(fields: [userId], references: [id], onDelete: Cascade)

                @@allow('read', true)
            }
            `,
            { logPrismaQuery: true }
        );

        const db = enhance();
        const user = await prisma.user.create({
            data: { username: 'user1', purchases: { create: {} } },
        });

        await expect(db.purchase.findMany({ where: { user: { id: user.id } } })).resolves.toHaveLength(1);
        await expect(db.purchase.findMany({ where: { user: { username: 'user1' } } })).resolves.toHaveLength(0);
        await expect(db.purchase.findMany({ where: { user: { is: { username: 'user1' } } } })).resolves.toHaveLength(0);
    });

    it('regression3', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                sensitiveInformation String
                username String @allow('read', true, true)

                purchases Purchase[]

                @@allow('read', auth() == this)
            }

            model Purchase {
                id Int @id @default(autoincrement())
                purchasedAt DateTime @default(now())
                userId Int
                user User @relation(fields: [userId], references: [id], onDelete: Cascade)

                @@allow('read', true)
            }
            `,
            { logPrismaQuery: true }
        );

        const db = enhance();
        await prisma.user.create({
            data: { username: 'user1', sensitiveInformation: 'sensitive', purchases: { create: {} } },
        });

        await expect(db.purchase.findMany({ where: { user: { username: 'user1' } } })).resolves.toHaveLength(1);
        await expect(db.purchase.findMany({ where: { user: { is: { username: 'user1' } } } })).resolves.toHaveLength(1);
        await expect(
            db.purchase.findMany({ where: { user: { sensitiveInformation: 'sensitive' } } })
        ).resolves.toHaveLength(0);
        await expect(
            db.purchase.findMany({ where: { user: { is: { sensitiveInformation: 'sensitive' } } } })
        ).resolves.toHaveLength(0);
        await expect(
            db.purchase.findMany({ where: { user: { username: 'user1', sensitiveInformation: 'sensitive' } } })
        ).resolves.toHaveLength(0);
        await expect(
            db.purchase.findMany({
                where: { OR: [{ user: { username: 'user1' } }, { user: { sensitiveInformation: 'sensitive' } }] },
            })
        ).resolves.toHaveLength(1);
    });
});
