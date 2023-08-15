import { loadSchema, createPostgresDb, dropPostgresDb } from '@zenstackhq/testtools';
import path from 'path';

const DB_NAME = 'field-comparison';

describe('WithPolicy: field comparison tests', () => {
    let origDir: string;
    let dbUrl: string;
    let prisma: any;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    beforeEach(async () => {
        dbUrl = await createPostgresDb(DB_NAME);
    });

    afterEach(async () => {
        if (prisma) {
            await prisma.$disconnect();
            prisma = undefined;
        }
        await dropPostgresDb(DB_NAME);
        process.chdir(origDir);
    });

    it('field comparison success with input check', async () => {
        const r = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x Int
            y Int

            @@allow('create', x > y)
            @@allow('read', true)
        }
        `,
            { provider: 'postgresql', dbUrl }
        );

        prisma = r.prisma;
        const db = r.withPolicy();
        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 2, y: 1 } })).toResolveTruthy();
    });

    it('field comparison success with policy check', async () => {
        const r = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x Int @default(0)
            y Int @default(0)

            @@allow('create', x > y)
            @@allow('read', true)
        }
        `,
            { provider: 'postgresql', dbUrl }
        );

        prisma = r.prisma;
        const db = r.withPolicy();
        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 2, y: 1 } })).toResolveTruthy();
    });

    it('field in operator success with input check', async () => {
        const r = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x String
            y String[]

            @@allow('create', x in y)
            @@allow('read', x in y)
        }
        `,
            { provider: 'postgresql', dbUrl }
        );

        prisma = r.prisma;
        const db = r.withPolicy();
        await expect(db.model.create({ data: { x: 'a', y: ['b', 'c'] } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 'a', y: ['a', 'c'] } })).toResolveTruthy();
    });

    it('field in operator success with policy check', async () => {
        const r = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x String @default('x')
            y String[]

            @@allow('create', x in y)
            @@allow('read', x in y)
        }
        `,
            { provider: 'postgresql', dbUrl }
        );

        prisma = r.prisma;
        const db = r.withPolicy();
        await expect(db.model.create({ data: { x: 'a', y: ['b', 'c'] } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 'a', y: ['a', 'c'] } })).toResolveTruthy();
    });

    it('field comparison type error', async () => {
        await expect(
            loadSchema(
                `
        model Model {
            id String @id @default(uuid())
            x Int
            y String

            @@allow('create', x > y)
            @@allow('read', true)
        }
        `
            )
        ).rejects.toThrow(/invalid operand type/);
    });
});
