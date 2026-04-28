import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2538
describe('Regression for issue #2538', () => {
    it('nested collection predicates in access policies generate valid SQL', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id          String           @id @default(cuid())
    access      String           @default("USER")
    permissions UserPermission[]
    @@allow('all', true)
}

model Project {
    id              String           @id @default(cuid())
    userPermissions UserPermission[]
    repositories    Repositories[]
    @@allow('all', true)
}

model Role {
    id              String           @id @default(cuid())
    rolePermissions RolePermission[]
    userPermissions UserPermission[]
    @@allow('all', true)
}

model RolePermission {
    id         String  @id @default(cuid())
    roleId     String
    role       Role    @relation(fields: [roleId], references: [id])
    area       String
    canAddEdit Boolean @default(false)
    @@allow('all', true)
}

model UserPermission {
    id         String  @id @default(cuid())
    userId     String
    user       User    @relation(fields: [userId], references: [id])
    projectId  String
    project    Project @relation(fields: [projectId], references: [id])
    roleId     String
    role       Role    @relation(fields: [roleId], references: [id])
    accessType String
    @@allow('all', true)
}

model Repositories {
    id        String  @id @default(cuid())
    projectId String
    project   Project @relation(fields: [projectId], references: [id])

    @@allow('read', true)
    @@allow('create',
        project.userPermissions?[user == auth() && accessType == 'SPECIFIC_ROLE' &&
            role.rolePermissions?[area == 'TestCaseRepository' && canAddEdit]]
    )
    @@allow('all', auth().access == 'ADMIN')
}
            `,
        );

        const project = await db.project.create({ data: { id: 'project-1' } });

        const roleWithPerm = await db.role.create({ data: { id: 'role-1' } });
        await db.rolePermission.create({
            data: { roleId: roleWithPerm.id, area: 'TestCaseRepository', canAddEdit: true },
        });

        const roleNoPerm = await db.role.create({ data: { id: 'role-2' } });
        await db.rolePermission.create({
            data: { roleId: roleNoPerm.id, area: 'TestCaseRepository', canAddEdit: false },
        });

        const adminUser = await db.user.create({ data: { id: 'admin', access: 'ADMIN' } });
        const authorizedUser = await db.user.create({ data: { id: 'user-ok', access: 'USER' } });
        const unauthorizedUser = await db.user.create({ data: { id: 'user-no', access: 'USER' } });

        await db.userPermission.create({
            data: {
                userId: authorizedUser.id,
                projectId: project.id,
                roleId: roleWithPerm.id,
                accessType: 'SPECIFIC_ROLE',
            },
        });
        await db.userPermission.create({
            data: {
                userId: unauthorizedUser.id,
                projectId: project.id,
                roleId: roleNoPerm.id,
                accessType: 'SPECIFIC_ROLE',
            },
        });

        // admin read: verifies SQL is valid even though nested predicate is compiled alongside @@allow('all',...)
        await expect(db.$setAuth(adminUser).repositories.findMany()).resolves.toHaveLength(0);

        // admin can create
        await expect(db.$setAuth(adminUser).repositories.create({ data: { projectId: project.id } })).toResolveTruthy();

        // authorizedUser: SPECIFIC_ROLE + role has canAddEdit=true for the right area
        await expect(
            db.$setAuth(authorizedUser).repositories.create({ data: { projectId: project.id } }),
        ).toResolveTruthy();

        // unauthorizedUser: SPECIFIC_ROLE but role has canAddEdit=false
        await expect(
            db.$setAuth(unauthorizedUser).repositories.create({ data: { projectId: project.id } }),
        ).toBeRejectedByPolicy();
    });
});
