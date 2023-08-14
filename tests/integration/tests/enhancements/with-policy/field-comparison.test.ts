import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('WithPolicy: field comparison tests', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('field comparison', async () => {
        const { prisma, withPolicy } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x Int
            y Int

            @@allow('create', x > y)
        }
        `
        );

        const db = withPolicy();
        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 2, y: 1 } })).toResolveTruthy();
    });
});
