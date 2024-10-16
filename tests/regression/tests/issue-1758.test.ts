import { loadModelWithError } from '@zenstackhq/testtools';

describe('issue 1758', () => {
    it('regression', async () => {
        await expect(
            loadModelWithError(
                `
            model Organization {
                id       String @id @default(cuid())
                contents Content[] @relation("OrganizationContents")
            }

            model Content {
                id             String @id @default(cuid())
                contentType    String
                organization   Organization @relation("OrganizationContents", fields: [organizationId], references: [id])
                organizationId String
                @@delegate(contentType)
            }

            model Store extends Content {
                name      String
                @@unique([organizationId, name])
            }
            `
            )
        ).resolves.toContain('Cannot use fields inherited from a polymorphic base model in `@@unique`');
    });
});
