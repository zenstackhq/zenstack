import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('isEmpty function in policies using Postgres', () => {
    it('does not throw an error', async () => {
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
});
