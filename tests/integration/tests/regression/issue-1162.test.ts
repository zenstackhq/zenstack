import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1162', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
              id String @id @default(cuid())
              companies CompanyUser[]
              @@allow('all', true)
            }
            
            model Company {
              id String @id @default(cuid())
              users CompanyUser[]
              @@allow('all', true)
            }
            
            model CompanyUser {
              company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
              companyId String
              user User @relation(fields: [userId], references: [id], onDelete: Cascade)
              userId String
              @@id([companyId, userId])
              @@allow('all', true)
            }
            `,
            { logPrismaQuery: true }
        );

        const db = enhance();

        await db.user.create({ data: { id: 'abc' } });
        await db.user.create({ data: { id: 'def' } });
        await db.company.create({ data: { id: '1', users: { create: { userId: 'abc' } } } });
        await expect(
            db.company.update({
                where: { id: '1' },
                data: {
                    users: {
                        createMany: {
                            data: [{ userId: 'abc' }, { userId: 'def' }],
                            skipDuplicates: true,
                        },
                    },
                },
                include: { users: true },
            })
        ).resolves.toMatchObject({
            users: expect.arrayContaining([
                { companyId: '1', userId: 'abc' },
                { companyId: '1', userId: 'def' },
            ]),
        });
    });
});
