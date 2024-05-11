import { loadSchema } from '@zenstackhq/testtools';

describe('Regression for issue 1135', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Attachment {
              id          String  @id @default(cuid())
              url         String
              myEntityId      String
              myEntity        Entity        @relation(fields: [myEntityId], references: [id], onUpdate: NoAction)

              @@allow('all', true)
            }
              
            model Entity {
              id      String          @id @default(cuid()) 
              name    String
              createdAt DateTime @default(now())
              updatedAt DateTime @updatedAt @default(now())
              
              attachments Attachment[]
            
              type String
              @@delegate(type)
              @@allow('all', true)
            }
            
            model Person extends Entity {
              age Int?
            }
            `,
            {
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { enhance } from '.zenstack/enhance';
import { PrismaClient } from '@prisma/client';

const db = enhance(new PrismaClient());

db.person.create({
    data: {
        name: 'test',
        attachments: {
            create: {
                url: 'https://...',
            },
        },
    },
});
                `,
                    },
                ],
            }
        );

        const db = enhance();
        await expect(
            db.person.create({
                data: {
                    name: 'test',
                    attachments: {
                        create: {
                            url: 'https://...',
                        },
                    },
                },
                include: { attachments: true },
            })
        ).resolves.toMatchObject({
            id: expect.any(String),
            name: 'test',
            attachments: [
                {
                    id: expect.any(String),
                    url: 'https://...',
                    myEntityId: expect.any(String),
                },
            ],
        });
    });
});
