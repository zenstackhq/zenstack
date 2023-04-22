import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: multi-field unique', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('toplevel crud test unnamed constraint', async () => {
        const { withPolicy } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            a String
            b String
            x Int
            @@unique([a, b])

            @@allow('all', x > 0)
            @@deny('update', future().x <= 0)
        }
        `
        );

        const db = withPolicy();

        await expect(db.model.create({ data: { a: 'a1', b: 'b1', x: 1 } })).toResolveTruthy();
        await expect(db.model.create({ data: { a: 'a1', b: 'b1', x: 2 } })).toBeRejectedWithCode('P2002');
        await expect(db.model.create({ data: { a: 'a2', b: 'b2', x: 0 } })).toBeRejectedByPolicy();

        await expect(db.model.findUnique({ where: { a_b: { a: 'a1', b: 'b1' } } })).toResolveTruthy();
        await expect(db.model.findUnique({ where: { a_b: { a: 'a1', b: 'b2' } } })).toResolveFalsy();
        await expect(db.model.update({ where: { a_b: { a: 'a1', b: 'b1' } }, data: { x: 2 } })).toResolveTruthy();
        await expect(db.model.update({ where: { a_b: { a: 'a1', b: 'b1' } }, data: { x: 0 } })).toBeRejectedByPolicy();

        await expect(db.model.delete({ where: { a_b: { a: 'a1', b: 'b1' } } })).toResolveTruthy();
    });

    it('toplevel crud test named constraint', async () => {
        const { withPolicy } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            a String
            b String
            x Int
            @@unique([a, b], name: 'myconstraint')

            @@allow('all', x > 0)
            @@deny('update', future().x <= 0)
        }
        `
        );

        const db = withPolicy();

        await expect(db.model.create({ data: { a: 'a1', b: 'b1', x: 1 } })).toResolveTruthy();
        await expect(db.model.findUnique({ where: { myconstraint: { a: 'a1', b: 'b1' } } })).toResolveTruthy();
        await expect(db.model.findUnique({ where: { myconstraint: { a: 'a1', b: 'b2' } } })).toResolveFalsy();
        await expect(
            db.model.update({ where: { myconstraint: { a: 'a1', b: 'b1' } }, data: { x: 2 } })
        ).toResolveTruthy();
        await expect(
            db.model.update({ where: { myconstraint: { a: 'a1', b: 'b1' } }, data: { x: 0 } })
        ).toBeRejectedByPolicy();
        await expect(db.model.delete({ where: { myconstraint: { a: 'a1', b: 'b1' } } })).toResolveTruthy();
    });

    it('nested crud test', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2[]
            @@allow('all', true)
        }

        model M2 {
            id String @id @default(uuid())
            a String
            b String
            x Int
            m1 M1 @relation(fields: [m1Id], references: [id])
            m1Id String

            @@unique([a, b])
            @@allow('all', x > 0)
        }
        `
        );

        const db = withPolicy();

        await expect(db.m1.create({ data: { id: '1', m2: { create: { a: 'a1', b: 'b1', x: 1 } } } })).toResolveTruthy();
        await expect(
            db.m1.create({ data: { id: '2', m2: { create: { a: 'a1', b: 'b1', x: 2 } } } })
        ).toBeRejectedWithCode('P2002');
        await expect(
            db.m1.create({ data: { id: '3', m2: { create: { a: 'a1', b: 'b2', x: 0 } } } })
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        connectOrCreate: {
                            where: { a_b: { a: 'a1', b: 'b1' } },
                            create: { a: 'a1', b: 'b1', x: 2 },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(db.m2.count()).resolves.toBe(1);

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        connectOrCreate: {
                            where: { a_b: { a: 'a1', b: 'b2' } },
                            create: { a: 'a1', b: 'b2', x: 2 },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(db.m2.count()).resolves.toBe(2);

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        connectOrCreate: {
                            where: { a_b: { a: 'a2', b: 'b2' } },
                            create: { a: 'a2', b: 'b2', x: 0 },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        update: {
                            where: { a_b: { a: 'a1', b: 'b2' } },
                            data: { x: 3 },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(db.m2.findUnique({ where: { a_b: { a: 'a1', b: 'b2' } } })).resolves.toEqual(
            expect.objectContaining({ x: 3 })
        );

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        delete: {
                            a_b: { a: 'a1', b: 'b1' },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(db.m2.count()).resolves.toBe(1);
    });
});
