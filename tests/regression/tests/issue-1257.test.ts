import { FILE_SPLITTER, loadSchema } from '@zenstackhq/testtools';

describe('issue 1210', () => {
    it('regression', async () => {
        await loadSchema(
            `schema.zmodel
            import "./user"
            import "./image"
            
            generator client {
              provider        = "prisma-client-js"
            }
            
            datasource db {
              provider   = "postgresql"
              url       = env("DATABASE_URL")
            }

            ${FILE_SPLITTER}base.zmodel
            abstract model Base {
              id Int @id @default(autoincrement())
            }
            
            ${FILE_SPLITTER}user.zmodel
            import "./base"
            import "./image"
            
            enum Role {
              Admin
            }

            model User extends Base {
              email String @unique
              role Role
              @@auth
            }       

            ${FILE_SPLITTER}image.zmodel
            import "./user"
            import "./base"

            model Image extends Base {
                width Int @default(0)
                height Int @default(0)
            
                @@allow('read', true)
                @@allow('all', auth().role == Admin)
            }
            `,
            { addPrelude: false, pushDb: false }
        );
    });
});
