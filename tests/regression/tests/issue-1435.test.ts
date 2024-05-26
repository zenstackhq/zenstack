import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';

describe('issue 1435', () => {
    it('regression', async () => {
        let prisma: any;
        let dbUrl: string;

        try {
            dbUrl = await createPostgresDb('issue-1435');
            const r = await loadSchema(
                `
            /* Interfaces */
            abstract model IBase {
              updatedAt DateTime @updatedAt
              createdAt DateTime @default(now())
            }
            
            abstract model IAuth extends IBase {
              user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
              userId String @unique
            
              @@allow('create', true)
              @@allow('all', auth() == user)
            }
            
            abstract model IIntegration extends IBase {
              organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
              organizationId String       @unique
            
              @@allow('all', organization.members?[user == auth() && type == OWNER])
              @@allow('read', organization.members?[user == auth()])
            }
            
            /* Auth Stuff */
            model User extends IBase {
              id          String      @id @default(cuid())
              firstName   String
              lastName    String
              google      GoogleAuth?
              memberships Member[]
            
              @@allow('create', true)
              @@allow('all', auth() == this)
            }
            
            model GoogleAuth extends IAuth {
              reference    String @id
              refreshToken String
            }
            
            /* Org Stuff */
            enum MemberType {
              OWNER
              MEMBER
            }
            
            model Organization extends IBase {
              id      String             @id @default(cuid())
              name    String
              members Member[]
              google  GoogleIntegration?
            
              @@allow('create', true)
              @@allow('all', members?[user == auth() && type == OWNER])
              @@allow('read', members?[user == auth()])
            }
            
            
            model Member extends IBase {
              type           MemberType   @default(MEMBER)
              organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
              organizationId String
              user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
              userId         String
            
              @@id([organizationId, userId])
              @@allow('all', organization.members?[user == auth() && type == OWNER])
              @@allow('read', user == auth())
            }
            
            /* Google Stuff */
            model GoogleIntegration extends IIntegration {
              reference String @id
            }
            `,
                { provider: 'postgresql', dbUrl }
            );

            prisma = r.prisma;
            const enhance = r.enhance;

            await prisma.organization.create({
                data: {
                    name: 'My Organization',
                    members: {
                        create: {
                            type: 'OWNER',
                            user: {
                                create: {
                                    id: '1',
                                    firstName: 'John',
                                    lastName: 'Doe',
                                },
                            },
                        },
                    },
                },
            });

            const db = enhance({ id: '1' });
            await expect(db.organization.findMany()).resolves.toHaveLength(1);
        } finally {
            if (prisma) {
                await prisma.$disconnect();
            }
            await dropPostgresDb('issue-1435');
        }
    });
});
