import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1452', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id    String     @id
                memberships Membership[]
            }

            model Space {
                id           String          @id
                memberships  Membership[]
            }

            model Membership {
                userId            String
                user              User       @relation(fields: [userId], references: [id], onDelete: Cascade)
                spaceId           String
                space             Space      @relation(fields: [spaceId], references: [id], onDelete: Cascade)
              
                role              String     @deny("update", auth() == user)
                employeeReference String?    @deny("read, update", space.memberships?[auth() == user && !(role in ['owner', 'admin'])])
              
                createdAt         DateTime   @default(now())
                updatedAt         DateTime   @updatedAt
              
                @@id([userId, spaceId])
                @@allow('all', true)
            }            
            `
        );

        await prisma.user.create({
            data: { id: '1' },
        });

        await prisma.space.create({
            data: { id: '1' },
        });

        await prisma.membership.create({
            data: {
                user: { connect: { id: '1' } },
                space: { connect: { id: '1' } },
                role: 'foo',
                employeeReference: 'xyz',
            },
        });

        const db = enhance({ id: '1' });
        const r = await db.membership.findMany();
        expect(r).toHaveLength(1);
        expect(r[0].employeeReference).toBeUndefined();
    });
});
