import { loadModel, loadModelWithError } from '@zenstackhq/testtools';

describe('Regression: issue 756', () => {
    it('regression', async () => {
        expect(
            await loadModelWithError(
                `
        generator client {
            provider = "prisma-client-js"
        }
            
        datasource db {
            provider = "postgresql"
            url      = env("DATABASE_URL")
        }
                    
        model User {
            id Int @id @default(autoincrement())
            email Int
            posts Post[]
          }
          
          model Post {
            id Int @id @default(autoincrement())
            author User? @relation(fields: [authorId], references: [id])
            authorId Int
            @@allow('all', auth().posts.authorId == authorId)
          }
        `
            )
        ).toContain('expression cannot be resolved');
    });
});
