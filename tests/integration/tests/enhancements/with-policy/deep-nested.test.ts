import { loadSchema, type FullDbClientContract } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy:deep nested', () => {
    let origDir: string;

    const model = `
    // M1 - M2 -  M3
    //           -* M4
    model M1 {
        myId String @id @default(cuid())
        m2 M2?
        value Int @default(0)

        @@allow('all', true)
        @@deny('create', m2.m4?[value == 100])
        @@deny('update', m2.m4?[value == 101])
        @@deny('read', value == 100)
    }

    model M2 {
        id Int @id @default(autoincrement())
        value Int
        m1 M1 @relation(fields: [m1Id], references: [myId], onDelete: Cascade)
        m1Id String @unique

        m3 M3?
        m4 M4[]

        @@allow('read', true)
        @@allow('create', value > 0)
        @@allow('update', value > 1)
        @@allow('delete', value > 2)
    }

    model M3 {
        id String @id @default(cuid())
        value Int
        m2 M2 @relation(fields: [m2Id], references: [id], onDelete: Cascade)
        m2Id Int @unique

        @@allow('read', true)
        @@allow('create', value > 10)
        @@allow('update', value > 1)
        @@allow('delete', value > 2)
        @@deny('read', value == 200)
    }

    model M4 {
        id String @id @default(cuid())
        value Int
        m2 M2? @relation(fields: [m2Id], references: [id], onDelete: Cascade)
        m2Id Int?

        @@unique([m2Id, value])

        @@allow('read', true)
        @@allow('create', value > 20)
        @@allow('update', value > 21)
        @@allow('delete', value > 22)
        @@deny('read', value == 200)
    }
    `;

    let db: FullDbClientContract;
    let prisma: FullDbClientContract;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    beforeEach(async () => {
        const params = await loadSchema(model);
        db = params.withPolicy();
        prisma = params.prisma;
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('read', async () => {
        await prisma.m1.create({
            data: {
                myId: '1',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: { id: '3-1', value: 31 },
                        },
                        m4: {
                            create: [{ value: 41 }, { value: 42 }],
                        },
                    },
                },
            },
        });
        // all readable
        let r = await db.m1.findUnique({
            where: { myId: '1' },
            include: { m2: { include: { m3: true, m4: true } } },
        });
        expect(r.m2.m3).toBeTruthy();
        expect(r.m2.m4).toHaveLength(2);
        r = await db.m3.findUnique({ where: { id: '3-1' }, include: { m2: { include: { m1: true } } } });
        expect(r.m2.m1).toBeTruthy();

        await prisma.m1.create({
            data: {
                myId: '2',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: { value: 200 },
                        },
                        m4: {
                            create: [{ value: 22 }, { value: 200 }],
                        },
                    },
                },
            },
        });
        // check filtered
        r = await db.m1.findUnique({
            where: { myId: '2' },
            include: { m2: { include: { m3: true, m4: true } } },
        });
        expect(r.m2.m3).toBeNull();
        expect(r.m2.m4).toHaveLength(1);

        await prisma.m1.create({
            data: {
                myId: '3',
                value: 100,
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: { id: '3-2', value: 31 },
                        },
                    },
                },
            },
        });
        // check hoisted filtering, due to m1 is not readable
        r = await db.m3.findUnique({ where: { id: '3-2' }, include: { m2: { include: { m1: true } } } });
        expect(r).toBeNull();
    });

    it('create', async () => {
        await expect(
            db.m1.create({
                data: {
                    myId: '1',
                    m2: {
                        create: {
                            value: 1,
                            m3: {
                                create: {
                                    id: 'm3-1',
                                    value: 11,
                                },
                            },
                            m4: {
                                create: [
                                    { id: 'm4-1', value: 22 },
                                    { id: 'm4-2', value: 22 },
                                ],
                            },
                        },
                    },
                },
            })
        ).toResolveTruthy();

        const r = await db.m1.create({
            include: { m2: { include: { m3: true, m4: true } } },
            data: {
                myId: '2',
                m2: {
                    create: {
                        value: 2,
                        m3: {
                            connect: {
                                id: 'm3-1',
                            },
                        },
                        m4: {
                            connect: [{ id: 'm4-1' }],
                            connectOrCreate: [
                                {
                                    where: { id: 'm4-2' },
                                    create: { id: 'm4-new', value: 22 },
                                },
                                {
                                    where: { id: 'm4-3' },
                                    create: { id: 'm4-3', value: 23 },
                                },
                            ],
                        },
                    },
                },
            },
        });
        expect(r.m2.m3.id).toBe('m3-1');
        expect(r.m2.m4[0].id).toBe('m4-1');
        expect(r.m2.m4[1].id).toBe('m4-2');
        expect(r.m2.m4[2].id).toBe('m4-3');

        // deep create violation
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: {
                            value: 1,
                            m4: {
                                create: [{ value: 20 }, { value: 22 }],
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        // deep create violation due to deep policy
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: {
                            value: 1,
                            m4: {
                                create: { value: 100 },
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        // deep connect violation via deep policy: @@deny('create', m2.m4?[value == 100])
        await db.m4.create({
            data: {
                id: 'm4-value-100',
                value: 100,
            },
        });
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: {
                            value: 1,
                            m4: {
                                connect: { id: 'm4-value-100' },
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        // create read-back filter: M4 @@deny('read', value == 200)
        const r1 = await db.m1.create({
            include: { m2: { include: { m4: true } } },
            data: {
                m2: {
                    create: {
                        value: 1,
                        m4: {
                            create: [{ value: 200 }, { value: 201 }],
                        },
                    },
                },
            },
        });
        expect(r1.m2.m4).toHaveLength(1);

        // create read-back filtering: M3 @@deny('read', value == 200)
        const r2 = await db.m1.create({
            include: { m2: { include: { m3: true } } },
            data: {
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: { value: 200 },
                        },
                    },
                },
            },
        });
        expect(r2.m2.m3).toBeNull();
    });

    it('update simple nested', async () => {
        await db.m1.create({
            data: { myId: '1' },
        });

        // success
        await expect(
            db.m1.update({
                where: { myId: '1' },
                include: { m2: { include: { m3: true, m4: true } } },
                data: {
                    m2: {
                        create: {
                            value: 2,
                            m3: {
                                create: { id: 'm3-1', value: 11 },
                            },
                            m4: {
                                create: [
                                    { id: 'm4-1', value: 22 },
                                    { id: 'm4-2', value: 23 },
                                ],
                            },
                        },
                    },
                },
            })
        ).toResolveTruthy();

        // deep update with connect/disconnect/delete success
        await db.m4.create({
            data: {
                id: 'm4-3',
                value: 23,
            },
        });
        const r = await db.m1.update({
            where: { myId: '1' },
            include: { m2: { include: { m4: true } } },
            data: {
                m2: {
                    update: {
                        m4: {
                            connect: [{ id: 'm4-3' }],
                            disconnect: { id: 'm4-1' },
                            delete: { id: 'm4-2' },
                        },
                    },
                },
            },
        });
        expect(r.m2.m4).toHaveLength(1);
        expect(r.m2.m4[0].id).toBe('m4-3');

        // reconnect m14-1, create m14-2
        await expect(
            db.m1.update({
                where: { myId: '1' },
                include: { m2: { include: { m4: true } } },
                data: {
                    m2: {
                        update: {
                            m4: {
                                connect: [{ id: 'm4-1' }],
                                create: { id: 'm4-2', value: 23 },
                            },
                        },
                    },
                },
            })
        ).toResolveTruthy();

        // deep update violation
        await expect(
            db.m1.update({
                where: { myId: '1' },
                data: {
                    m2: {
                        update: {
                            m4: {
                                create: { value: 20 },
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        // deep update violation via deep policy: @@deny('update', m2.m4?[value == 101])
        await db.m1.create({
            data: {
                myId: '2',
                m2: {
                    create: {
                        value: 2,
                        m4: {
                            create: { id: 'm4-101', value: 101 },
                        },
                    },
                },
            },
        });
        await expect(
            db.m1.update({
                where: { myId: '2' },
                data: { value: 1 },
            })
        ).toBeRejectedByPolicy();

        // update read-back filter: M4 @@deny('read', value == 200)
        const r1 = await db.m1.update({
            where: { myId: '1' },
            include: { m2: { include: { m4: true } } },
            data: {
                m2: {
                    update: {
                        m4: {
                            update: {
                                where: { id: 'm4-1' },
                                data: { value: 200 },
                            },
                        },
                    },
                },
            },
        });
        expect(r1.m2.m4).toHaveLength(2);
        expect(r1.m2.m4).not.toContain(expect.objectContaining({ id: 'm4-1' }));

        // update read-back rejection: M3 @@deny('read', value == 200)
        const r2 = await db.m1.update({
            where: { myId: '1' },
            include: { m2: { include: { m3: true } } },
            data: {
                m2: {
                    update: {
                        m3: {
                            update: { value: 200 },
                        },
                    },
                },
            },
        });
        expect(r2.m2.m3).toBeNull();
    });

    it('update createMany/updateMany/deleteMany nested', async () => {
        await db.m1.create({
            data: {
                myId: '1',
                m2: {
                    create: {
                        id: 1,
                        value: 2,
                    },
                },
            },
        });

        await db.m1.create({
            data: {
                myId: '2',
                m2: {
                    create: {
                        id: 2,
                        value: 2,
                    },
                },
            },
        });

        // createMany with duplicate
        await expect(
            db.m1.update({
                where: { myId: '1' },
                data: {
                    m2: {
                        update: {
                            m4: {
                                createMany: {
                                    data: [
                                        { id: 'm4-1', value: 21 },
                                        { id: 'm4-1', value: 22 },
                                    ],
                                },
                            },
                        },
                    },
                },
            })
        ).rejects.toThrow('Unique constraint failed');

        // createMany skip duplicate
        await db.m1.update({
            where: { myId: '1' },
            data: {
                m2: {
                    update: {
                        m4: {
                            createMany: {
                                skipDuplicates: true,
                                data: [
                                    { id: 'm4-1', value: 21 }, // should be created
                                    { id: 'm4-1', value: 211 }, // should be skipped
                                    { id: 'm4-2', value: 22 }, // should be created
                                ],
                            },
                        },
                    },
                },
            },
        });
        await expect(db.m4.findMany()).resolves.toHaveLength(2);

        // createMany skip duplicate with compound unique involving fk
        await db.m1.update({
            where: { myId: '2' },
            data: {
                m2: {
                    update: {
                        m4: {
                            createMany: {
                                skipDuplicates: true,
                                data: [
                                    { id: 'm4-3', value: 21 }, // should be created
                                    { id: 'm4-4', value: 21 }, // should be skipped
                                ],
                            },
                        },
                    },
                },
            },
        });
        const allM4 = await db.m4.findMany({ select: { value: true } });
        await expect(allM4).toHaveLength(3);
        await expect(allM4).toEqual(expect.arrayContaining([{ value: 21 }, { value: 21 }, { value: 22 }]));

        // updateMany, filtered out by policy
        await db.m1.update({
            where: { myId: '1' },
            data: {
                m2: {
                    update: {
                        m4: {
                            updateMany: {
                                where: {
                                    id: 'm4-1',
                                },
                                data: {
                                    value: 210,
                                },
                            },
                        },
                    },
                },
            },
        });
        await expect(db.m4.findUnique({ where: { id: 'm4-1' } })).resolves.toMatchObject({ value: 21 });
        await expect(db.m4.findUnique({ where: { id: 'm4-2' } })).resolves.toMatchObject({ value: 22 });

        // updateMany, success
        await db.m1.update({
            where: { myId: '1' },
            data: {
                m2: {
                    update: {
                        m4: {
                            updateMany: {
                                where: {
                                    id: 'm4-2',
                                },
                                data: {
                                    value: 220,
                                },
                            },
                        },
                    },
                },
            },
        });
        await expect(db.m4.findUnique({ where: { id: 'm4-1' } })).resolves.toMatchObject({ value: 21 });
        await expect(db.m4.findUnique({ where: { id: 'm4-2' } })).resolves.toMatchObject({ value: 220 });

        // deleteMany, filtered out by policy
        await db.m1.update({
            where: { myId: '1' },
            data: {
                m2: {
                    update: {
                        m4: {
                            deleteMany: {
                                id: 'm4-1',
                            },
                        },
                    },
                },
            },
        });
        await expect(db.m4.findMany()).resolves.toHaveLength(3);

        // deleteMany, success
        await db.m1.update({
            where: { myId: '1' },
            data: {
                m2: {
                    update: {
                        m4: {
                            deleteMany: {
                                id: 'm4-2',
                            },
                        },
                    },
                },
            },
        });
        await expect(db.m4.findMany()).resolves.toHaveLength(2);
    });

    it('delete', async () => {
        await db.m1.create({
            data: {
                myId: '1',
                m2: {
                    create: {
                        value: 1,
                        m4: {
                            create: [{ value: 200 }, { value: 22 }],
                        },
                    },
                },
            },
        });

        // delete read-back filtered: M4 @@deny('read', value == 200)
        const r = await db.m1.delete({
            where: { myId: '1' },
            include: { m2: { select: { m4: true } } },
        });
        expect(r.m2.m4).toHaveLength(1);

        await expect(db.m4.findMany()).resolves.toHaveLength(0);

        await db.m1.create({
            data: {
                myId: '2',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: { value: 200 },
                        },
                    },
                },
            },
        });

        // delete read-back filtered: M3 @@deny('read', value == 200)
        const r1 = await db.m1.delete({
            where: { myId: '2' },
            include: { m2: { select: { m3: { select: { id: true } } } } },
        });
        expect(r1.m2.m3).toBeNull();
    });
});
