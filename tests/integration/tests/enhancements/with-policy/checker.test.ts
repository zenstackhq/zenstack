import { loadSchema } from '@zenstackhq/testtools';

describe('Permission checker', () => {
    it('simple', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id String @id @default(uuid())
                value Int
                @@allow('read', value == 1)
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 0 })).toResolveFalsy();
        await expect(db.model.check('read', { value: 1 })).toResolveTruthy();
    });
});
