import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/enum/schema';
import { createTestClient } from '@zenstackhq/testtools';

describe('Enum tests', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    it('works when implicitly converted to arrays', async () => {
        await expect(
            client.post.create({
                data: {
                    id: '1',
                    status: 'ACTIVE',
                },
            }),
        ).resolves.toMatchObject({
            id: '1',
            status: 'ACTIVE',
        });

        await expect(
            client.post.create({
                data: {
                    id: '2',
                    status: 'DRAFT',
                },
            }),
        ).resolves.toMatchObject({
            id: '2',
            status: 'DRAFT',
        });

        await expect(
            client.post.create({
                data: {
                    id: '3',
                    status: 'CANCELLED',
                },
            }),
        ).resolves.toMatchObject({
            id: '3',
            status: 'CANCELLED',
        });

        await expect(
            client.post.create({
                data: {
                    id: '3',
                    status: 'UNKNOWN',
                },
            }),
        ).rejects.toThrow(/Validation error/);
    });
});
