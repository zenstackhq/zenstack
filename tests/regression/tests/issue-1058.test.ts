import { loadSchema } from '@zenstackhq/testtools';

describe('Regression for issue 1058', () => {
    it('test', async () => {
        const schema = `
        model User {
          id String @id @default(cuid())
          name String
        
          userRankings UserRanking[]
          userFavorites UserFavorite[]
        }
        
        model Entity {
          id String @id @default(cuid())
          name String
          type String
          userRankings UserRanking[]
          userFavorites UserFavorite[]
        
          @@delegate(type)
        }
        
        model Person extends Entity {
        }
        
        model Studio extends Entity {
        }
        
        
        model UserRanking {
          id String @id @default(cuid())
          rank Int
        
          entityId String
          entity Entity @relation(fields: [entityId], references: [id], onUpdate: NoAction)
          userId String
          user User @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)
        }
        
        model UserFavorite {
          id String @id @default(cuid())
        
          entityId String
          entity Entity @relation(fields: [entityId], references: [id], onUpdate: NoAction)
          userId String
          user User @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)
        } 
        `;

        await loadSchema(schema, { pushDb: false, provider: 'postgresql' });
    });
});
