import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: unique as id', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('unique fields', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model A {
            x String @unique
            y Int @unique
            value Int
            b B?

            @@allow('read', true)
            @@allow('create', value > 0)
        }

        model B {
            b1 String @unique
            b2 String @unique
            value Int
            a A @relation(fields: [ax], references: [x])
            ax String @unique

            @@allow('read', value > 2)
            @@allow('create', value > 1)
        }
        `
        );

        const db = enhance();

        await expect(db.a.create({ data: { x: '1', y: 1, value: 0 } })).toBeRejectedByPolicy();
        await expect(db.a.create({ data: { x: '1', y: 2, value: 1 } })).toResolveTruthy();

        await expect(
            db.a.create({ data: { x: '2', y: 3, value: 1, b: { create: { b1: '1', b2: '2', value: 1 } } } })
        ).toBeRejectedByPolicy();

        const r = await db.a.create({
            include: { b: true },
            data: { x: '2', y: 3, value: 1, b: { create: { b1: '1', b2: '2', value: 2 } } },
        });
        expect(r.b).toBeNull();
        const r1 = await prisma.b.findUnique({ where: { b1: '1' } });
        expect(r1.value).toBe(2);

        await expect(
            db.a.create({
                include: { b: true },
                data: { x: '3', y: 4, value: 1, b: { create: { b1: '2', b2: '3', value: 3 } } },
            })
        ).toResolveTruthy();
    });

    it('unique fields mixed with id', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model A {
            id Int @id @default(autoincrement())
            x String @unique
            y Int @unique
            value Int
            b B?

            @@allow('read', true)
            @@allow('create', value > 0)
        }

        model B {
            id Int @id @default(autoincrement())
            b1 String @unique
            b2 String @unique
            value Int
            a A @relation(fields: [ax], references: [x])
            ax String @unique

            @@allow('read', value > 2)
            @@allow('create', value > 1)
        }
        `
        );

        const db = enhance();

        await expect(db.a.create({ data: { x: '1', y: 1, value: 0 } })).toBeRejectedByPolicy();
        await expect(db.a.create({ data: { x: '1', y: 2, value: 1 } })).toResolveTruthy();

        await expect(
            db.a.create({ data: { x: '2', y: 3, value: 1, b: { create: { b1: '1', b2: '2', value: 1 } } } })
        ).toBeRejectedByPolicy();

        const r = await db.a.create({
            include: { b: true },
            data: { x: '2', y: 3, value: 1, b: { create: { b1: '1', b2: '2', value: 2 } } },
        });
        expect(r.b).toBeNull();
        const r1 = await prisma.b.findUnique({ where: { b1: '1' } });
        expect(r1.value).toBe(2);

        await expect(
            db.a.create({
                include: { b: true },
                data: { x: '3', y: 4, value: 1, b: { create: { b1: '2', b2: '3', value: 3 } } },
            })
        ).toResolveTruthy();
    });

    it('model-level unique fields', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model A {
            x String
            y Int
            value Int
            b B?
            @@unique([x, y])

            @@allow('read', true)
            @@allow('create', value > 0)
        }

        model B {
            b1 String
            b2 String
            value Int
            a A @relation(fields: [ax, ay], references: [x, y])
            ax String
            ay Int

            @@allow('read', value > 2)
            @@allow('create', value > 1)

            @@unique([ax, ay])
            @@unique([b1, b2])
        }
        `
        );

        const db = enhance();

        await expect(db.a.create({ data: { x: '1', y: 1, value: 0 } })).toBeRejectedByPolicy();
        await expect(db.a.create({ data: { x: '1', y: 2, value: 1 } })).toResolveTruthy();

        await expect(
            db.a.create({ data: { x: '2', y: 1, value: 1, b: { create: { b1: '1', b2: '2', value: 1 } } } })
        ).toBeRejectedByPolicy();

        const r = await db.a.create({
            include: { b: true },
            data: { x: '2', y: 1, value: 1, b: { create: { b1: '1', b2: '2', value: 2 } } },
        });
        expect(r.b).toBeNull();
        const r1 = await prisma.b.findUnique({ where: { b1_b2: { b1: '1', b2: '2' } } });
        expect(r1.value).toBe(2);

        await expect(
            db.a.create({
                include: { b: true },
                data: { x: '3', y: 1, value: 1, b: { create: { b1: '2', b2: '2', value: 3 } } },
            })
        ).toResolveTruthy();
    });

    it('unique fields with to-many nested update', async () => {
        const { enhance } = await loadSchema(
            `
        model A {
            id Int @id @default(autoincrement())
            x Int
            y Int
            value Int
            bs B[]
            @@unique([x, y])

            @@allow('read,create', true)
            @@allow('update,delete', value > 0)
        }

        model B {
            id Int @id @default(autoincrement())
            value Int
            a A @relation(fields: [aId], references: [id])
            aId Int

            @@allow('all', value > 0)
        }
        `,
            { logPrismaQuery: true }
        );

        const db = enhance();

        await db.a.create({
            data: { x: 1, y: 1, value: 1, bs: { create: [{ id: 1, value: 1 }] } },
        });

        await db.a.create({
            data: { x: 2, y: 2, value: 2, bs: { create: [{ id: 2, value: 2 }] } },
        });

        await db.a.update({
            where: { x_y: { x: 1, y: 1 } },
            data: { bs: { updateMany: { data: { value: 3 } } } },
        });

        // check b#1 is updated
        await expect(db.b.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ value: 3 });

        // check b#2 is not affected
        await expect(db.b.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ value: 2 });

        await db.a.update({
            where: { x_y: { x: 1, y: 1 } },
            data: { bs: { deleteMany: {} } },
        });

        // check b#1 is deleted
        await expect(db.b.findUnique({ where: { id: 1 } })).resolves.toBeNull();

        // check b#2 is not affected
        await expect(db.b.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ value: 2 });
    });

    it('unique fields with to-one nested update', async () => {
        const { enhance } = await loadSchema(
            `
        model A {
            id Int @id @default(autoincrement())
            x Int
            y Int
            value Int
            b B?
            @@unique([x, y])

            @@allow('read,create', true)
            @@allow('update,delete', value > 0)
        }

        model B {
            id Int @id @default(autoincrement())
            value Int
            a A @relation(fields: [aId], references: [id])
            aId Int @unique

            @@allow('all', value > 0)
        }
        `
        );

        const db = enhance();

        await db.a.create({
            data: { x: 1, y: 1, value: 1, b: { create: { id: 1, value: 1 } } },
        });

        await db.a.create({
            data: { x: 2, y: 2, value: 2, b: { create: { id: 2, value: 2 } } },
        });

        await db.a.update({
            where: { x_y: { x: 1, y: 1 } },
            data: { b: { update: { data: { value: 3 } } } },
        });

        // check b#1 is updated
        await expect(db.b.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ value: 3 });

        // check b#2 is not affected
        await expect(db.b.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ value: 2 });

        await db.a.update({
            where: { x_y: { x: 1, y: 1 } },
            data: { b: { delete: true } },
        });

        // check b#1 is deleted
        await expect(db.b.findUnique({ where: { id: 1 } })).resolves.toBeNull();
        await expect(db.a.findUnique({ where: { x_y: { x: 1, y: 1 } }, include: { b: true } })).resolves.toMatchObject({
            b: null,
        });

        // check b#2 is not affected
        await expect(db.b.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ value: 2 });
        await expect(db.a.findUnique({ where: { x_y: { x: 2, y: 2 } }, include: { b: true } })).resolves.toBeTruthy();
    });
});
