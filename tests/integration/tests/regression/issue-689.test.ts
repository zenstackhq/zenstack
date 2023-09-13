import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 689', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model UserRole {
            id Int @id @default(autoincrement())
            user User @relation(fields: [userId], references: [id])
            userId Int
            role String

            // @@allow('all', true)
        }
        
        model User {
            id Int @id @default(autoincrement())
            userRole UserRole[]
            deleted Boolean @default(false)

            @@allow('create,read', true)
            @@allow('all', auth() == this)
            @@allow('all', userRole?[user == auth() && 'Admin' == role])
            @@allow('read', userRole?[user == auth()])
        }        
        `
        );

        await prisma.user.create({
            data: {
                id: 1,
                userRole: {
                    create: [
                        { id: 1, role: 'Admin' },
                        { id: 2, role: 'Student' },
                    ],
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                userRole: {
                    connect: { id: 1 },
                },
            },
        });

        const c1 = await prisma.user.count({
            where: {
                userRole: {
                    some: { role: 'Student' },
                },
                NOT: { deleted: true },
            },
        });

        const db = enhance();
        const c2 = await db.user.count({
            where: {
                userRole: {
                    some: { role: 'Student' },
                },
                NOT: { deleted: true },
            },
        });

        expect(c1).toEqual(c2);
    });
});
