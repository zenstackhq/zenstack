import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/basic';
import { createTestClient } from '@zenstackhq/testtools';

describe('Client createMany tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('works with toplevel createMany', async () => {
        // single
        await expect(
            client.user.createMany({
                data: {
                    email: 'u1@test.com',
                    name: 'name',
                },
            }),
        ).resolves.toMatchObject({
            count: 1,
        });

        // multiple
        await expect(
            client.user.createMany({
                data: [{ email: 'u2@test.com' }, { email: 'u3@test.com' }],
            }),
        ).resolves.toMatchObject({ count: 2 });

        // conflict
        await expect(
            client.user.createMany({
                data: [{ email: 'u3@test.com' }, { email: 'u4@test.com' }],
            }),
        ).rejects.toThrow();
        await expect(client.user.findUnique({ where: { email: 'u4@test.com' } })).toResolveNull();

        // skip duplicates
        await expect(
            client.user.createMany({
                data: [{ email: 'u3@test.com' }, { email: 'u4@test.com' }],
                skipDuplicates: true,
            }),
        ).resolves.toMatchObject({ count: 1 });
        await expect(client.user.findUnique({ where: { email: 'u4@test.com' } })).toResolveTruthy();
    });
});
