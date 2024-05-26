import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: post update', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('simple allow', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int

            @@allow('create,read', true)
            @@allow('update', future().value > 1)
        }
        `
        );

        const db = enhance();

        await expect(db.model.create({ data: { id: '1', value: 0 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 1 } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 2 } })).toResolveTruthy();
    });

    it('simple deny', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int

            @@allow('all', true)
            @@deny('update', future().value <= 1)
        }
        `
        );

        const db = enhance();

        await expect(db.model.create({ data: { id: '1', value: 0 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 1 } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 2 } })).toResolveTruthy();
    });

    it('mixed pre and post', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int

            @@allow('create,read', true)
            @@allow('update', value > 0 && future().value > value)
        }
        `
        );

        const db = enhance();

        await expect(db.model.create({ data: { id: '1', value: 0 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 1 } })).toBeRejectedByPolicy();

        await expect(db.model.create({ data: { id: '2', value: 3 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: '2' }, data: { value: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: '2' }, data: { value: 4 } })).toResolveTruthy();
    });

    it('functions pre-update', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value String
            x Int

            @@allow('create,read', true)
            @@allow('update', startsWith(value, 'hello') && future().x > 0)
        }
        `
        );

        const db = enhance();

        await prisma.model.create({ data: { id: '1', value: 'good', x: 1 } });
        await expect(db.model.update({ where: { id: '1' }, data: { value: 'hello' } })).toBeRejectedByPolicy();

        await prisma.model.update({ where: { id: '1' }, data: { value: 'hello world' } });
        const r = await db.model.update({ where: { id: '1' }, data: { value: 'hello new world' } });
        expect(r.value).toBe('hello new world');
    });

    it('functions post-update', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value String
            x Int

            @@allow('create,read', true)
            @@allow('update', x > 0 && startsWith(future().value, 'hello'))
        }
        `
        );

        const db = enhance();

        await prisma.model.create({ data: { id: '1', value: 'good', x: 1 } });
        await expect(db.model.update({ where: { id: '1' }, data: { value: 'nice' } })).toBeRejectedByPolicy();

        const r = await db.model.update({ where: { id: '1' }, data: { x: 0, value: 'hello world' } });
        expect(r.value).toBe('hello world');
    });

    it('collection predicate pre-update', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            value Int
            m2 M2[]
            @@allow('read', true)
            @@allow('update', m2?[value > 0] && future().value > 0)
        }

        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String

            @@allow('all', true)
        }
        `
        );

        const db = enhance();

        await prisma.m1.create({
            data: {
                id: '1',
                value: 0,
                m2: {
                    create: [{ id: '1', value: 0 }],
                },
            },
        });

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { value: 1 },
            })
        ).toBeRejectedByPolicy();

        await prisma.m2.create({
            data: {
                id: '2',
                m1: { connect: { id: '1' } },
                value: 1,
            },
        });

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { value: 1 },
            })
        ).toResolveTruthy();
    });

    it('collection predicate post-update', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            value Int
            m2 M2[]
            @@allow('read', true)
            @@allow('update', value > 0 && future().m2?[value > 0])
        }

        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String

            @@allow('all', true)
        }
        `
        );

        const db = enhance();

        await prisma.m1.create({
            data: {
                id: '1',
                value: 1,
                m2: {
                    create: [{ id: '1', value: 0 }],
                },
            },
        });

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { value: 2 },
            })
        ).toBeRejectedByPolicy();

        await prisma.m2.create({
            data: {
                id: '2',
                m1: { connect: { id: '1' } },
                value: 1,
            },
        });

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { value: 2 },
            })
        ).toResolveTruthy();
    });

    it('collection predicate deep-nested post-update', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            value Int
            m2 M2?
            @@allow('read', true)
            @@allow('update', value > 0 && future().m2.m3?[value > 0])
        }

        model M2 {
            id String @id @default(uuid())
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String @unique
            m3 M3[]
            @@allow('all', true)
        }

        model M3 {
            id String @id @default(uuid())
            value Int
            m2 M2 @relation(fields: [m2Id], references:[id])
            m2Id String

            @@allow('all', true)
        }
        `
        );

        const db = enhance();

        await prisma.m1.create({
            data: {
                id: '1',
                value: 1,
                m2: {
                    create: { id: '1', m3: { create: [{ id: '1', value: 0 }] } },
                },
            },
        });

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { value: 2 },
            })
        ).toBeRejectedByPolicy();

        await prisma.m3.create({
            data: {
                id: '2',
                m2: { connect: { id: '1' } },
                value: 1,
            },
        });

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { value: 2 },
            })
        ).toResolveTruthy();
    });

    it('nested to-many', async () => {
        const { enhance } = await loadSchema(
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

            @@allow('create,read', true)
            @@allow('update', future().value > 1)
        }
        `
        );

        const db = enhance();

        await expect(
            db.m1.create({
                data: {
                    id: '1',
                    m2: {
                        create: [
                            { id: '1', value: 0 },
                            { id: '2', value: 1 },
                        ],
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { m2: { updateMany: { where: {}, data: { value: { increment: 1 } } } } },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { m2: { updateMany: { where: { value: { gte: 1 } }, data: { value: { increment: 1 } } } } },
            })
        ).toResolveTruthy();

        await expect(db.m2.findMany()).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: '1', value: 0 }),
                expect.objectContaining({ id: '2', value: 2 }),
            ])
        );
    });

    it('nested to-one', async () => {
        const { enhance } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2?
            @@allow('all', true)
        }

        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String @unique

            @@allow('create,read', true)
            @@allow('update', future().value > 1)
        }
        `
        );

        const db = enhance();

        await expect(
            db.m1.create({
                data: {
                    id: '1',
                    m2: {
                        create: { id: '1', value: 0 },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { m2: { update: { value: { increment: 1 } } } },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { m2: { update: { value: { increment: 2 } } } },
            })
        ).toResolveTruthy();

        await expect(db.m2.findMany()).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ value: 2 })])
        );
    });

    it('nested select', async () => {
        const { enhance } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2?
            @@allow('create,read', true)
            @@allow('update', future().m2.value > m2.value)
        }

        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String @unique

            @@allow('all', true)
        }
        `
        );

        const db = enhance();

        await expect(
            db.m1.create({
                data: {
                    id: '1',
                    m2: {
                        create: { id: '1', value: 1 },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { m2: { update: { value: 0 } } },
            })
        ).toResolveTruthy(); // m2 updatable

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { m2: { update: { value: 2 } } },
            })
        ).toResolveTruthy();

        await expect(db.m2.findFirst()).resolves.toEqual(expect.objectContaining({ value: 2 }));
    });

    it('deep nesting', async () => {
        const { enhance } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2?
            @@allow('all', true)
        }

        model M2 {
            id String @id @default(uuid())
            value Int
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String @unique
            m3 M3[]

            @@allow('create,read', true)
            @@allow('update', future().value > 1)
        }

        model M3 {
            id String @id @default(uuid())
            value Int
            m2 M2 @relation(fields: [m2Id], references:[id])
            m2Id String

            @@allow('create,read', true)
            @@allow('update', future().value > 2)
        }
        `
        );

        const db = enhance();

        await expect(
            db.m1.create({
                data: {
                    id: '1',
                    m2: {
                        create: {
                            id: '1',
                            value: 0,
                            m3: {
                                create: [
                                    { id: '1', value: 0 },
                                    { id: '2', value: 1 },
                                ],
                            },
                        },
                    },
                },
            })
        ).toResolveTruthy();

        // rejected because nested m3 update fails post-update rule
        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: { update: { value: 2, m3: { updateMany: { where: {}, data: { value: { increment: 2 } } } } } },
                },
            })
        ).toBeRejectedByPolicy();

        // rejected because nested m2 update fails post-update rule
        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: { update: { value: 1, m3: { updateMany: { where: {}, data: { value: { increment: 3 } } } } } },
                },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: { update: { value: 2, m3: { updateMany: { where: {}, data: { value: { increment: 3 } } } } } },
                },
            })
        ).toResolveTruthy();

        await expect(db.m2.findFirst()).resolves.toEqual(expect.objectContaining({ value: 2 }));
        await expect(db.m3.findMany()).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ value: 3 }), expect.objectContaining({ value: 4 })])
        );
    });
});
