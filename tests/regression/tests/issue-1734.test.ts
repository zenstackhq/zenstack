import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1734', () => {
    it('regression', async () => {
        const { enhance, enhanceRaw, prisma } = await loadSchema(
            `
                abstract model Base {
                    id        String   @id @default(cuid())
                    createdAt DateTime @default(now())
                    updatedAt DateTime @updatedAt
                }

                model Profile extends Base {
                    displayName String
                    type        String

                    @@allow('read', true)
                    @@delegate(type)
                }

                model User extends Profile {
                    username     String         @unique
                    access       Access[]
                    organization Organization[]
                }

                model Access extends Base {
                    user           User         @relation(fields: [userId], references: [id])
                    userId         String

                    organization   Organization @relation(fields: [organizationId], references: [id])
                    organizationId String

                    manage         Boolean      @default(false)

                    superadmin     Boolean      @default(false)

                    @@unique([userId,organizationId])
                }

                model Organization extends Profile {
                    owner     User     @relation(fields: [ownerId], references: [id])
                    ownerId   String   @default(auth().id)
                    published Boolean  @default(false) @allow('read', access?[user == auth()])
                    access    Access[]
                }

            `
        );
        const db = enhance();
        const rootDb = enhanceRaw(prisma, undefined, {
            kinds: ['delegate'],
        });

        const user = await rootDb.user.create({
            data: {
                username: 'test',
                displayName: 'test',
            },
        });

        const organization = await rootDb.organization.create({
            data: {
                displayName: 'test',
                owner: {
                    connect: {
                        id: user.id,
                    },
                },
                access: {
                    create: {
                        user: {
                            connect: {
                                id: user.id,
                            },
                        },
                        manage: true,
                        superadmin: true,
                    },
                },
            },
        });

        const foundUser = await db.profile.findFirst({
            where: {
                id: user.id,
            },
        });
        expect(foundUser).toMatchObject(user);

        const foundOrg = await db.profile.findFirst({
            where: {
                id: organization.id,
            },
        });
        // published field not readable
        expect(foundOrg).toMatchObject({ id: organization.id, displayName: 'test', type: 'Organization' });
        expect(foundOrg.published).toBeUndefined();

        const foundOrg1 = await enhance({ id: user.id }).profile.findFirst({
            where: {
                id: organization.id,
            },
        });
        // published field not readable
        expect(foundOrg1.published).not.toBeUndefined();
    });
});
