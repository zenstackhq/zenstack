import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('Password test', () => {
    it('load path', async () => {
        const { prisma, projectDir } = await loadSchema(
            `
        model Foo {
            id String @id @default(cuid())
            x Int
        
            @@allow('read', true)
            @@allow('create', x > 0)
        }`,
            { getPrismaOnly: true, output: './zen' }
        );

        const enhance = require(path.join(projectDir, 'zen/enhance')).enhance;
        const db = enhance(prisma);
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
        const { prisma, projectDir } = await loadSchema(
            `
        model Foo {
            id String @id @default(cuid())
            x Int
        
            @@allow('create', x > 0)
        }`,
            { getPrismaOnly: true, output: './zen' }
        );

        const enhance = require(path.join(projectDir, 'zen/enhance')).enhance;
        const db = enhance(prisma, {
            modelMeta: require(path.join(projectDir, 'zen/model-meta')).default,
            policy: require(path.resolve(projectDir, 'zen/policy')).default,
        });
        await expect(
            db.foo.create({
                data: { x: 0 },
            })
        ).toBeRejectedByPolicy();
    });
});
