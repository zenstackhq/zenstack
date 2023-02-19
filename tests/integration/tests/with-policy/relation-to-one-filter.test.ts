import path from 'path';
import { MODEL_PRELUDE, loadPrisma } from '../../utils';

describe('With Policy: relation to-one filter', () => {
    let origDir: string;
    const suite = 'relation-to-one-filter';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    const model = `
    ${MODEL_PRELUDE}

    model M1 {
        id String @id @default(uuid())
        m2 M2?
    
        @@allow('all', true)
    }
    
    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1 @relation(fields: [m1Id], references:[id])
        m1Id String @unique
        m3 M3?
    
        @@allow('read', !deleted)
        @@allow('create', true)
    }

    model M3 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m2 M2 @relation(fields: [m2Id], references:[id])
        m2Id String @unique

        @@allow('read', !deleted)
        @@allow('create', true)
    }
    `;

    it('is filter', async () => {
        const { withPolicy } = await loadPrisma(`${suite}/is-filter`, model);

        const db = withPolicy();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: {
                                value: 1,
                            },
                        },
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        is: { value: 1 },
                    },
                },
            })
        ).toResolveTruthy();

        // m1 with m2
        await db.m1.create({
            data: {
                id: '2',
                m2: {
                    create: {
                        value: 1,
                        deleted: true,
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        is: { value: 1 },
                    },
                },
            })
        ).toResolveFalsy();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '3',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: {
                                value: 1,
                                deleted: true,
                            },
                        },
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '3',
                    m2: {
                        is: {
                            m3: { value: 1 },
                        },
                    },
                },
            })
        ).toResolveFalsy();

        // m1 with null m2
        await db.m1.create({
            data: {
                id: '4',
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '4',
                    m2: {
                        is: { value: 1 },
                    },
                },
            })
        ).toResolveFalsy();
    });

    it('isNot filter', async () => {
        const { withPolicy } = await loadPrisma(`${suite}/isNot-filter`, model);

        const db = withPolicy();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: {
                                value: 1,
                            },
                        },
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        isNot: { value: 0 },
                    },
                },
            })
        ).toResolveTruthy();

        // m1 with m2
        await db.m1.create({
            data: {
                id: '2',
                m2: {
                    create: {
                        value: 1,
                        deleted: true,
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        isNot: { value: 0 },
                    },
                },
            })
        ).toResolveTruthy();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '3',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: {
                                value: 1,
                                deleted: true,
                            },
                        },
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '3',
                    m2: {
                        isNot: {
                            m3: {
                                isNot: { value: 0 },
                            },
                        },
                    },
                },
            })
        ).toResolveTruthy();

        // m1 with null m2
        await db.m1.create({
            data: {
                id: '4',
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '4',
                    m2: {
                        isNot: { value: 1 },
                    },
                },
            })
        ).toResolveTruthy();
    });

    it('direct object filter', async () => {
        const { withPolicy } = await loadPrisma(`${suite}/direct-object-filter`, model);

        const db = withPolicy();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: {
                                value: 1,
                            },
                        },
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '1',
                    m2: {
                        value: 1,
                    },
                },
            })
        ).toResolveTruthy();

        // m1 with m2
        await db.m1.create({
            data: {
                id: '2',
                m2: {
                    create: {
                        value: 1,
                        deleted: true,
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '2',
                    m2: {
                        value: 1,
                    },
                },
            })
        ).toResolveFalsy();

        // m1 with m2 and m3
        await db.m1.create({
            data: {
                id: '3',
                m2: {
                    create: {
                        value: 1,
                        m3: {
                            create: {
                                value: 1,
                                deleted: true,
                            },
                        },
                    },
                },
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '3',
                    m2: {
                        m3: { value: 1 },
                    },
                },
            })
        ).toResolveFalsy();

        // m1 with null m2
        await db.m1.create({
            data: {
                id: '4',
            },
        });

        await expect(
            db.m1.findFirst({
                where: {
                    id: '4',
                    m2: {
                        value: 1,
                    },
                },
            })
        ).toResolveFalsy();
    });
});
