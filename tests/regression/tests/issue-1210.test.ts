import { FILE_SPLITTER, loadSchema } from '@zenstackhq/testtools';

describe('issue 1210', () => {
    it('regression', async () => {
        await loadSchema(
            `schema.zmodel
            import "./user"
            import "./tokens"
            
            generator client {
              provider        = "prisma-client-js"
              binaryTargets   = ["native"]
              previewFeatures = ["postgresqlExtensions"]
            }
            
            datasource db {
              provider   = "postgresql"
              extensions = [citext]
            
              url       = env("DATABASE_URL")
            }
            
            plugin zod {
              provider = '@core/zod'
            }
            
            ${FILE_SPLITTER}base.zmodel
            abstract model Base {
              id String @id @default(uuid())
              createdAt DateTime @default(now())
              updatedAt DateTime @updatedAt
              deletedAt DateTime? @omit
            
              @@deny('read', deletedAt != null)
              @@deny('delete', true)
            }
                    
            ${FILE_SPLITTER}tokens.zmodel
            import "base"
            import "user"

            model Session extends Base {
              expiresAt DateTime
              userId String
              user User @relation(references: [id], fields: [userId], onDelete: Cascade)
            }

            ${FILE_SPLITTER}user.zmodel
            import "base"
            import "tokens"
            enum UserRole {
              USER
              ADMIN
            }
            
            model User extends Base {
              email String @unique @db.Citext @email @trim @lower
              role UserRole @default(USER) @deny('read,update', auth().role != ADMIN)
            
              sessions Session[]
              posts Post[]
            
              @@allow('read,create', auth() == this)
              @@allow('all', auth().role == ADMIN)
            }
            
            abstract model UserEntity extends Base {
              userId String
              user User @relation(fields: [userId], references: [id])
            
              @@allow('create', userId == auth().id)
              @@allow('update', userId == auth().id && future().userId == auth().id)
            
              @@allow('all', auth().role == ADMIN)
            }
            
            abstract model PrivateUserEntity extends UserEntity {
              @@allow('read', userId == auth().id)
            }
            
            abstract model PublicUserEntity extends UserEntity {
              @@allow('read', true)
            }
            
            model Post extends PublicUserEntity {
              title String
            }            
            `,
            { addPrelude: false, pushDb: false }
        );
    });
});
