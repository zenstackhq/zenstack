import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1378', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model User {
              id   String @id @default(cuid())
              todos Todo[]
            }
            
            model Todo {
              id String @id @default(cuid())
              name String @length(3,255)
              userId String @default(auth().id)
          
              user User @relation(fields: [userId], references: [id], onDelete: Cascade)
              @@allow("all", auth() == user)
          }
          `,
            {
                extraDependencies: ['zod'],
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
                  import { z } from 'zod';
                  import { PrismaClient } from '@prisma/client';
                  import { enhance } from '.zenstack/enhance';
                  import { TodoCreateSchema } from '.zenstack/zod/models';
                                    
                  const prisma = new PrismaClient();
                  const db = enhance(prisma);

                  export const onSubmit = async (values: z.infer<typeof TodoCreateSchema>) => {
                    await db.todo.create({
                      data: values,
                    });
                  };
                  `,
                    },
                ],
                compile: true,
            }
        );
    });
});
