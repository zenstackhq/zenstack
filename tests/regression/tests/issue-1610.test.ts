import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1610', () => {
    it('regular prisma client', async () => {
        await loadSchema(
            `
            model User {
                id Int @id
                posts Post[]
            }
            
            model Post {
                id Int @id
                author User @relation(fields: [authorId], references: [id])
                authorId Int
            }
            `,
            { fullZod: true, output: './lib/zen' }
        );
    });

    it('logical prisma client', async () => {
        await loadSchema(
            `
            model User {
                id Int @id
                posts Post[]
            }
            
            model Post {
                id Int @id
                author User @relation(fields: [authorId], references: [id])
                authorId Int @default(auth().id)
            }
            `,
            { fullZod: true, output: './lib/zen' }
        );
    });

    it('no custom output', async () => {
        await loadSchema(
            `
            model User {
                id Int @id
                posts Post[]
            }
            
            model Post {
                id Int @id
                author User @relation(fields: [authorId], references: [id])
                authorId Int @default(auth().id)
            }
            `,
            { fullZod: true, preserveTsFiles: true }
        );
    });
});
