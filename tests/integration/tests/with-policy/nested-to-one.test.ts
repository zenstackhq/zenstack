import { expectPolicyDeny, loadPrisma } from '../utils';
import path from 'path';
import fs from 'fs';
import { MODEL_PRELUDE } from '../common';

describe('Operation Coverage: nested to-one', () => {
    let origDir: string;
    const suite = 'nested-to-one';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('create and update tests', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/create and update`,
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
        
            @@allow('read', true)
            @@allow('create', value > 0)
            @@allow('update', value > 1)
        }
        `
        );

        const db = withPolicy();

        // create denied
        await expectPolicyDeny(() =>
            db.m1.create({
                data: {
                    m2: {
                        create: { value: 0 },
                    },
                },
            })
        );

        expect(
            await db.m1.create({
                data: {
                    id: '1',
                    m2: {
                        create: { id: '1', value: 1 },
                    },
                },
            })
        );

        // nested update denied
        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        update: { value: 2 },
                    },
                },
            })
        );
    });

    it('nested create', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/nested create`,
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
        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        create: { value: 0 },
                    },
                },
            })
        );

        expect(
            await db.m1.update({
                where: { id: '1' },
                data: {
                    m2: {
                        create: { value: 1 },
                    },
                },
            })
        );
    });

    it('nested delete', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/nested delete`,
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
        
            @@allow('read', true)
            @@allow('create', true)
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
        await expectPolicyDeny(() =>
            db.m1.update({
                where: { id: '1' },
                data: {
                    m2: { delete: true },
                },
            })
        );
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
});
