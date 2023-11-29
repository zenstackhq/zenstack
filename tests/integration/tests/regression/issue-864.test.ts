import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue nested create', () => {
    it('safe create', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model A {
                id Int @id @default(autoincrement())
                aValue Int
                b B[]

                @@allow('all', aValue > 0)
            }

            model B {
                id Int @id @default(autoincrement())
                bValue Int
                aId Int
                a A @relation(fields: [aId], references: [id])
                c C[]

                @@allow('all', bValue > 0)
            }
            
            model C {
                id Int @id @default(autoincrement())
                cValue Int
                bId Int
                b B @relation(fields: [bId], references: [id])

                @@allow('all', cValue > 0)
            }
            `
        );

        await prisma.a.create({
            data: { id: 1, aValue: 1, b: { create: { id: 2, bValue: 2 } } },
            include: { b: true },
        });

        const db = enhance();
        await db.a.update({
            where: { id: 1 },
            data: {
                b: {
                    update: [
                        {
                            where: { id: 2 },
                            data: {
                                c: {
                                    create: [
                                        {
                                            cValue: 3,
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        });
    });

    it('unsafe create nested in to-many', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model A {
                id Int @id @default(autoincrement())
                aValue Int
                b B[]

                @@allow('all', aValue > 0)
            }

            model B {
                id Int @id @default(autoincrement())
                bValue Int
                aId Int
                a A @relation(fields: [aId], references: [id])
                c C[]

                @@allow('all', bValue > 0)
            }
            
            model C {
                id Int @id @default(autoincrement())
                cValue Int
                bId Int
                b B @relation(fields: [bId], references: [id])

                @@allow('all', cValue > 0)
            }
            `
        );

        await prisma.a.create({
            data: { id: 1, aValue: 1, b: { create: { id: 2, bValue: 2 } } },
            include: { b: true },
        });

        const db = enhance();
        await db.a.update({
            where: { id: 1 },
            data: {
                b: {
                    update: [
                        {
                            where: { id: 2 },
                            data: {
                                c: {
                                    create: [
                                        {
                                            id: 1,
                                            cValue: 3,
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        });
    });

    it('unsafe create nested in to-one', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model A {
                id Int @id @default(autoincrement())
                aValue Int
                b B?

                @@allow('all', aValue > 0)
            }

            model B {
                id Int @id @default(autoincrement())
                bValue Int
                aId Int @unique
                a A @relation(fields: [aId], references: [id])
                c C[]

                @@allow('all', bValue > 0)
            }
            
            model C {
                id Int @id @default(autoincrement())
                cValue Int
                bId Int
                b B @relation(fields: [bId], references: [id])

                @@allow('all', cValue > 0)
            }
            `
        );

        await prisma.a.create({
            data: { id: 1, aValue: 1, b: { create: { id: 2, bValue: 2 } } },
            include: { b: true },
        });

        const db = enhance();
        await db.a.update({
            where: { id: 1 },
            data: {
                b: {
                    update: {
                        data: {
                            c: {
                                create: [
                                    {
                                        id: 1,
                                        cValue: 3,
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        });
    });
});
