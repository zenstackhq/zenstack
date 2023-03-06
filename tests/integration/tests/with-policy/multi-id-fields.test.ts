import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: multiple id fields', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('multi-id fields', async () => {
        const { prisma, withPolicy } = await loadSchema(
            `
        model A {
            x String
            y Int
            value Int
            b B?
            @@id([x, y])

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
            @@id([b1, b2])
        }
        `
        );

        const db = withPolicy();

        await expect(db.a.create({ data: { x: '1', y: 1, value: 0 } })).toBeRejectedByPolicy();
        await expect(db.a.create({ data: { x: '1', y: 2, value: 1 } })).toResolveTruthy();

        await expect(
            db.a.create({ data: { x: '2', y: 1, value: 1, b: { create: { b1: '1', b2: '2', value: 1 } } } })
        ).toBeRejectedByPolicy();

        await expect(
            db.a.create({
                include: { b: true },
                data: { x: '2', y: 1, value: 1, b: { create: { b1: '1', b2: '2', value: 2 } } },
            })
        ).toBeRejectedByPolicy();
        const r = await prisma.b.findUnique({ where: { b1_b2: { b1: '1', b2: '2' } } });
        expect(r.value).toBe(2);

        await expect(
            db.a.create({
                include: { b: true },
                data: { x: '3', y: 1, value: 1, b: { create: { b1: '2', b2: '2', value: 3 } } },
            })
        ).toResolveTruthy();
    });
});
