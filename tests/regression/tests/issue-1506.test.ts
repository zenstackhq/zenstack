import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1506', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model A {
                id Int @id @default(autoincrement())
                value Int
                b B @relation(fields: [bId], references: [id])
                bId Int @unique

                @@allow('read', true)
            }

            model B {
                id Int @id @default(autoincrement())
                value Int
                a A?
                c C @relation(fields: [cId], references: [id])
                cId Int @unique

                @@allow('read', value > c.value)
            }

            model C {
                id Int @id @default(autoincrement())
                value Int
                b B?

                @@allow('read', true)
            }
            `,
            { preserveTsFiles: true, logPrismaQuery: true }
        );

        await prisma.a.create({
            data: {
                value: 3,
                b: {
                    create: {
                        value: 2,
                        c: {
                            create: {
                                value: 1,
                            },
                        },
                    },
                },
            },
        });

        const db = enhance();
        const read = await db.a.findMany({ include: { b: true } });
        expect(read).toHaveLength(1);
        expect(read[0].b).toBeTruthy();
    });
});
