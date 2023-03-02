import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy:nested to-one', () => {
    let origDir: string;
    const suite = 'nested-to-one';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('create and update tests', async () => {
        const { withPolicy } = await loadSchema(
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
        
            @@allow('read', true)
            @@allow('create', value > 0)
            @@allow('update', value > 1)
        }
        `
        );

        const db = withPolicy();

        // create denied
        await expect(
            db.m1.create({
                data: {
                    m2: {
                        create: { value: 0 },
                    },
                },
            })
        ).toBeRejectedByPolicy();

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

        // nested update denied
        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        update: { value: 2 },
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });

    it('nested create', async () => {
        const { withPolicy } = await loadSchema(
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
        
            @@allow('read', true)
            @@allow('create', value > 0)
            @@allow('update', value > 1)
        }
        `
        );

        const db = withPolicy();

        await db.m1.create({
            data: {
                id: '1',
            },
        });

        // nested create denied
        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        create: { value: 0 },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        create: { value: 1 },
                    },
                },
            })
        ).toResolveTruthy();
    });

    it('nested delete', async () => {
        const { withPolicy } = await loadSchema(
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
        
            @@allow('read', true)
            @@allow('create', true)
            @@allow('update', true)
            @@allow('delete', value > 1)
        }
        `
        );

        const db = withPolicy();

        await db.m1.create({
            data: {
                id: '1',
                m2: {
                    create: { id: '1', value: 1 },
                },
            },
        });

        // nested delete denied
        await expect(
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: { delete: true },
                },
            })
        ).toBeRejectedByPolicy();
        expect(await db.m2.findUnique({ where: { id: '1' } })).toBeTruthy();

        // update m2 so it can be deleted
        await db.m1.update({
            where: { id: '1' },
            data: {
                m2: { update: { value: 3 } },
            },
        });

        expect(
            await db.m1.update({
                where: { id: '1' },
                data: {
                    m2: { delete: true },
                },
            })
        ).toBeTruthy();
        // check deleted
        expect(await db.m2.findUnique({ where: { id: '1' } })).toBeNull();
    });

    it('nested relation delete', async () => {
        const { withPolicy } = await loadSchema(
            `
        model User {
            id String @id @default(uuid())
            m1 M1?

            @@allow('all', true)
        }

        model M1 {
            id String @id @default(uuid())
            value Int
            user User @relation(fields: [userId], references: [id])
            userId String @unique
        
            @@allow('create', true)
            @@allow('all', auth() == user)
        }
        `
        );

        await expect(
            withPolicy({ id: 'user1' }).user.create({
                data: {
                    id: 'user1',
                    m1: {
                        create: { value: 1 },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            withPolicy({ id: 'user2' }).user.create({
                data: {
                    id: 'user2',
                    m1: {
                        create: { value: 2 },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            withPolicy({ id: 'user1' }).user.update({
                where: { id: 'user1' },
                data: {
                    m1: { delete: true },
                },
            })
        ).toResolveTruthy();
    });
});
