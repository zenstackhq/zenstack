import {
    WeakDbClientContract,
    expectNotFound,
    expectPolicyDeny,
    loadPrisma,
} from '../utils';
import path from 'path';
import { MODEL_PRELUDE } from '../common';

describe('Operation Coverage: toplevel operations', () => {
    let origDir: string;
    const suite = 'toplevel';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('read tests', async () => {
        const { withPolicy, prisma } = await loadPrisma(
            `${suite}/read`,
            `
        ${MODEL_PRELUDE}

        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 1)
        }
        `
        );

        const db = withPolicy();

        const r = await db.model.create({
            data: {
                id: '1',
                value: 1,
            },
        });
        const fromPrisma = await prisma.model.findUnique({
            where: { id: '1' },
        });
        expect(fromPrisma).toBeTruthy();

        // should deny readback
        expect(r).toBeUndefined();
        expect(await db.model.findMany()).toHaveLength(0);
        expect(await db.model.findUnique({ where: { id: '1' } })).toBeNull();
        expect(await db.model.findFirst({ where: { id: '1' } })).toBeNull();
        await expectNotFound(() =>
            db.model.findUniqueOrThrow({ where: { id: '1' } })
        );
        await expectNotFound(() =>
            db.model.findFirstOrThrow({ where: { id: '1' } })
        );

        const item2 = {
            id: '2',
            value: 2,
        };
        const r1 = await db.model.create({
            data: item2,
        });
        expect(r1).toBeTruthy();
        expect(await db.model.findMany()).toHaveLength(1);
        expect(await db.model.findUnique({ where: { id: '2' } })).toEqual(
            expect.objectContaining(item2)
        );
        expect(await db.model.findFirst({ where: { id: '2' } })).toEqual(
            expect.objectContaining(item2)
        );
        expect(
            await db.model.findUniqueOrThrow({ where: { id: '2' } })
        ).toEqual(expect.objectContaining(item2));
        expect(await db.model.findFirstOrThrow({ where: { id: '2' } })).toEqual(
            expect.objectContaining(item2)
        );
    });

    it('write tests', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/write`,
            `
        ${MODEL_PRELUDE}

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
        await expectPolicyDeny(() =>
            db.model.create({
                data: {
                    value: 0,
                },
            })
        );

        // can't read back
        expect(
            await db.model.create({
                data: {
                    id: '1',
                    value: 1,
                },
            })
        ).toBeUndefined();

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
        await expectNotFound(() =>
            db.model.update({ where: { id: '3' }, data: { value: 5 } })
        );
        expect(
            await db.model.updateMany({
                where: { id: '3' },
                data: { value: 5 },
            })
        ).toEqual(expect.objectContaining({ count: 0 }));
        expect(
            await db.model.upsert({
                where: { id: '3' },
                create: { value: 5 },
                update: { value: 6 },
            })
        ).toEqual(expect.objectContaining({ value: 5 }));

        // update denied
        await expectPolicyDeny(() =>
            db.model.update({
                where: { id: '1' },
                data: {
                    value: 3,
                },
            })
        );

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
        const { withPolicy, prisma } = await loadPrisma(
            `${suite}/delete`,
            `
        ${MODEL_PRELUDE}

        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 2)
            @@allow('delete', value > 1)
        }
        `
        );

        const db = withPolicy();

        await expectNotFound(() => db.model.delete({ where: { id: '1' } }));

        await db.model.create({
            data: { id: '1', value: 1 },
        });

        await expectPolicyDeny(() => db.model.delete({ where: { id: '1' } }));
        expect(
            await prisma.model.findUnique({ where: { id: '1' } })
        ).toBeTruthy();

        await db.model.create({
            data: { id: '2', value: 2 },
        });
        // deleted but unable to read back
        await expectPolicyDeny(() => db.model.delete({ where: { id: '2' } }));
        expect(
            await prisma.model.findUnique({ where: { id: '2' } })
        ).toBeNull();

        await db.model.create({
            data: { id: '2', value: 2 },
        });
        // only '2' is deleted, '1' is rejected by policy
        expect(await db.model.deleteMany()).toEqual(
            expect.objectContaining({ count: 1 })
        );
        expect(
            await prisma.model.findUnique({ where: { id: '2' } })
        ).toBeNull();
        expect(
            await prisma.model.findUnique({ where: { id: '1' } })
        ).toBeTruthy();

        expect(await db.model.deleteMany()).toEqual(
            expect.objectContaining({ count: 0 })
        );
    });
});
