/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';

describe('tRPC Plugin Tests', () => {
    let origDir: string;

    beforeAll(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('run plugin', async () => {
        await loadSchema(
            `
plugin trpc {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/trpc'
}

model User {
    id String @id
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    email String @unique
    role String @default('USER')
    posts Post[]
}

model Post {
    id String @id
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
}

model Foo {
    id String @id
    @@ignore
}
        `,
            true,
            false,
            [`${origDir}/dist`, '@trpc/client', '@trpc/server'],
            true
        );
    });
});
