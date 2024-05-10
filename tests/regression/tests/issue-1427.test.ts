import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1427', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
              id   String @id @default(cuid())
              name String
              profile Profile?
              @@allow('all', true)
            }
            
            model Profile {
              id   String @id @default(cuid())
              user User   @relation(fields: [userId], references: [id])
              userId String @unique
              @@allow('all', true)
            }
            `
        );

        await prisma.user.create({
            data: {
                name: 'John',
                profile: {
                    create: {},
                },
            },
        });

        const db = enhance();
        const found = await db.user.findFirst({
            select: {
                id: true,
                name: true,
                profile: false,
            },
        });
        expect(found.profile).toBeUndefined();
    });
});
