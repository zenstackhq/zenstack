import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: connect-disconnect', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    const modelToMany = `
    model M1 {
        id String @id @default(uuid())
        m2 M2[]
    
        @@allow('all', true)
    }
    
    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1? @relation(fields: [m1Id], references:[id])
        m1Id String?
        m3 M3[]
    
        @@allow('read,create', true)
        @@allow('update', !deleted)
    }

    model M3 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m2 M2? @relation(fields: [m2Id], references:[id])
        m2Id String?

        @@allow('read,create', true)
        @@allow('update', !deleted)
    }
    `;

    it('simple to-many', async () => {
        const { withPolicy, prisma } = await loadSchema(modelToMany);

        const db = withPolicy();

        await db.m2.create({ data: { id: 'm2-1', value: 1, deleted: false } });
        await db.m1.create({
            data: {
                id: 'm1-1',
                m2: {
                    connect: { id: 'm2-1' },
                },
            },
        });
        await prisma.m2.update({ where: { id: 'm2-1' }, data: { deleted: true } });
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: {
                    m2: {
                        disconnect: { id: 'm2-1' },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await prisma.m2.update({ where: { id: 'm2-1' }, data: { deleted: false } });
        await db.m1.update({
            where: { id: 'm1-1' },
            data: {
                m2: {
                    disconnect: { id: 'm2-1' },
                },
            },
        });

        await db.m2.create({ data: { id: 'm2-2', value: 1, deleted: true } });
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        connect: { id: 'm2-2' },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        // mixed create and connect
        await db.m2.create({ data: { id: 'm2-3', value: 1, deleted: false } });
        await db.m1.create({
            data: {
                m2: {
                    connect: { id: 'm2-3' },
                    create: { value: 1, deleted: false },
                },
            },
        });

        await db.m2.create({ data: { id: 'm2-4', value: 1, deleted: true } });
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        connect: { id: 'm2-4' },
                        create: { value: 1, deleted: false },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        // connectOrCreate
        await db.m1.create({
            data: {
                m2: {
                    connectOrCreate: {
                        where: { id: 'm2-5' },
                        create: { value: 1 },
                    },
                },
            },
        });

        await db.m2.create({ data: { id: 'm2-6', value: 1, deleted: true } });
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        connectOrCreate: {
                            where: { id: 'm2-6' },
                            create: { value: 1 },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });

    it('nested to-many', async () => {
        const { withPolicy } = await loadSchema(modelToMany);

        const db = withPolicy();

        await db.m3.create({ data: { id: 'm3-1', value: 1, deleted: false } });
        await expect(
            db.m1.create({
                data: {
                    id: 'm1-1',
                    m2: {
                        create: {
                            value: 1,
                            m3: { connect: { id: 'm3-1' } },
                        },
                    },
                },
            })
        ).toResolveTruthy();

        await db.m3.create({ data: { id: 'm3-2', value: 1, deleted: true } });
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: {
                            value: 1,
                            m3: { connect: { id: 'm3-2' } },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });

    const modelToOne = `
    model M1 {
        id String @id @default(uuid())
        m2 M2?
    
        @@allow('all', true)
    }
    
    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1? @relation(fields: [m1Id], references:[id])
        m1Id String? @unique
    
        @@allow('read,create', true)
        @@allow('update', !deleted)
    }
    `;

    it('to-one', async () => {
        const { withPolicy, prisma } = await loadSchema(modelToOne);

        const db = withPolicy();

        await db.m2.create({ data: { id: 'm2-1', value: 1, deleted: false } });
        await db.m1.create({
            data: {
                id: 'm1-1',
                m2: {
                    connect: { id: 'm2-1' },
                },
            },
        });
        await prisma.m2.update({ where: { id: 'm2-1' }, data: { deleted: true } });
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: {
                    m2: {
                        disconnect: { id: 'm2-1' },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await prisma.m2.update({ where: { id: 'm2-1' }, data: { deleted: false } });
        await db.m1.update({
            where: { id: 'm1-1' },
            data: {
                m2: {
                    disconnect: true,
                },
            },
        });

        await db.m2.create({ data: { id: 'm2-2', value: 1, deleted: true } });
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        connect: { id: 'm2-2' },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        // connectOrCreate
        await db.m1.create({
            data: {
                m2: {
                    connectOrCreate: {
                        where: { id: 'm2-3' },
                        create: { value: 1 },
                    },
                },
            },
        });

        await db.m2.create({ data: { id: 'm2-4', value: 1, deleted: true } });
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        connectOrCreate: {
                            where: { id: 'm2-4' },
                            create: { value: 1 },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });
});
