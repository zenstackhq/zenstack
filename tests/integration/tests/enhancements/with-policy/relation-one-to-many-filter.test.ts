import { loadSchema } from '@zenstackhq/testtools';

describe('Relation one-to-many filter', () => {
    const model = `
    model M1 {
        id String @id @default(uuid())
        m2 M2[]
    
        @@allow('all', true)
    }
    
    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1 @relation(fields: [m1Id], references:[id])
        m1Id String
        m3 M3[]
    
        @@allow('read', !deleted)
        @@allow('create', true)
    }

    model M3 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m2 M2 @relation(fields: [m2Id], references:[id])
        m2Id String

        @@allow('read', !deleted)
        @@allow('create', true)
    }
    `;

    it('some filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            value: 1,
                            m3: {
                                create: {
                                    value: 1,
                                },
                            },
                        },
                        {
                            value: 2,
                            deleted: true,
                            m3: {
                                create: {
                                    value: 2,
                                    deleted: true,
                                },
                            },
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        some: {},
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        some: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveFalsy();

        // include clause

        const r = await db.m1.findFirst({
            where: { id: '1' },
            include: {
                m2: {
                    where: {
                        m3: {
                            some: {},
                        },
                    },
                },
            },
        });
        expect(r.m2).toHaveLength(1);

        const r1 = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            some: { value: { gt: 1 } },
                        },
                    },
                },
            },
        });
        expect(r1.m2).toHaveLength(0);

        // m1 with empty m2 list
        await db.m1.create({
            data: {
                id: '2',
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        some: {},
                    },
                },
            })
        ).toResolveFalsy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        some: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveFalsy();
    });

    it('none filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            value: 1,
                            m3: {
                                create: {
                                    value: 1,
                                },
                            },
                        },
                        {
                            value: 2,
                            deleted: true,
                            m3: {
                                create: {
                                    value: 2,
                                    deleted: true,
                                },
                            },
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        none: {},
                    },
                },
            })
        ).toResolveFalsy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        none: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveTruthy();

        // include clause

        const r = await db.m1.findFirst({
            where: { id: '1' },
            include: {
                m2: {
                    where: {
                        m3: {
                            none: {},
                        },
                    },
                },
            },
        });
        expect(r.m2).toHaveLength(0);

        const r1 = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            none: { value: { gt: 1 } },
                        },
                    },
                },
            },
        });
        expect(r1.m2).toHaveLength(1);

        // m1 with empty m2 list
        await db.m1.create({
            data: {
                id: '2',
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        none: {},
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        none: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveTruthy();
    });

    it('every filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            value: 1,
                            m3: {
                                create: {
                                    value: 1,
                                },
                            },
                        },
                        {
                            value: 2,
                            deleted: true,
                            m3: {
                                create: {
                                    value: 2,
                                    deleted: true,
                                },
                            },
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        every: {},
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        every: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveFalsy();

        // include clause

        const r = await db.m1.findFirst({
            where: { id: '1' },
            include: {
                m2: {
                    where: {
                        m3: {
                            every: {},
                        },
                    },
                },
            },
        });
        expect(r.m2).toHaveLength(1);

        const r1 = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            every: { value: { gt: 1 } },
                        },
                    },
                },
            },
        });
        expect(r1.m2).toHaveLength(0);

        // m1 with empty m2 list
        await db.m1.create({
            data: {
                id: '2',
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        every: {},
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        every: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveTruthy();
    });

    it('_count filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            value: 1,
                            m3: {
                                create: {
                                    value: 1,
                                },
                            },
                        },
                        {
                            value: 2,
                            deleted: true,
                            m3: {
                                create: {
                                    value: 2,
                                    deleted: true,
                                },
                            },
                        },
                    ],
                },
            },
        });

        await expect(db.m1.findFirst({ include: { _count: true } })).resolves.toMatchObject({ _count: { m2: 1 } });
        await expect(db.m1.findFirst({ include: { _count: { select: { m2: true } } } })).resolves.toMatchObject({
            _count: { m2: 1 },
        });
        await expect(
            db.m1.findFirst({ include: { _count: { select: { m2: { where: { value: { gt: 0 } } } } } } })
        ).resolves.toMatchObject({ _count: { m2: 1 } });
        await expect(
            db.m1.findFirst({ include: { _count: { select: { m2: { where: { value: { gt: 1 } } } } } } })
        ).resolves.toMatchObject({ _count: { m2: 0 } });

        await expect(db.m1.findFirst({ include: { m2: { select: { _count: true } } } })).resolves.toMatchObject({
            m2: [{ _count: { m3: 1 } }],
        });
        await expect(
            db.m1.findFirst({ include: { m2: { select: { _count: { select: { m3: true } } } } } })
        ).resolves.toMatchObject({ m2: [{ _count: { m3: 1 } }] });
        await expect(
            db.m1.findFirst({
                include: { m2: { select: { _count: { select: { m3: { where: { value: { gt: 1 } } } } } } } },
            })
        ).resolves.toMatchObject({ m2: [{ _count: { m3: 0 } }] });
    });
});

