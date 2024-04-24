import { loadModel } from '@zenstackhq/testtools';

describe('issue 1179', () => {
    it('regression', async () => {
        await loadModel(
            `
            abstract model Base {
              id String @id @default(uuid())
            }
            
            model User extends Base {
              email String
              posts Post[]
              @@allow('all', auth() == this)
            }
            
            model Post {
              id String @id @default(uuid())
            
              user User @relation(fields: [userId], references: [id])
              userId String
              @@allow('all', auth().id == userId)
            }
            `
        );
    });
});
