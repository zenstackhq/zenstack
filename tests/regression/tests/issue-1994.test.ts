import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1994', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
model OrganizationRole {
  id              Int @id @default(autoincrement())
  rolePrivileges  OrganizationRolePrivilege[]
  type            String
  @@delegate(type)
}

model Organization {
  id              Int @id @default(autoincrement())
  customRoles     CustomOrganizationRole[]
}

// roles common to all orgs, defined once
model SystemDefinedRole extends OrganizationRole {
  name String @unique
}

// roles specific to each org
model CustomOrganizationRole extends OrganizationRole {
  name String
  organizationId Int
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, name])
  @@index([organizationId])
}

model OrganizationRolePrivilege {
  organizationRoleId Int
  privilegeId        Int

  organizationRole   OrganizationRole @relation(fields: [organizationRoleId], references: [id])
  privilege          Privilege        @relation(fields: [privilegeId], references: [id])

  @@id([organizationRoleId, privilegeId])
}

model Privilege {
  id                  Int @id @default(autoincrement())
  name                String // e.g. "org:manage"

  orgRolePrivileges   OrganizationRolePrivilege[]
  @@unique([name])
}
            `,
            {
                enhancements: ['delegate'],
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
                        import { PrismaClient } from '@prisma/client';
                        import { enhance } from '.zenstack/enhance';

                        const prisma = new PrismaClient();
                        
                        async function main() {
                            const db = enhance(prisma);
                            const privilege = await db.privilege.create({
                                data: { name: 'org:manage' },
                            });

                            await db.systemDefinedRole.create({
                                data: {
                                    name: 'Admin',
                                    rolePrivileges: {
                                        create: [
                                            {
                                                privilegeId: privilege.id,
                                            },
                                        ],
                                    },
                                },
                            });
                        }
                        main()
                    `,
                    },
                ],
            }
        );

        const db = enhance();

        const privilege = await db.privilege.create({
            data: { name: 'org:manage' },
        });

        await expect(
            db.systemDefinedRole.create({
                data: {
                    name: 'Admin',
                    rolePrivileges: {
                        create: [
                            {
                                privilegeId: privilege.id,
                            },
                        ],
                    },
                },
            })
        ).toResolveTruthy();
    });
});
