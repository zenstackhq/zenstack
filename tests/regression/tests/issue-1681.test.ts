import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1681', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                posts Post[]
                @@allow('all', true)
            }
            
            model Post {
                id Int @id @default(autoincrement())
                title String
                author User @relation(fields: [authorId], references: [id])
                authorId Int @default(auth().id)
                @@allow('all', true)
            }
            `
        );

        const db = enhance({ id: 1 });
        const user = await db.user.create({ data: {} });
        await expect(db.post.createMany({ data: [{ title: 'Post1' }] })).resolves.toMatchObject({ count: 1 });

        const r = await db.post.createManyAndReturn({ data: [{ title: 'Post2' }] });
        expect(r[0].authorId).toBe(user.id);
    });
});
