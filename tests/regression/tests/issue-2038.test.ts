import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2038', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                flag Boolean
                @@allow('all', true)
            }
            
            model Post {
                id Int @id @default(autoincrement())
                published Boolean @default(auth().flag)
                @@allow('all', true)
            }
            `
        );

        const db = enhance({ id: 1, flag: true });
        await expect(db.post.create({ data: {} })).resolves.toMatchObject({
            published: true,
        });
    });
});
