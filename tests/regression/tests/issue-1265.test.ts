import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1265', () => {
    it('regression', async () => {
        const { zodSchemas } = await loadSchema(
            `
            model User {
                id String @id @default(uuid())
                posts Post[]              
                @@allow('all', true)
            }
            
            model Post {
                id String @id @default(uuid())
                title String @default('xyz')
                userId String @default(auth().id)
                user User @relation(fields: [userId], references: [id])
                @@allow('all', true)
            }
            `,
            { fullZod: true, pushDb: false }
        );

        expect(zodSchemas.models.PostCreateSchema.safeParse({ title: 'Post 1' }).success).toBeTruthy();
        expect(zodSchemas.input.PostInputSchema.create.safeParse({ data: { title: 'Post 1' } }).success).toBeTruthy();
    });
});
