import { expectPolicyDeny, loadPrisma } from '../utils';
import path from 'path';
import fs from 'fs';
import { MODEL_PRELUDE } from '../common';

describe('Operation Coverage: nested to-many', () => {
    let origDir: string;
    const suite = 'nested-to-many';

    beforeAll(async () => {
        origDir = path.resolve('.');
        const baseDir = `./tests/test-run/cases/${suite}`;
        if (fs.existsSync(baseDir)) {
            fs.rmSync(baseDir, { recursive: true, force: true });
        }
        fs.mkdirSync(baseDir, { recursive: true });
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('create', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/create`,
            `
        ${MODEL_PRELUDE}

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
        await expectPolicyDeny(() =>
            db.m1.create({
                data: {
                    m2: {
                        create: { value: 0 },
                    },
                },
            })
        );

        expect(
            await db.m1.create({
                data: {
                    m2: {
                        create: { value: 1 },
                    },
                },
            })
        );

        // multi create denied
        await expectPolicyDeny(() =>
            db.m1.create({
                data: {
                    m2: {
                        create: [{ value: 0 }, { value: 1 }],
                    },
                },
            })
        );

        expect(
            await db.m1.create({
                data: {
                    m2: {
                        create: [{ value: 1 }, { value: 2 }],
                    },
                },
            })
        );
    });

    it('update', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/update`,
            `
        ${MODEL_PRELUDE}

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
        await expectPolicyDeny(() =>
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
        );

        await db.m1.create({
            data: {
                id: '2',
                m2: {
                    create: { id: '2', value: 2 },
                },
            },
        });

        // update success
        expect(
            (
                await db.m1.update({
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
                })
            ).m2
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: '2', value: 3 }),
            ])
        );
    });

    it('update with create', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/update with create`,
            `
        ${MODEL_PRELUDE}

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

        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        create: [{ value: 0 }, { value: 1 }],
                    },
                },
            })
        );

        expect(
            (
                await db.m1.update({
                    where: { id: '1' },
                    include: { m2: true },
                    data: {
                        m2: {
                            create: [{ value: 1 }, { value: 2 }],
                        },
                    },
                })
            ).m2
        ).toHaveLength(3);
    });

    it('update with delete', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/update with delete`,
            `
        ${MODEL_PRELUDE}

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

        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        delete: { id: '1' },
                    },
                },
            })
        );

        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        deleteMany: { OR: [{ id: '2' }, { id: '3' }] },
                    },
                },
            })
        );

        expect(
            await db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        delete: { id: '3' },
                    },
                },
            })
        ).toBeTruthy();

        expect(await db.m2.findUnique({ where: { id: '3' } })).toBeNull();

        expect(
            await db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        deleteMany: { value: { gte: 4 } },
                    },
                },
            })
        ).toBeTruthy();

        expect(
            await db.m2.findMany({ where: { id: { in: ['4', '5'] } } })
        ).toHaveLength(0);
    });

    it('create with nested read', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/create with nested read`,
            `
        ${MODEL_PRELUDE}

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

        await db.m1.create({
            data: {
                id: '1',
                value: 1,
            },
        });

        // included 'm1' can't be read
        await expectPolicyDeny(() =>
            db.m2.create({
                include: { m1: true },
                data: {
                    id: '1',
                    value: 1,
                    m1: { connect: { id: '1' } },
                },
            })
        );
        expect(await db.m2.findUnique({ where: { id: '1' } })).toBeTruthy();

        // included 'm1' can't be read
        await expectPolicyDeny(() =>
            db.m3.create({
                include: { m1: true },
                data: {
                    id: '1',
                    value: 1,
                    m1: { connect: { id: '1' } },
                },
            })
        );
        expect(await db.m3.findUnique({ where: { id: '1' } })).toBeTruthy();

        // nested to-many got filtered on read
        expect(
            (
                await db.m1.create({
                    include: { m2: true },
                    data: {
                        value: 2,
                        m2: { create: [{ value: 0 }, { value: 1 }] },
                    },
                })
            ).m2
        ).toHaveLength(1);

        // read-back for to-one relation rejected
        await expectPolicyDeny(() =>
            db.m1.create({
                include: { m3: true },
                data: {
                    value: 2,
                    m3: { create: { value: 0 } },
                },
            })
        );
    });

    it('update with nested read', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/update with nested read`,
            `
        ${MODEL_PRELUDE}

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

        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
                include: { m3: true },
                data: {
                    m3: {
                        update: {
                            value: 1,
                        },
                    },
                },
            })
        );

        const r = await db.m1.update({
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
        expect(r.m3.value).toBe(2);
        // m2 got filtered
        expect(r.m2).toHaveLength(0);

        const r1 = await db.m1.update({
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
        expect(r1.m2).toHaveLength(1);
    });
});
