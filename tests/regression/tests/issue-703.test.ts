import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 703', () => {
    it('regression', async () => {
        await loadSchema(
            `
        model User {
            id Int @id @default(autoincrement())
            name String?
            admin Boolean @default(false)
        
            companiesWorkedFor Company[]
        
            username String @unique @allow("all", auth() == this) @allow('read', companiesWorkedFor?[owner == auth()]) @allow("all", auth().admin)
        }
        
        model Company {
            id Int @id @default(autoincrement())
            name String?
            owner User @relation(fields: [ownerId], references: [id])
            ownerId Int
        }      
        `
        );
    });
});
