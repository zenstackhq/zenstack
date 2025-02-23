import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1993', () => {
    it('regression', async () => {
        await loadSchema(
            `
enum UserType {
    UserLocal
    UserGoogle
}

model User {
    id          String       @id @default(cuid())
    companyId   String?
    type        UserType

    @@delegate(type)

    userFolders UserFolder[]

    @@allow('all', true)
}

model UserLocal extends User {
    email    String
    password String
}

model UserGoogle extends User {
    googleId String
}

model UserFolder {
    id     String @id @default(cuid())
    userId String
    path   String

    user   User   @relation(fields: [userId], references: [id])

    @@allow('all', true)
}            `,
            { pushDb: false, fullZod: true, compile: true, output: 'lib/zenstack' }
        );
    });
});
