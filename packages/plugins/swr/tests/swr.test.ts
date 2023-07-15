/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';

describe('SWR Plugin Tests', () => {
    let origDir: string;

    beforeAll(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    const sharedModel = `
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
    `;

    it('swr generator regular json', async () => {
        await loadSchema(
            `
plugin swr {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
}

${sharedModel}
        `,
            true,
            false,
            [`${origDir}/dist`, 'react', '@types/react', 'swr', 'superjson'],
            true
        );
    });

    it('swr generator superjson', async () => {
        await loadSchema(
            `
plugin swr {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
    useSuperJson = true
}

${sharedModel}
        `,
            true,
            false,
            [`${origDir}/dist`, 'react', '@types/react', 'swr', 'superjson'],
            true
        );
    });
});
