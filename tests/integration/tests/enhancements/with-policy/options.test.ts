import { enhance } from '@zenstackhq/runtime';
import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('Password test', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('load path', async () => {
        const { prisma } = await loadSchema(
            `
        model Foo {
            id String @id @default(cuid())
            x Int
        
            @@allow('read', true)
            @@allow('create', x > 0)
        }`,
            { getPrismaOnly: true, output: './zen' }
        );

        const db = enhance(prisma, undefined, { loadPath: './zen' });
        await expect(
            db.foo.create({
                data: { x: 0 },
            })
        ).toBeRejectedByPolicy();
        await expect(
            db.foo.create({
                data: { x: 1 },
            })
        ).toResolveTruthy();
    });

    it('prisma module', async () => {
        const { prisma, Prisma, modelMeta, policy } = await loadSchema(
            `
        model Foo {
            id String @id @default(cuid())
            x Int
        
            @@allow('read', true)
            @@allow('create', x > 0)
        }`
        );

        const db = enhance(prisma, undefined, { modelMeta, policy, prismaModule: Prisma });
        await expect(
            db.foo.create({
                data: { x: 0 },
            })
        ).toBeRejectedByPolicy();
        await expect(
            db.foo.create({
                data: { x: 1 },
            })
        ).toResolveTruthy();
    });

    it('overrides', async () => {
        const { prisma } = await loadSchema(
            `
        model Foo {
            id String @id @default(cuid())
            x Int
        
            @@allow('create', x > 0)
        }`,
            { getPrismaOnly: true, output: './zen' }
        );

        const db = enhance(prisma, undefined, {
            modelMeta: require(path.resolve('./zen/model-meta')).default,
            policy: require(path.resolve('./zen/policy')).default,
        });
        await expect(
            db.foo.create({
                data: { x: 0 },
            })
        ).toBeRejectedByPolicy();
    });
});
