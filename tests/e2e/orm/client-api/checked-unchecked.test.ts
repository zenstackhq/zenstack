import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientContract } from '@zenstackhq/orm';
import { schema } from '../schemas/basic';
import { createTestClient } from '@zenstackhq/testtools';
import { createUser } from './utils';

describe('Checked vs unchecked create/update', () => {
    let client: ClientContract<typeof schema>;

    beforeEach(async () => {
        client = await createTestClient(schema);
    });

    afterEach(async () => {
        await client?.$disconnect();
    });

    describe('runtime enforcement', () => {
        it('rejects mixed FK + relation object in create', async () => {
            const user = await createUser(client);

            await expect(
                (client as any).post.create({
                    data: {
                        title: 'Post',
                        // mixing unchecked (authorId) and checked (author: { connect })
                        authorId: user.id,
                        author: { connect: { id: user.id } },
                    },
                }),
            ).toBeRejectedByValidation();
        });

        it('rejects mixed FK + relation object in update', async () => {
            const user = await createUser(client);
            const post = await client.post.create({
                data: { title: 'Post', authorId: user.id },
            });
            const user2 = await createUser(client, 'u2@test.com');

            await expect(
                (client as any).post.update({
                    where: { id: post.id },
                    data: {
                        // mixing unchecked (authorId) and checked (author: { connect })
                        authorId: user2.id,
                        author: { connect: { id: user2.id } },
                    },
                }),
            ).toBeRejectedByValidation();
        });

        it('accepts unchecked create with FK only', async () => {
            const user = await createUser(client);
            const post = await client.post.create({
                data: { title: 'Post', authorId: user.id },
            });
            expect(post.authorId).toBe(user.id);
        });

        it('accepts checked create with relation object only', async () => {
            const user = await createUser(client);
            const post = await client.post.create({
                data: { title: 'Post', author: { connect: { id: user.id } } },
            });
            expect(post.authorId).toBe(user.id);
        });

        it('accepts unchecked update with FK only', async () => {
            const user = await createUser(client);
            const post = await client.post.create({
                data: { title: 'Post', authorId: user.id },
            });
            const user2 = await createUser(client, 'u2@test.com');
            const updated = await client.post.update({
                where: { id: post.id },
                data: { authorId: user2.id },
            });
            expect(updated.authorId).toBe(user2.id);
        });

        it('accepts checked update with relation object only', async () => {
            const user = await createUser(client);
            const post = await client.post.create({
                data: { title: 'Post', authorId: user.id },
            });
            const user2 = await createUser(client, 'u2@test.com');
            const updated = await client.post.update({
                where: { id: post.id },
                data: { author: { connect: { id: user2.id } } },
            });
            expect(updated.authorId).toBe(user2.id);
        });
    });
});
