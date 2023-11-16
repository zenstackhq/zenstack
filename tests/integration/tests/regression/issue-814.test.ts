import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 814', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id    Int     @id @default(autoincrement())
                profile Profile?
              
                @@allow('all', true)
            }

            model Profile {
                id    Int     @id @default(autoincrement())
                name String @allow('read', !private)
                private Boolean @default(false)
                user User @relation(fields: [userId], references: [id])
                userId Int @unique

                @@allow('all', true)
            }
            `
        );

        const user = await prisma.user.create({
            data: { profile: { create: { name: 'Foo', private: true } } },
            include: { profile: true },
        });

        const r = await enhance().profile.findFirst({ where: { id: user.profile.id } });
        expect(r.name).toBeUndefined();

        const r1 = await enhance().user.findFirst({
            where: { id: user.id },
            include: { profile: true },
        });
        expect(r1.profile.name).toBeUndefined();
    });
});
