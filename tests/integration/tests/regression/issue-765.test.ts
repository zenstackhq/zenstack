import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 765', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id    Int     @id @default(autoincrement())
                name  String
              
                post   Post? @relation(fields: [postId], references: [id])
                postId Int?
              
                @@allow('all', true)
              }
              
            model Post {
                id    Int    @id @default(autoincrement())
                title String
                User  User[]
              
                @@allow('all', true)
            }
            `
        );

        const db = enhance();
        const r = await db.user.create({
            data: {
                name: 'Me',
                post: undefined,
            },
        });
        expect(r.name).toBe('Me');
        expect(r.post).toBeUndefined();
    });
});
