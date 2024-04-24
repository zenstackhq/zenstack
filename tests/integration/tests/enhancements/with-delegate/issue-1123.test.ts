import { loadSchema } from '@zenstackhq/testtools';

describe('Regression for issue 1123', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Content {
                id String @id @default(cuid())
                published Boolean @default(false)
                contentType String
                likes Like[]
                @@delegate(contentType)
                @@allow('all', true)
            }
              
            model Post extends Content {
              title String
            }
            
            model Image extends Content {
              url String
            }
            
            model Like {
              id String @id @default(cuid())
              content Content @relation(fields: [contentId], references: [id])
              contentId String
              @@allow('all', true)
            }
            `
        );

        const db = enhance();
        await db.post.create({
            data: {
                title: 'a post',
                likes: { create: {} },
            },
        });

        await expect(db.content.findFirst({ include: { _count: { select: { likes: true } } } })).resolves.toMatchObject(
            {
                _count: { likes: 1 },
            }
        );
    });
});
