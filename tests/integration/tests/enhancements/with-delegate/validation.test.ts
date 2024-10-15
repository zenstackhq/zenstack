import { loadSchema } from '@zenstackhq/testtools';
describe('Polymorphic input validation', () => {
    it('rejects aux fields in mutation', async () => {
        const { enhance } = await loadSchema(
            `
        model Asset {
            id Int @id @default(autoincrement())
            type String

            @@delegate(type)
            @@allow('all', true)
        }
        
        model Post extends Asset {
            title String
        }
        `
        );

        const db = enhance();
        const asset = await db.post.create({ data: { title: 'Post1' } });
        await expect(
            db.asset.update({ where: { id: asset.id }, data: { delegate_aux_post: { update: { title: 'Post2' } } } })
        ).rejects.toThrow('Auxiliary relation field "delegate_aux_post" cannot be set directly');
    });
});
