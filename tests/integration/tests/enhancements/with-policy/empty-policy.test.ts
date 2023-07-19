import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy:empty policy', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('direct operations', async () => {
        const { withPolicy } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
        }
        `
        );

        const db = withPolicy();

        await expect(db.model.create({ data: {} })).toBeRejectedByPolicy();

        expect(await db.model.findMany()).toHaveLength(0);
        expect(await db.model.findUnique({ where: { id: '1' } })).toBeNull();
        expect(await db.model.findFirst({ where: { id: '1' } })).toBeNull();
        await expect(db.model.findUniqueOrThrow({ where: { id: '1' } })).toBeNotFound();
        await expect(db.model.findFirstOrThrow({ where: { id: '1' } })).toBeNotFound();

        await expect(db.model.create({ data: {} })).toBeRejectedByPolicy();
        await expect(db.model.createMany({ data: [{}] })).toBeRejectedByPolicy();

        await expect(db.model.update({ where: { id: '1' }, data: {} })).toBeRejectedByPolicy();
        await expect(db.model.updateMany({ data: {} })).toBeRejectedByPolicy();
        await expect(
            db.model.upsert({
                where: { id: '1' },
                create: {},
                update: {},
            })
        ).toBeRejectedByPolicy();

        await expect(db.model.delete({ where: { id: '1' } })).toBeRejectedByPolicy();
        await expect(db.model.deleteMany()).toBeRejectedByPolicy();

        await expect(db.model.aggregate({})).toBeRejectedByPolicy();
        await expect(db.model.groupBy({})).toBeRejectedByPolicy();
        await expect(db.model.count()).toBeRejectedByPolicy();
    });

    it('to-many write', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2[]
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        }
        `
        );

        const db = withPolicy();

        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: [{}],
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });

    it('to-one write', async () => {
        const { withPolicy } = await loadSchema(
            `
        model M1 {
            id String @id @default(uuid())
            m2 M2?
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String @unique
        }
        `
        );

        const db = withPolicy();

        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: {},
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });
});
