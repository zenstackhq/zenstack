import { WeakDbClientContract, expectPolicyDeny, loadPrisma } from '../utils';
import path from 'path';
import fs from 'fs';
import { MODEL_PRELUDE } from '../common';
import { DbClientContract } from '@zenstackhq/runtime';

describe('Operation Coverage: deep nested', () => {
    let origDir: string;
    const suite = 'deep-nested';

    const model = `
    ${MODEL_PRELUDE}

    // M1 - M2 -  M3
    //           -* M4
    model M1 {
        id String @id @default(cuid())
        m2 M2?

        @@allow('all', true)
        @@deny('create', m2.m4?[value == 100])
        @@deny('update', m2.m4?[value == 101])
    }

    model M2 {
        id String @id @default(cuid())
        value Int
        m1 M1 @relation(fields: [m1Id], references: [id], onDelete: Cascade)
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
        m2Id String @unique

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
        m2Id String?

        @@allow('read', true)
        @@allow('create', value > 20)
        @@allow('update', value > 21)
        @@allow('delete', value > 22)
        @@deny('read', value == 200)
    }
    `;

    let db: WeakDbClientContract;

    beforeAll(async () => {
        origDir = path.resolve('.');
        const baseDir = `./tests/test-run/cases/${suite}`;
        if (fs.existsSync(baseDir)) {
            fs.rmSync(baseDir, { recursive: true, force: true });
        }
        fs.mkdirSync(baseDir, { recursive: true });
    });

    beforeEach(async () => {
        const { withPolicy } = await loadPrisma(`${suite}/shared`, model);
        db = withPolicy();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('create', async () => {
        expect(
            await db.m1.create({
                data: {
                    id: '1',
                    m2: {
                        create: {
                            id: 'm2-1',
                            value: 1,
                            m3: {
                                create: {
                                    id: 'm3-1',
                                    value: 11,
                                },
                            },
                            m4: {
                                create: [
                                    { id: 'm4-1', value: 21 },
                                    { id: 'm4-2', value: 22 },
                                ],
                            },
                        },
                    },
                },
            })
        ).toBeTruthy();

        const r = await db.m1.create({
            include: { m2: { include: { m3: true, m4: true } } },
            data: {
                id: '2',
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
        await expectPolicyDeny(() =>
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
        );

        // deep create violation due to deep policy
        await expectPolicyDeny(() =>
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
        );

        // deep connect violation via deep policy: @@deny('create', m2.m4?[value == 100])
        await db.m4.create({
            data: {
                id: 'm4-value-100',
                value: 100,
            },
        });
        await expectPolicyDeny(() =>
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
        );

        // create read-back filter: M4 @@deny('read', value == 200)
        expect(
            (
                await db.m1.create({
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
                })
            ).m2.m4
        ).toHaveLength(1);

        // create read-back rejection: M3 @@deny('read', value == 200)
        await expectPolicyDeny(() =>
            db.m1.create({
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
            })
        );
    });

    it('update', async () => {
        await db.m1.create({
            data: { id: '1' },
        });

        // success
        expect(
            await db.m1.update({
                where: { id: '1' },
                include: { m2: { include: { m3: true, m4: true } } },
                data: {
                    m2: {
                        create: {
                            id: 'm2-1',
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
        ).toBeTruthy();

        // deep update with connect/disconnect/delete success
        await db.m4.create({
            data: {
                id: 'm4-3',
                value: 23,
            },
        });
        const r = await db.m1.update({
            where: { id: '1' },
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
        expect(
            await db.m1.update({
                where: { id: '1' },
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
        ).toBeTruthy();

        // deep update violation
        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
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
        );

        // deep update violation via deep policy: @@deny('update', m2.m4?[value == 101])
        await db.m1.create({
            data: {
                id: '2',
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
        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '2' },
                data: {
                    m2: {
                        update: {
                            m4: {
                                updateMany: {
                                    where: { value: { gt: 0 } },
                                    data: { value: 102 },
                                },
                            },
                        },
                    },
                },
            })
        );

        // update read-back filter: M4 @@deny('read', value == 200)
        const r1 = await db.m1.update({
            where: { id: '1' },
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
        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
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
            })
        );
    });

    it('delete', async () => {
        await db.m1.create({
            data: {
                id: '1',
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

        // delete read-back filter: M14 @@deny('read', value == 200)
        const r = await db.m1.delete({
            where: { id: '1' },
            include: { m2: { select: { m4: true } } },
        });
        expect(r.m2.m4).toHaveLength(1);

        await db.m1.create({
            data: {
                id: '2',
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

        // delete read-back reject: M3 @@deny('read', value == 200)
        await expectPolicyDeny(() =>
            db.m1.delete({
                where: { id: '2' },
                include: { m2: { select: { m3: { select: { id: true } } } } },
            })
        );
    });
});
