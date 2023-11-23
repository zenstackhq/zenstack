import { loadModelWithError } from '@zenstackhq/testtools';

describe('Regression: issue 804', () => {
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
            published Boolean

            @@allow('all', auth().posts?[published] == 'TRUE')
        }
        `
            )
        ).toContain('incompatible operand types');
    });
});
