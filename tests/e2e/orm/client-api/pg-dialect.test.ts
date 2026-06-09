import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Postgres dialect tests', () => {
    it('isEmpty function', async () => {
        const schema = `
model User {
    id        Int      @id @default(autoincrement())
    roles     Role[]

    @@allow('all', true)
    @@deny('create', isEmpty(roles))
}

enum Role {
    AUTHOR
    EDITOR
}
    `;

        const client = await createPolicyTestClient(schema, {
            usePrismaPush: true,
            provider: 'postgresql',
        });

        await expect(client.user.create({
            data: {
                id: 1,
                roles: ['AUTHOR'],
            },
        })).resolves.toMatchObject({
            id: 1,
            roles: ['AUTHOR'],
        });
    });

    it('in expression with enums', async () => {
        const schema = `
model User {
    id       Int      @id @default(autoincrement())
    role     Role

    @@allow('all', true)
    @@deny('delete', role in [EDITOR])
}

enum Role {
    AUTHOR
    EDITOR
}
    `;

        const client = await createPolicyTestClient(schema, {
            usePrismaPush: true,
            provider: 'postgresql',
        });

        await expect(client.user.create({
            data: {
                id: 1,
                role: 'AUTHOR',
            },
        })).resolves.toMatchObject({
            id: 1,
            role: 'AUTHOR',
        });

        await expect(client.user.deleteMany()).resolves.toMatchObject({
            count: 1,
        });
    });
});
