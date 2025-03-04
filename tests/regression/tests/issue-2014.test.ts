import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2014', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model Tenant {
              id    Int    @id @default(autoincrement())
            
              users User[]
            }
            
            model User {
              id       Int    @id @default(autoincrement())
              tenantId Int    @default(auth().tenantId)
              tenant   Tenant @relation(fields: [tenantId], references: [id])
            
              @@allow('all', true)
            }
            `,
            { logPrismaQuery: true }
        );

        const tenant = await prisma.tenant.create({ data: {} });
        const user = await prisma.user.create({ data: { tenantId: tenant.id } });

        const db = enhance(user);
        const extendedDb = db.$extends({});

        await expect(
            extendedDb.user.create({
                data: {},
            })
        ).resolves.toEqual({
            id: 2,
            tenantId: tenant.id,
        });
    });
});
