import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1786', () => {
    it('regression', async () => {
        await loadSchema(
            `
    model User {
        id       String @id @default(cuid())
        email    String @unique @email @length(6, 32)
        password String @password @omit
        contents    Content[]

        // everybody can signup
        @@allow('create', true)

        // full access by self
        @@allow('all', auth() == this)
    }

    abstract model BaseContent {
      published Boolean @default(false)

      @@index([published])
    }

    model Content extends BaseContent {
        id       String @id @default(cuid())
        createdAt DateTime @default(now())
        updatedAt DateTime @updatedAt
        owner User @relation(fields: [ownerId], references: [id])
        ownerId String
        contentType String

        @@delegate(contentType)
    }

    model Post extends Content {
        title String
    }

    model Video extends Content {
        name String
        duration Int
    }           
        `
        );
    });
});
