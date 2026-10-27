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

    it('batch disconnect verifies every participant in the delete precheck', async () => {
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
        await rawDb.m2.create({ data: { id: 'm2-2', value: 1, deleted: false } });

        // connect both
        await db.m1.update({
            where: { id: 'm1-1' },
            data: { m2: { connect: [{ id: 'm2-1' }, { id: 'm2-2' }] } },
        });

        // both updatable -> batch disconnect succeeds (the precheck must verify every participant
        // without the scalar subquery returning more than one row)
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: [{ id: 'm2-1' }, { id: 'm2-2' }] } },
            }),
        ).toResolveTruthy();

        // reconnect both
        await db.m1.update({
            where: { id: 'm1-1' },
            data: { m2: { connect: [{ id: 'm2-1' }, { id: 'm2-2' }] } },
        });

        // mark one deleted -> batch disconnect rejected because a participant is not updatable
        await rawDb.m2.update({
            where: { id: 'm2-2' },
            data: { deleted: true },
        });
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: [{ id: 'm2-1' }, { id: 'm2-2' }] } },
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
    it('field-level deny-only policy allows by default on a model without update allow', async () => {
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
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-1', value: 1 } });
        await rawDb.m2.create({ data: { id: 'm2-1', value: 1, deleted: false } });
        await rawDb.m2.create({ data: { id: 'm2-2', value: 1, deleted: true } });

        // M2 has no model-level update allow, but the field-level policy overrides it and, having
        // only deny rules, allows by default when the deny is not triggered
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-1' } } },
            }),
        ).toResolveTruthy();

        // deny triggered -> rejected
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-2' } } },
            }),
        ).toBeRejectedByPolicy();

        // same from the other side
        await expect(
            db.m2.update({
                where: { id: 'm2-1' },
                data: { m1: { disconnect: { id: 'm1-1' } } },
            }),
        ).toResolveTruthy();
        await expect(
            db.m2.update({
                where: { id: 'm2-2' },
                data: { m1: { connect: { id: 'm1-1' } } },
            }),
        ).toBeRejectedByPolicy();
    });

    it('field-level mixed allow and deny policies: allow must match and deny wins', async () => {
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
        m1 M1[] @allow('update', value > 0) @deny('update', deleted)

        @@allow('all', true)
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-1', value: 1 } });
        await rawDb.m2.create({ data: { id: 'm2-allowed', value: 1, deleted: false } });
        await rawDb.m2.create({ data: { id: 'm2-not-allowed', value: 0, deleted: false } });
        await rawDb.m2.create({ data: { id: 'm2-denied', value: 1, deleted: true } });

        // allow matches, deny not triggered -> connect allowed
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-allowed' } } },
            }),
        ).toResolveTruthy();

        // allow does not match: with an explicit allow present, access is no longer granted by
        // default even though the model-level policy is permissive
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-not-allowed' } } },
            }),
        ).toBeRejectedByPolicy();

        // allow matches but deny triggers -> deny wins
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { connect: { id: 'm2-denied' } } },
            }),
        ).toBeRejectedByPolicy();

        // disconnect follows the same combination
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: { id: 'm2-allowed' } } },
            }),
        ).toResolveTruthy();
        await rawDb.m1.update({
            where: { id: 'm1-1' },
            data: { m2: { connect: [{ id: 'm2-not-allowed' }, { id: 'm2-denied' }] } },
        });
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: { id: 'm2-not-allowed' } } },
            }),
        ).toBeRejectedByPolicy();
        await expect(
            db.m1.update({
                where: { id: 'm1-1' },
                data: { m2: { disconnect: { id: 'm2-denied' } } },
            }),
        ).toBeRejectedByPolicy();
    });

    it('field-level policies on both sides must both pass, regardless of which side initiates', async () => {
        const db = await createPolicyTestClient(
            `
    model M1 {
        id String @id @default(uuid())
        locked Boolean @default(false)
        m2 M2[] @allow('update', !locked)

        @@allow('all', true)
    }

    model M2 {
        id String @id @default(uuid())
        deleted Boolean @default(false)
        m1 M1[] @deny('update', deleted)

        @@allow('all', true)
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-ok', locked: false } });
        await rawDb.m1.create({ data: { id: 'm1-locked', locked: true } });
        await rawDb.m2.create({ data: { id: 'm2-ok', deleted: false } });
        await rawDb.m2.create({ data: { id: 'm2-deleted', deleted: true } });

        // both pass
        await expect(
            db.m1.update({ where: { id: 'm1-ok' }, data: { m2: { connect: { id: 'm2-ok' } } } }),
        ).toResolveTruthy();
        await expect(
            db.m2.update({ where: { id: 'm2-ok' }, data: { m1: { disconnect: { id: 'm1-ok' } } } }),
        ).toResolveTruthy();
        await expect(
            db.m2.update({ where: { id: 'm2-ok' }, data: { m1: { connect: { id: 'm1-ok' } } } }),
        ).toResolveTruthy();

        // M1 side fails (initiated from M1, then from M2)
        await expect(
            db.m1.update({ where: { id: 'm1-locked' }, data: { m2: { connect: { id: 'm2-ok' } } } }),
        ).toBeRejectedByPolicy();
        await expect(
            db.m2.update({ where: { id: 'm2-ok' }, data: { m1: { connect: { id: 'm1-locked' } } } }),
        ).toBeRejectedByPolicy();

        // M2 side fails (initiated from M1, then from M2)
        await expect(
            db.m1.update({ where: { id: 'm1-ok' }, data: { m2: { connect: { id: 'm2-deleted' } } } }),
        ).toBeRejectedByPolicy();
        await expect(
            db.m2.update({ where: { id: 'm2-deleted' }, data: { m1: { connect: { id: 'm1-ok' } } } }),
        ).toBeRejectedByPolicy();

        // both fail
        await expect(
            db.m1.update({ where: { id: 'm1-locked' }, data: { m2: { connect: { id: 'm2-deleted' } } } }),
        ).toBeRejectedByPolicy();

        // disconnect: one side failing is enough to reject, from either direction
        await rawDb.m1.update({
            where: { id: 'm1-locked' },
            data: { m2: { connect: [{ id: 'm2-ok' }, { id: 'm2-deleted' }] } },
        });
        await rawDb.m1.update({ where: { id: 'm1-ok' }, data: { m2: { connect: { id: 'm2-deleted' } } } });
        await expect(
            db.m1.update({ where: { id: 'm1-locked' }, data: { m2: { disconnect: { id: 'm2-ok' } } } }),
        ).toBeRejectedByPolicy();
        await expect(
            db.m2.update({ where: { id: 'm2-ok' }, data: { m1: { disconnect: { id: 'm1-locked' } } } }),
        ).toBeRejectedByPolicy();
        await expect(
            db.m1.update({ where: { id: 'm1-ok' }, data: { m2: { disconnect: { id: 'm2-deleted' } } } }),
        ).toBeRejectedByPolicy();
        await expect(
            db.m2.update({ where: { id: 'm2-deleted' }, data: { m1: { disconnect: { id: 'm1-ok' } } } }),
        ).toBeRejectedByPolicy();
    });

    it('field-level override on one side does not relax the model-level policy of the other side', async () => {
        const db = await createPolicyTestClient(
            `
    model M1 {
        id String @id @default(uuid())
        archived Boolean @default(false)
        m2 M2[]

        @@allow('read,create', true)
        @@allow('update', !archived)
    }

    model M2 {
        id String @id @default(uuid())
        m1 M1[] @allow('update', true)

        @@allow('read,create', true)
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.m1.create({ data: { id: 'm1-ok', archived: false } });
        await rawDb.m1.create({ data: { id: 'm1-archived', archived: true } });
        await rawDb.m2.create({ data: { id: 'm2-1' } });

        // M2 is read-only at model level but its field-level allow opens the relation; M1 is
        // governed by its model-level update policy
        await expect(
            db.m2.update({ where: { id: 'm2-1' }, data: { m1: { connect: { id: 'm1-ok' } } } }),
        ).toResolveTruthy();
        await expect(
            db.m1.update({ where: { id: 'm1-ok' }, data: { m2: { disconnect: { id: 'm2-1' } } } }),
        ).toResolveTruthy();

        // archived M1 fails its model-level update policy, from either direction
        await expect(
            db.m2.update({ where: { id: 'm2-1' }, data: { m1: { connect: { id: 'm1-archived' } } } }),
        ).toBeRejectedByPolicy();
        // (initiating from M1 fails the top-level update check itself, also a policy rejection)
        await expect(
            db.m1.update({ where: { id: 'm1-archived' }, data: { m2: { connect: { id: 'm2-1' } } } }),
        ).toBeRejectedByPolicy();

        await rawDb.m1.update({ where: { id: 'm1-archived' }, data: { m2: { connect: { id: 'm2-1' } } } });
        await expect(
            db.m2.update({ where: { id: 'm2-1' }, data: { m1: { disconnect: { id: 'm1-archived' } } } }),
        ).toBeRejectedByPolicy();
    });

    it('field-level update policy on m2m field inherited from a delegate base model', async () => {
        const db = await createPolicyTestClient(
            `
    model Tag {
        id String @id @default(uuid())
        name String
        items Item[]

        @@allow('all', true)
    }

    model Item {
        id String @id @default(uuid())
        type String
        deleted Boolean @default(false)
        tags Tag[] @allow('update', !deleted)

        @@delegate(type)
        @@allow('read,create', true)
    }

    model Image extends Item {
        width Int
    }

    model Video extends Item {
        url String
        videoType String
        @@delegate(videoType)
    }

    model Clip extends Video {
        duration Int
    }
    `,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.tag.create({ data: { id: 'tag-1', name: 'tag1' } });
        await rawDb.image.create({ data: { id: 'image-1', width: 100, deleted: false } });
        await rawDb.image.create({ data: { id: 'image-2', width: 200, deleted: true } });
        await rawDb.clip.create({ data: { id: 'clip-1', url: 'c1', duration: 10, deleted: false } });
        await rawDb.clip.create({ data: { id: 'clip-2', url: 'c2', duration: 20, deleted: true } });

        // direct sub-model: the base model has no model-level update allow, the inherited field-level
        // allow enables connect for non-deleted items
        await expect(
            db.image.update({
                where: { id: 'image-1' },
                data: { tags: { connect: { id: 'tag-1' } } },
            }),
        ).toResolveTruthy();
        await expect(
            db.image.update({
                where: { id: 'image-2' },
                data: { tags: { connect: { id: 'tag-1' } } },
            }),
        ).toBeRejectedByPolicy();

        // chained sub-model
        await expect(
            db.clip.update({
                where: { id: 'clip-1' },
                data: { tags: { connect: { id: 'tag-1' } } },
            }),
        ).toResolveTruthy();
        await expect(
            db.clip.update({
                where: { id: 'clip-2' },
                data: { tags: { connect: { id: 'tag-1' } } },
            }),
        ).toBeRejectedByPolicy();

        // from the other side of the relation, the field-level policy of the delegate side still applies
        await expect(
            db.tag.update({
                where: { id: 'tag-1' },
                data: { items: { connect: { id: 'image-2' } } },
            }),
        ).toBeRejectedByPolicy();
        await expect(
            db.tag.update({
                where: { id: 'tag-1' },
                data: { items: { connect: { id: 'clip-2' } } },
            }),
        ).toBeRejectedByPolicy();

        // disconnect follows the same rule
        await expect(
            db.image.update({
                where: { id: 'image-1' },
                data: { tags: { disconnect: { id: 'tag-1' } } },
            }),
        ).toResolveTruthy();
        await expect(
            db.tag.update({
                where: { id: 'tag-1' },
                data: { items: { disconnect: { id: 'clip-1' } } },
            }),
        ).toResolveTruthy();
        await expect(db.tag.findUnique({ where: { id: 'tag-1' }, include: { items: true } })).resolves.toMatchObject({
            items: [],
        });
    });
});
