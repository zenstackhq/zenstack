import { FILE_SPLITTER, loadSchema } from '@zenstackhq/testtools';

describe('issue 1186', () => {
    it('regression', async () => {
        await loadSchema(
            `schema.zmodel
            import "model"

            ${FILE_SPLITTER}model.zmodel
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
            enum UserRole {
                USER
                ADMIN
            }
            
            model User {
                id String @id @default(uuid())
                role UserRole @default(USER) @deny('read,update', auth().role != ADMIN)
                post Post[]
            }
            
            abstract model Base {
                id String @id @default(uuid())
                userId String
                user User @relation(fields: [userId], references: [id])
            
                @@allow('create', userId == auth().id)
                @@allow('update', userId == auth().id && future().userId == auth().id)
            
                @@allow('all', auth().role == ADMIN)
            }
            
            model Post extends Base {
                description String
            }       
            `,
            { addPrelude: false, pushDb: false }
        );
    });
});