describe('Relation one-to-many filter with field-level rules', () => {
    const model = `
    model M1 {
        id String @id @default(uuid())
        m2 M2[]
    
        @@allow('all', true)
    }
    
    model M2 {
        id String @id @default(uuid())
        value Int @allow('read', !deleted)
        deleted Boolean @default(false)
        m1 M1 @relation(fields: [m1Id], references:[id])
        m1Id String
        m3 M3[]
    
        @@allow('read', true)
        @@allow('create', true)
    }

    model M3 {
        id String @id @default(uuid())
        value Int @deny('read', deleted)
        deleted Boolean @default(false)
        m2 M2 @relation(fields: [m2Id], references:[id])
        m2Id String

        @@allow('read', true)
        @@allow('create', true)
    }
    `;

    it('some filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            id: '2-1',
                            value: 1,
                            m3: {
                                create: {
                                    id: '3-1',
                                    value: 1,
                                },
                            },
                        },
                        {
                            id: '2-2',
                            value: 2,
                            deleted: true,
                            m3: {
                                create: {
                                    id: '3-2',
                                    value: 2,
                                    deleted: true,
                                },
                            },
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        some: {},
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        some: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveFalsy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        some: { id: '2-2' },
                    },
                },
            })
        ).toResolveTruthy();

        // include clause

        const r = await db.m1.findFirst({
            where: { id: '1' },
            include: {
                m2: {
                    where: {
                        m3: {
                            some: {},
                        },
                    },
                },
            },
        });
        expect(r.m2).toHaveLength(2);

        let r1 = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            some: { value: { gt: 1 } },
                        },
                    },
                },
            },
        });
        expect(r1.m2).toHaveLength(0);

        r1 = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            some: { id: { equals: '3-2' } },
                        },
                    },
                },
            },
        });
        expect(r1.m2).toHaveLength(1);
    });

    it('none filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            id: '2-1',
                            value: 1,
                            m3: {
                                create: {
                                    id: '3-1',
                                    value: 1,
                                },
                            },
                        },
                        {
                            id: '2-2',
                            value: 2,
                            deleted: true,
                            m3: {
                                create: {
                                    id: '3-2',
                                    value: 2,
                                    deleted: true,
                                },
                            },
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        none: {},
                    },
                },
            })
        ).toResolveFalsy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        none: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        none: { id: '2-1' },
                    },
                },
            })
        ).toResolveFalsy();

        // include clause

        let r = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            none: { value: { gt: 1 } },
                        },
                    },
                },
            },
        });
        expect(r.m2).toHaveLength(2);

        r = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            none: { id: { equals: '3-2' } },
                        },
                    },
                },
            },
        });
        expect(r.m2).toHaveLength(1);
    });

    it('every filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            id: '2-1',
                            value: 1,
                            m3: {
                                create: {
                                    id: '3-1',
                                    value: 1,
                                },
                            },
                        },
                        {
                            id: '2-2',
                            value: 2,
                            deleted: true,
                            m3: {
                                create: {
                                    id: '3-2',
                                    value: 2,
                                    deleted: true,
                                },
                            },
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        every: {},
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        every: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveFalsy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        every: { id: { contains: '2' } },
                    },
                },
            })
        ).toResolveTruthy();

        // include clause

        const r = await db.m1.findFirst({
            where: { id: '1' },
            include: {
                m2: {
                    where: {
                        m3: {
                            every: {},
                        },
                    },
                },
            },
        });
        expect(r.m2).toHaveLength(2);

        let r1 = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            every: { value: { gt: 1 } },
                        },
                    },
                },
            },
        });
        expect(r1.m2).toHaveLength(1);

        r1 = await db.m1.findFirst({
            where: {
                id: '1',
            },
            include: {
                m2: {
                    where: {
                        m3: {
                            every: { id: { contains: '3' } },
                        },
                    },
                },
            },
        });
        expect(r1.m2).toHaveLength(2);
    });
});

describe('Relation one-to-many filter with field-level override rules', () => {
    const model = `
    model M1 {
        id String @id @default(uuid())
        m2 M2[]
    
        @@allow('all', true)
    }
    
    model M2 {
        id String @id @default(uuid()) @allow('read', true, true)
        value Int @allow('read', !deleted)
        deleted Boolean @default(false)
        m1 M1 @relation(fields: [m1Id], references:[id])
        m1Id String
    
        @@allow('read', !deleted)
        @@allow('create', true)
    }
    `;

    it('some filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            id: '2-1',
                            value: 1,
                        },
                        {
                            id: '2-2',
                            value: 2,
                            deleted: true,
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        some: {},
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        some: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveFalsy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        some: { id: '2-2' },
                    },
                },
            })
        ).toResolveTruthy();
    });

    it('none filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            id: '2-1',
                            value: 1,
                        },
                        {
                            id: '2-2',
                            value: 2,
                            deleted: true,
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        none: {},
                    },
                },
            })
        ).toResolveFalsy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        none: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        none: { id: '2-1' },
                    },
                },
            })
        ).toResolveFalsy();
    });

    it('every filter', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: [
                        {
                            id: '2-1',
                            value: 1,
                        },
                        {
                            id: '2-2',
                            value: 2,
                            deleted: true,
                        },
                    ],
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        every: {},
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        every: { value: { gt: 1 } },
                    },
                },
            })
        ).toResolveFalsy();

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        every: { id: { contains: '2' } },
                    },
                },
            })
        ).toResolveTruthy();
    });
});
