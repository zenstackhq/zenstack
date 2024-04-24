import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 764', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model User {
            id    Int     @id @default(autoincrement())
            name  String
            
            post   Post? @relation(fields: [postId], references: [id])
            postId Int?
            
            @@allow('all', true)
        }
            
        model Post {
            id    Int    @id @default(autoincrement())
            title String
            User  User[]
            
            @@allow('all', true)
        }
        `
        );

        const db = enhance();

        const user = await prisma.user.create({
            data: { name: 'Me' },
        });

        await db.user.update({
            where: { id: user.id },
            data: {
                post: {
                    upsert: {
                        create: {
                            title: 'Hello World',
                        },
                        update: {
                            title: 'Hello World',
                        },
                    },
                },
            },
        });
    });
});
