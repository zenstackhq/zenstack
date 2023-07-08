import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: relation many-to-many filter', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    const model = `
    model M1 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m2 M2[]
    
        @@allow('read', !deleted)
        @@allow('create', true)
    }
    
    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1[]
    
        @@allow('read', !deleted)
        @@allow('create', true)
    }
    `;

    it('some filter', async () => {
        const { withPolicy } = await loadSchema(model);

        const db = withPolicy();

        await db.m1.create({
            data: {
                id: '1',
                value: 1,
                m2: {
                    create: [
                        {
                            id: '1',
                            value: 1,
                        },
                        {
                            id: '2',
                            value: 2,
                            deleted: true,
                        },
                    ],
                },
            },
        });

        // m1 -> m2 lookup
        const r = await db.m1.findFirst({
            where: {
                id: '1',
                m2: {
                    some: {},
                },
            },
            include: {
                _count: { select: { m2: true } },
            },
        });
        expect(r._count.m2).toBe(1);

        // m2 -> m1 lookup
        await expect(
            db.m2.findFirst({
                where: {
                    id: '1',
                    m1: {
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

        // m1 with empty m2 list
        await db.m1.create({
            data: {
                id: '2',
                value: 1,
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
        const { withPolicy } = await loadSchema(model);

        const db = withPolicy();

        await db.m1.create({
            data: {
                id: '1',
                value: 1,
                m2: {
                    create: [
                        { id: '1', value: 1 },
                        { id: '2', value: 2, deleted: true },
                    ],
                },
            },
        });

        // m1 -> m2 lookup
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

        // m2 -> m1 lookup
        await expect(
            db.m2.findFirst({
                where: {
                    m1: {
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

        // m1 with empty m2 list
        await db.m1.create({
            data: {
                id: '2',
                value: 2,
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
        const { withPolicy } = await loadSchema(model);

        const db = withPolicy();

        await db.m1.create({
            data: {
                id: '1',
                value: 1,
                m2: {
                    create: [
                        { id: '1', value: 1 },
                        { id: '2', value: 2, deleted: true },
                    ],
                },
            },
        });

        // m1 -> m2 lookup
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

        // m2 -> m1 lookup
        await expect(
            db.m2.findFirst({
                where: {
                    id: '1',
                    m1: {
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

        // m1 with empty m2 list
        await db.m1.create({
            data: {
                id: '2',
                value: 2,
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
});
