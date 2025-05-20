import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2106', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                age BigInt
                @@allow('all', true)
            }
            `,
            { logPrismaQuery: true }
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 1, age: 1n } })).toResolveTruthy();
    });
});
