import path from 'path';
import { MODEL_PRELUDE, loadPrisma } from '../../utils';

describe('With Policy: post update', () => {
    let origDir: string;
    const suite = 'post-update';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('simple allow', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/simple-allow`,
            `
        ${MODEL_PRELUDE}

        model Model {
            id String @id @default(uuid())
            value Int

            @@allow('create,read', true)
            @@allow('update', future().value > 1)
        }
        `
        );

        const db = withPolicy();

        await expect(db.model.create({ data: { id: '1', value: 0 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 1 } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 2 } })).toResolveTruthy();
    });

    it('simple deny', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/simple-deny`,
            `
        ${MODEL_PRELUDE}

        model Model {
            id String @id @default(uuid())
            value Int

            @@allow('all', true)
            @@deny('update', future().value <= 1)
        }
        `
        );

        const db = withPolicy();

        await expect(db.model.create({ data: { id: '1', value: 0 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 1 } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 2 } })).toResolveTruthy();
    });

    it('mixed pre and post', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/mixed`,
            `
        ${MODEL_PRELUDE}

        model Model {
            id String @id @default(uuid())
            value Int

            @@allow('create,read', true)
            @@allow('update', value > 0 && future().value > value)
        }
        `
        );

        const db = withPolicy();

        await expect(db.model.create({ data: { id: '1', value: 0 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: '1' }, data: { value: 1 } })).toBeRejectedByPolicy();

        await expect(db.model.create({ data: { id: '2', value: 3 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: '2' }, data: { value: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: '2' }, data: { value: 4 } })).toResolveTruthy();
    });

    it('nested to-many', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/nested-to-many`,
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

            @@allow('create,read', true)
            @@allow('update', future().value > 1)
        }
        `
        );

        const db = withPolicy();

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
        const { withPolicy } = await loadPrisma(
            `${suite}/nested-to-one`,
            `
        ${MODEL_PRELUDE}

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

        const db = withPolicy();

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
        const { withPolicy } = await loadPrisma(
            `${suite}/nested-select`,
            `
        ${MODEL_PRELUDE}

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

        const db = withPolicy();

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
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: { m2: { update: { value: 2 } } },
            })
        ).toResolveTruthy();

        await expect(db.m2.findFirst()).resolves.toEqual(expect.objectContaining({ value: 2 }));
    });

    it('deep nesting', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/deep-nesting`,
            `
        ${MODEL_PRELUDE}

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

        const db = withPolicy();

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
