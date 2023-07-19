import { loadSchema, FILE_SPLITTER } from '@zenstackhq/testtools';

describe('Multiple file test', () => {
    it('model loading', async () => {
        await loadSchema(
            `schema.zmodel
            import "post"
             ${FILE_SPLITTER}post.zmodel
             import "user"
             model Post {
                id Int @id @default(autoincrement())
                owner User @relation(fields: [ownerId], references: [id])
                ownerId Int

                // require login
                @@deny('all', auth() == null)

                // can be read by owner or space members (only if not private) 
                @@allow('all', owner == auth())
                }
            ${FILE_SPLITTER}user.zmodel
            import "post"
            model User {
                id Int @id @default(autoincrement())
                name String
                email String @unique
                posts Post[]
            }
            `
        );
    });
});
