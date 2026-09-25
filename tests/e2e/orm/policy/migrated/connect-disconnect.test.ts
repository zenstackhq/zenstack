import { describe, expect, it } from 'vitest';
import { createPolicyTestClient } from '@zenstackhq/testtools';

describe('connect and disconnect tests', () => {
    const modelToMany = `
    model M1 {
        id String @id @default(uuid())
        m2 M2[]
        value Int @default(0)

        @@deny('read', value < 0)
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

    it('works with top-level to-many', async () => {
        const db = await createPolicyTestClient(modelToMany);
        const rawDb = db.$unuseAll();

        // m1-1 -> m2-1
        await db.m2.create({ data: { id: 'm2-1', value: 1, deleted: false } });
        await db.m1.create({
            data: {
                id: 'm1-1',
                m2: {
                    connect: { id: 'm2-1' },
                },
            },
        });
        // mark m2-1 deleted
        await rawDb.m2.update({
            where: { id: 'm2-1' },
            data: { deleted: true },
        });
        // disconnect denied because of violation of m2's update rule
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: {
                    m2: {
                        disconnect: { id: 'm2-1' },
                    },
                },
                include: { m2: true },
            }),
        ).resolves.toMatchObject({
            m2: [expect.objectContaining({ id: 'm2-1' })],
        });
        // reset m2-1 delete
        await rawDb.m2.update({
            where: { id: 'm2-1' },
            data: { deleted: false },
        });
        // disconnect allowed
        await db.m1.update({
            where: { id: 'm1-1' },
            data: {
                m2: {
                    disconnect: { id: 'm2-1' },
                },
            },
        });

        // connect during create denied
        await db.m2.create({ data: { id: 'm2-2', value: 1, deleted: true } });
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        connect: { id: 'm2-2' },
                    },
                },
            }),
        ).toBeRejectedNotFound();

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
            }),
        ).toBeRejectedNotFound();

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
            }),
        ).toBeRejectedNotFound();
    });

    it('works with nested to-many', async () => {
        const db = await createPolicyTestClient(modelToMany);

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
            }),
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
            }),
        ).toBeRejectedNotFound();
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

    it('works with to-one', async () => {
        const db = await createPolicyTestClient(modelToOne);
        const rawDb = db.$unuseAll();

        await db.m2.create({ data: { id: 'm2-1', value: 1, deleted: false } });
        await db.m1.create({
            data: {
                id: 'm1-1',
                m2: {
                    connect: { id: 'm2-1' },
                },
            },
        });
        await rawDb.m2.update({
            where: { id: 'm2-1' },
            data: { deleted: true },
        });
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: {
                    m2: {
                        disconnect: { id: 'm2-1' },
                    },
                },
                include: { m2: true },
            }),
        ).resolves.toMatchObject({
            m2: expect.objectContaining({ id: 'm2-1' }),
        });
        await rawDb.m2.update({
            where: { id: 'm2-1' },
            data: { deleted: false },
        });
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
            }),
        ).toBeRejectedNotFound();

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
            }),
        ).toBeRejectedNotFound();
    });

    const modelImplicitManyToMany = `
    model M1 {
        id String @id @default(uuid())
        value Int @default(0)
        m2 M2[]

        @@deny('read', value < 0)
        @@allow('all', true)
    }

    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1[]

        @@deny('read', value < 0)
        @@allow('read,create', true)
        @@allow('update', !deleted)
    }
    `;

    it('works with implicit many-to-many', async () => {
        const db = await createPolicyTestClient(modelImplicitManyToMany);
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-2', value: 1 } });
        await rawDb.m2.create({
            data: { id: 'm2-2', value: 1, deleted: true },
        });
        // m2-2 not updatable
        await expect(
            db.m1.update({
                where: { id: 'm1-2' },
                data: { m2: { connect: { id: 'm2-2' } } },
            }),
        ).toBeRejectedByPolicy();
    });

    const modelExplicitManyToMany = `
    model M1 {
        id String @id @default(uuid())
        value Int @default(0)
        m2 M1OnM2[]

        @@allow('all', true)
    }

    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1OnM2[]

        @@allow('read,create', true)
    }

    model M1OnM2 {
        m1 M1 @relation(fields: [m1Id], references: [id])
        m1Id String
        m2 M2 @relation(fields: [m2Id], references: [id])
        m2Id String

        @@id([m1Id, m2Id])
        @@allow('read', true)
        @@allow('create', !m2.deleted)
    }
    `;

    it('works with explicit many-to-many', async () => {
        const db = await createPolicyTestClient(modelExplicitManyToMany);
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-1', value: 1 } });
        await rawDb.m2.create({ data: { id: 'm2-1', value: 1 } });
        await expect(
            db.m1OnM2.create({
                data: {
                    m1: { connect: { id: 'm1-1' } },
                    m2: { connect: { id: 'm2-1' } },
                },
            }),
        ).toResolveTruthy();

        await rawDb.m1.create({ data: { id: 'm1-2', value: 1 } });
        await rawDb.m2.create({
            data: { id: 'm2-2', value: 1, deleted: true },
        });
        await expect(
            db.m1OnM2.create({
                data: {
                    m1: { connect: { id: 'm1-2' } },
                    m2: { connect: { id: 'm2-2' } },
                },
            }),
        ).toBeRejectedByPolicy();
    });

    it('inherits model-level update policy when no field-level policy is declared', async () => {
        const db = await createPolicyTestClient(
            `
    model M1 {
        id String @id @default(uuid())
        value Int @default(0)
        m2 M2[]

        @@allow('all', true)
    }

    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1[]

        @@allow('read,create', true)
        @@allow('update', !deleted)
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-1', value: 1 } });
        await rawDb.m2.create({ data: { id: 'm2-1', value: 1, deleted: false } });
        // both sides updatable -> connect allowed
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();

        await rawDb.m2.create({ data: { id: 'm2-2', value: 1, deleted: true } });
        // m2-2 not updatable -> connect rejected
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-2' } } },
            }),
        ).toBeRejectedByPolicy();

        // disconnect of an updatable side is allowed
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();
    });

    it('field-level allow overrides restrictive model-level update policy', async () => {
        const db = await createPolicyTestClient(
            `
    model M1 {
        id String @id @default(uuid())
        value Int @default(0)
        m2 M2[]

        @@allow('all', true)
    }

    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1[] @allow('update', true)

        @@allow('read,create', true)
        @@allow('update', !deleted)
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-1', value: 1 } });
        await rawDb.m2.create({ data: { id: 'm2-1', value: 1, deleted: true } });
        // model-level policy would reject (deleted), but field-level allow overrides it
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();

        // the override applies to disconnect as well
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();
    });

    it('field-level deny overrides permissive model-level update policy', async () => {
        const db = await createPolicyTestClient(
            `
    model M1 {
        id String @id @default(uuid())
        value Int @default(0)
        m2 M2[]

        @@allow('all', true)
    }

    model M2 {
        id String @id @default(uuid())
        value Int
        deleted Boolean @default(false)
        m1 M1[] @deny('update', deleted)

        @@allow('read,create', true)
        @@allow('update', !deleted)
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-1', value: 1 } });
        await rawDb.m2.create({ data: { id: 'm2-1', value: 1, deleted: false } });
        // not deleted -> field-level deny not triggered, connect allowed
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();

        await rawDb.m2.create({ data: { id: 'm2-2', value: 1, deleted: true } });
        // deleted -> field-level deny triggers, connect rejected
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-2' } } },
            }),
        ).toBeRejectedByPolicy();

        // mark m2-1 deleted after connecting -> field-level deny triggers on disconnect
        await rawDb.m2.update({
            where: { id: 'm2-1' },
            data: { deleted: true },
        });
        // disconnect is also rejected for the denied side
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: { id: 'm2-1' } } },
            }),
        ).toBeRejectedByPolicy();
    });

    it('field-level allow on a read-only model enables connect (issue #2382)', async () => {
        const db = await createPolicyTestClient(
            `
    model M1 {
        id String @id @default(uuid())
        value Int @default(0)
        m2 M2[]

        @@allow('all', true)
    }

    model M2 {
        id String @id @default(uuid())
        value Int
        m1 M1[] @allow('update', true)

        @@allow('read,create', true)
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-1', value: 1 } });
        await rawDb.m2.create({ data: { id: 'm2-1', value: 1 } });
        // M2 has no model-level update policy, but the field-level allow on m1 enables connect
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();

        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();
    });

    it('checks both sides of the relation', async () => {
        const db = await createPolicyTestClient(
            `
    model M1 {
        id String @id @default(uuid())
        value Int @default(0)
        m2 M2[] @deny('update', value > 0)

        @@allow('all', true)
    }

    model M2 {
        id String @id @default(uuid())
        value Int
        m1 M1[]

        @@allow('all', true)
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-1', value: 0 } });
        await rawDb.m2.create({ data: { id: 'm2-1', value: 1 } });
        // m1-1 value is 0 -> field-level deny not triggered, connect allowed
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();

        await rawDb.m1.create({ data: { id: 'm1-2', value: 1 } });
        // m1-2 value is 1 -> field-level deny on the "source" side triggers, connect rejected
        await expect(
            db.m1.update({
                where: { id: 'm1-2' },
                data: { m2: { connect: { id: 'm2-1' } } },
            }),
        ).toBeRejectedByPolicy();
    });
});
