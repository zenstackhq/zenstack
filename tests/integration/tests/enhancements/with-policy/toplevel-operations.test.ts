import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy:toplevel operations', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('read tests', async () => {
        const { withPolicy, prisma } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('create', true)
            @@allow('read', value > 1)
        }
        `
        );

        const db = withPolicy();

        await expect(
            db.model.create({
                data: {
                    id: '1',
                    value: 1,
                },
            })
        ).toBeRejectedByPolicy();
        const fromPrisma = await prisma.model.findUnique({
            where: { id: '1' },
        });
        expect(fromPrisma).toBeTruthy();

        expect(await db.model.findMany()).toHaveLength(0);
        expect(await db.model.findUnique({ where: { id: '1' } })).toBeNull();
        expect(await db.model.findFirst({ where: { id: '1' } })).toBeNull();
        await expect(db.model.findUniqueOrThrow({ where: { id: '1' } })).toBeNotFound();
        await expect(db.model.findFirstOrThrow({ where: { id: '1' } })).toBeNotFound();

        const item2 = {
            id: '2',
            value: 2,
        };
        const r1 = await db.model.create({
            data: item2,
        });
        expect(r1).toBeTruthy();
        expect(await db.model.findMany()).toHaveLength(1);
        expect(await db.model.findUnique({ where: { id: '2' } })).toEqual(expect.objectContaining(item2));
        expect(await db.model.findFirst({ where: { id: '2' } })).toEqual(expect.objectContaining(item2));
        expect(await db.model.findUniqueOrThrow({ where: { id: '2' } })).toEqual(expect.objectContaining(item2));
        expect(await db.model.findFirstOrThrow({ where: { id: '2' } })).toEqual(expect.objectContaining(item2));
    });

    it('write tests', async () => {
        const { withPolicy } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 1)
            @@allow('create', value > 0)
            @@allow('update', value > 1)
        }
        `
        );

        const db = withPolicy();

        // create denied
        await expect(
            db.model.create({
                data: {
                    value: 0,
                },
            })
        ).toBeRejectedByPolicy();

        // can't read back
        await expect(
            db.model.create({
                data: {
                    id: '1',
                    value: 1,
                },
            })
        ).toBeRejectedByPolicy();

        // success
        expect(
            await db.model.create({
                data: {
                    id: '2',
                    value: 2,
                },
            })
        ).toBeTruthy();

        // update not found
        await expect(db.model.update({ where: { id: '3' }, data: { value: 5 } })).toBeNotFound();

        // update-many empty
        expect(
            await db.model.updateMany({
                where: { id: '3' },
                data: { value: 5 },
            })
        ).toEqual(expect.objectContaining({ count: 0 }));

        // upsert
        expect(
            await db.model.upsert({
                where: { id: '3' },
                create: { id: '3', value: 5 },
                update: { value: 6 },
            })
        ).toEqual(expect.objectContaining({ value: 5 }));

        // update denied
        await expect(
            db.model.update({
                where: { id: '1' },
                data: {
                    value: 3,
                },
            })
        ).toBeRejectedByPolicy();

        // update success
        expect(
            await db.model.update({
                where: { id: '2' },
                data: {
                    value: 3,
                },
            })
        ).toBeTruthy();
    });

    it('delete tests', async () => {
        const { withPolicy, prisma } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('create', true)
            @@allow('read', value > 2)
            @@allow('delete', value > 1)
        }
        `
        );

        const db = withPolicy();

        await expect(db.model.delete({ where: { id: '1' } })).toBeNotFound();

        await expect(
            db.model.create({
                data: { id: '1', value: 1 },
            })
        ).toBeRejectedByPolicy();

        await expect(db.model.delete({ where: { id: '1' } })).toBeRejectedByPolicy();
        expect(await prisma.model.findUnique({ where: { id: '1' } })).toBeTruthy();

        await expect(
            db.model.create({
                data: { id: '2', value: 2 },
            })
        ).toBeRejectedByPolicy();
        // deleted but unable to read back
        await expect(db.model.delete({ where: { id: '2' } })).toBeRejectedByPolicy();
        expect(await prisma.model.findUnique({ where: { id: '2' } })).toBeNull();

        await expect(
            db.model.create({
                data: { id: '2', value: 2 },
            })
        ).toBeRejectedByPolicy();
        // only '2' is deleted, '1' is rejected by policy
        expect(await db.model.deleteMany()).toEqual(expect.objectContaining({ count: 1 }));
        expect(await prisma.model.findUnique({ where: { id: '2' } })).toBeNull();
        expect(await prisma.model.findUnique({ where: { id: '1' } })).toBeTruthy();

        expect(await db.model.deleteMany()).toEqual(expect.objectContaining({ count: 0 }));
    });
});
