import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2001', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model User {
              id       Int       @id @default(autoincrement())
            
              contentUserLikes ContentUserLikes[]
            
              @@allow('all', true)
            }
            
            model Content {
              id          Int      @id @default(autoincrement())
              contentType String
            
              contentUserLikes ContentUserLikes[]
            
              @@delegate(contentType)
            
              @@allow('all', true)
            }
            
            model Post extends Content {
              title String
            }
            
            model Video extends Content {
              name     String
              duration Int
            }
            
            model ContentUserLikes {
                id          Int      @id @default(autoincrement())
                userId Int
                user   User @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
            
                contentId Int
                content Content @relation(fields: [contentId], references: [id], onDelete: Cascade, onUpdate: Restrict)
            
                @@unique([userId, contentId])
            }
            `,
            { provider: 'postgresql', dbUrl: 'env("DATABASE_URL")', pushDb: false }
        );
    });
});
