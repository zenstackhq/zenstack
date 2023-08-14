import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';
import { Pool } from 'pg';

const DB_NAME = 'field-comparison';

describe('WithPolicy: field comparison tests', () => {
    let origDir: string;
    let prisma: any;

    const pool = new Pool({ user: 'postgres', password: 'abc123' });

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    beforeEach(async () => {
        await pool.query(`DROP DATABASE IF EXISTS "${DB_NAME}";`);
        await pool.query(`CREATE DATABASE "${DB_NAME}";`);
    });

    afterEach(async () => {
        process.chdir(origDir);
        if (prisma) {
            await prisma.$disconnect();
        }
        await pool.query(`DROP DATABASE IF EXISTS "${DB_NAME}";`);
    });

    it('field comparison success with input check', async () => {
        const r = await loadSchema(
            `
        datasource db {
            provider = 'postgresql'
            url = 'postgres://postgres:abc123@localhost:5432/${DB_NAME}'
        }
            
        generator js {
            provider = 'prisma-client-js'
        }

        model Model {
            id String @id @default(uuid())
            x Int
            y Int

            @@allow('create', x > y)
            @@allow('read', true)
        }
        `,
            { addPrelude: false }
        );

        prisma = r.prisma;
        const db = r.withPolicy();
        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 2, y: 1 } })).toResolveTruthy();
    });

    it('field comparison success with policy check', async () => {
        const r = await loadSchema(
            `
        datasource db {
            provider = 'postgresql'
            url = 'postgres://postgres:abc123@localhost:5432/${DB_NAME}'
        }
            
        generator js {
            provider = 'prisma-client-js'
        }

        model Model {
            id String @id @default(uuid())
            x Int @default(0)
            y Int @default(0)

            @@allow('create', x > y)
            @@allow('read', true)
        }
        `,
            { addPrelude: false }
        );

        prisma = r.prisma;
        const db = r.withPolicy();
        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 2, y: 1 } })).toResolveTruthy();
    });

    it('field in operator success with input check', async () => {
        const r = await loadSchema(
            `
        datasource db {
            provider = 'postgresql'
            url = 'postgres://postgres:abc123@localhost:5432/${DB_NAME}'
        }
            
        generator js {
            provider = 'prisma-client-js'
        }

        model Model {
            id String @id @default(uuid())
            x String
            y String[]

            @@allow('create', x in y)
            @@allow('read', x in y)
        }
        `,
            { addPrelude: false }
        );

        prisma = r.prisma;
        const db = r.withPolicy();
        await expect(db.model.create({ data: { x: 'a', y: ['b', 'c'] } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 'a', y: ['a', 'c'] } })).toResolveTruthy();
    });

    it('field in operator success with policy check', async () => {
        const r = await loadSchema(
            `
        datasource db {
            provider = 'postgresql'
            url = 'postgres://postgres:abc123@localhost:5432/${DB_NAME}'
        }
            
        generator js {
            provider = 'prisma-client-js'
        }

        model Model {
            id String @id @default(uuid())
            x String @default('x')
            y String[]

            @@allow('create', x in y)
            @@allow('read', x in y)
        }
        `,
            { addPrelude: false }
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
