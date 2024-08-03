import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1551', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model User {
                id Int @id
                profile Profile? @relation(fields: [profileId], references: [id])
                profileId Int? @unique @map('profile_id')
            }
            
            model Profile {
                id Int @id
                contentType String
                user User?

                @@delegate(contentType)
            }

            model IndividualProfile extends Profile {
                name String    
            }
            `
        );
    });
});
