import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1770', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id @default(cuid())
            orgs OrgUser[]
        }

        model OrgUser {
            id String @id @default(cuid())
            user User @relation(fields: [userId], references: [id])
            userId String
            org Organization @relation(fields: [orgId], references: [id])
            orgId String
        }

        model Organization {
            id          String       @id @default(uuid())
            users       OrgUser[]
            resources   Resource[]  @relation("organization")
        }

        abstract model BaseAuth {
            id             String        @id @default(uuid())
            organizationId String?
            organization   Organization? @relation(fields: [organizationId], references: [id], name: "organization")

            @@allow('all', organization.users?[user == auth()])
        }

        model Resource extends BaseAuth {
            name     String?
            type     String?

            @@delegate(type)
        }

        model Personnel extends Resource {
        }
        `
        );

        const db = enhance();
        await expect(db.resource.findMany()).toResolveTruthy();
    });
});
