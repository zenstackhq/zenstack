import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1562', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = "file:./dev.db"
}

plugin zod {
    provider = '@core/zod'
}

plugin enhancer {
    provider = '@core/enhancer'
    generatePermissionChecker = true
}

abstract model Base {
    id        String   @id @default(uuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt()

    // require login
    @@allow('all', true)
}

model User extends Base {
    name String @unique @regex('^[a-zA-Z0-9_]{3,30}$')

    @@allow('read', true)
}
            `,
            { addPrelude: false }
        );

        const db = enhance();
        await expect(db.user.create({ data: { name: '1 2 3 4' } })).toBeRejectedByPolicy();
    });
});
