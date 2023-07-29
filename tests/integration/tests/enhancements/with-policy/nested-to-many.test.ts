import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy:nested to-many', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('read filtering', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2[]
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        
            @@allow('create', true)
            @@allow('read', value > 0)
        }
        `
        );

        const db = withPolicy();

        let read = await db.m1.create({
            include: { m2: true },
            data: {
                id: '1',
                m2: {
                    create: [{ value: 0 }],
                },
            },
        });
        expect(read.m2).toHaveLength(0);
        read = await db.m1.findFirst({ where: { id: '1' }, include: { m2: true } });
        expect(read.m2).toHaveLength(0);

        await db.m1.create({
            data: {
                id: '2',
                m2: {
                    create: [{ value: 0 }, { value: 1 }, { value: 2 }],
                },
            },
        });
        read = await db.m1.findFirst({ where: { id: '2' }, include: { m2: true } });
        expect(read.m2).toHaveLength(2);
    });

    it('create simple', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2[]
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        
            @@allow('read', true)
            @@allow('create', value > 0)
        }
        `
        );

        const db = withPolicy();

        // single create denied
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: { value: 0 },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: { value: 1 },
                    },
                },
            })
        ).toResolveTruthy();

        // multi create denied
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: [{ value: 0 }, { value: 1 }],
                    },
                },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: [{ value: 1 }, { value: 2 }],
                    },
                },
            })
        ).toResolveTruthy();
    });

    it('update simple', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2[]
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        
            @@allow('read', true)
            @@allow('create', true)
            @@allow('update', value > 1)
        }
        `
        );

        const db = withPolicy();

        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [{ id: '1', value: 1 }],
                },
            },
        });

        // update denied
        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        update: {
                            where: { id: '1' },
                            data: { value: 2 },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        await db.m1.create({
            data: {
                id: '2',
                m2: {
                    create: { id: '2', value: 2 },
                },
            },
        });

        // update success
        const r = await db.m1.update({
            where: { id: '2' },
            include: { m2: true },
            data: {
                m2: {
                    update: {
                        where: { id: '2' },
                        data: { value: 3 },
                    },
                },
            },
        });
        expect(r.m2).toEqual(expect.arrayContaining([expect.objectContaining({ id: '2', value: 3 })]));
    });

    it('update with create', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2[]
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        
            @@allow('read', true)
            @@allow('create', value > 0)
            @@allow('update', value > 1)
        }
        `
        );

        const db = withPolicy();

        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: { value: 1 },
                },
            },
        });

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        create: [{ value: 0 }, { value: 1 }],
                    },
                },
            })
        ).toBeRejectedByPolicy();

        const r = await db.m1.update({
            where: { id: '1' },
            include: { m2: true },
            data: {
                m2: {
                    create: [{ value: 1 }, { value: 2 }],
                },
            },
        });
        expect(r.m2).toHaveLength(3);
    });

    it('update with delete', async () => {
        const { withPolicy, prisma } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2[]
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        
            @@allow('read', true)
            @@allow('create', value > 0)
            @@allow('update', value > 1)
            @@allow('delete', value > 2)
        }
        `
        );

        const db = withPolicy();

        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        { id: '1', value: 1 },
                        { id: '2', value: 2 },
                        { id: '3', value: 3 },
                        { id: '4', value: 4 },
                        { id: '5', value: 5 },
                    ],
                },
            },
        });

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        delete: { id: '1' },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        expect(await prisma.m2.findMany()).toHaveLength(5);

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        delete: [{ id: '1' }, { id: '2' }],
                    },
                },
            })
        ).toBeRejectedByPolicy();
        expect(await prisma.m2.findMany()).toHaveLength(5);

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        deleteMany: { OR: [{ id: '2' }, { id: '3' }] },
                    },
                },
            })
        ).toResolveTruthy();
        // only m2#3 should be deleted, m2#2 should remain because of policy
        await expect(db.m2.findUnique({ where: { id: '3' } })).toResolveNull();
        await expect(db.m2.findUnique({ where: { id: '2' } })).toResolveTruthy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        delete: { id: '3' },
                    },
                },
            })
        ).toBeNotFound();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        deleteMany: { value: { gte: 4 } },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(db.m2.findMany({ where: { id: { in: ['4', '5'] } } })).resolves.toHaveLength(0);
    });

    it('create with nested read', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            value Int
            m2 M2[]
            m3 M3?
        
            @@allow('read', value > 1)
            @@allow('create', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        
            @@allow('create', true)
            @@allow('read', value > 0)
        }

        model M3 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String @unique
        
            @@allow('create', true)
            @@allow('read', value > 0)
        }
        `
        );

        const db = withPolicy();

        await expect(
            db.m1.create({
                data: {
                    id: '1',
                    value: 1,
                },
            })
        ).toBeRejectedByPolicy();

        // included 'm1' can't be read
        await expect(
            db.m2.create({
                include: { m1: true },
                data: {
                    id: '1',
                    value: 1,
                    m1: { connect: { id: '1' } },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(db.m2.findUnique({ where: { id: '1' } })).toResolveTruthy();

        // included 'm1' can't be read
        await expect(
            db.m3.create({
                include: { m1: true },
                data: {
                    id: '1',
                    value: 1,
                    m1: { connect: { id: '1' } },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(db.m3.findUnique({ where: { id: '1' } })).toResolveTruthy();

        // nested to-many got filtered on read
        const r = await db.m1.create({
            include: { m2: true },
            data: {
                value: 2,
                m2: { create: [{ value: 0 }, { value: 1 }] },
            },
        });
        expect(r.m2).toHaveLength(1);

        // read-back for to-one relation rejected
        const r1 = await db.m1.create({
            include: { m3: true },
            data: {
                value: 2,
                m3: { create: { value: 0 } },
            },
        });
        expect(r1.m3).toBeNull();
    });

    it('update with nested read', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2[]
            m3 M3?
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        
            @@allow('read', value > 1)
            @@allow('create,update', true)
        }

        model M3 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String @unique
        
            @@allow('read', value > 1)
            @@allow('create,update', true)
        }
        `
        );

        const db = withPolicy();
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        { id: '1', value: 0 },
                        { id: '2', value: 0 },
                    ],
                },
                m3: {
                    create: { value: 0 },
                },
            },
        });

        const r = await db.m1.update({
            where: { id: '1' },
            include: { m3: true },
            data: {
                m3: {
                    update: {
                        value: 1,
                    },
                },
            },
        });
        expect(r.m3).toBeNull();

        const r1 = await db.m1.update({
            where: { id: '1' },
            include: { m3: true, m2: true },
            data: {
                m3: {
                    update: {
                        value: 2,
                    },
                },
            },
        });
        // m3 is ok now
        expect(r1.m3.value).toBe(2);
        // m2 got filtered
        expect(r1.m2).toHaveLength(0);

        const r2 = await db.m1.update({
            where: { id: '1' },
            select: { m2: true },
            data: {
                m2: {
                    update: {
                        where: { id: '1' },
                        data: { value: 2 },
                    },
                },
            },
        });
        // one of m2 matches policy now
        expect(r2.m2).toHaveLength(1);
    });
});
