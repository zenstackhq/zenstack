import { loadModelWithError, loadSchema } from '@zenstackhq/testtools';

describe('Regression for issue 1100', () => {
    it('missing opposite relation', async () => {
        const schema = `
        model User {
          id String @id @default(cuid())
          name String?
          content Content[]
          post Post[]
        }
        
        model Content {
          id String @id @default(cuid())
          published Boolean @default(false)
          contentType String
          @@delegate(contentType)
        
          user User @relation(fields: [userId], references: [id])
          userId String
        }
        
        model Post extends Content {
          title String
        }
        
        model Image extends Content {
          url String
        }
        `;

        await expect(loadModelWithError(schema)).resolves.toContain(
            'The relation field "post" on model "User" is missing an opposite relation field on model "Post"'
        );
    });

    it('success', async () => {
        const schema = `
      model User {
        id String @id @default(cuid())
        name String?
        content Content[]
        post Post[]
      }
      
      model Content {
        id String @id @default(cuid())
        published Boolean @default(false)
        contentType String
        @@delegate(contentType)
      
        user User @relation(fields: [userId], references: [id])
        userId String
      }
      
      model Post extends Content {
        title String
        author User @relation(fields: [authorId], references: [id])
        authorId String
      }
      
      model Image extends Content {
        url String
      }
      `;

        await expect(loadSchema(schema)).toResolveTruthy();
    });
});
