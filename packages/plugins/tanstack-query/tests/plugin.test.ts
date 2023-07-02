/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';

describe('Tanstack Query Plugin Tests', () => {
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

    it('react-query generator regular json', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
    target = 'react'
}

${sharedModel}
        `,
            true,
            false,
            [`${origDir}/dist`, 'react', '@types/react', '@tanstack/react-query'],
            true
        );
    });

    it('react-query generator superjson', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
    target = 'react'
    useSuperJson = true
}

${sharedModel}
        `,
            true,
            false,
            [`${origDir}/dist`, 'react', '@types/react', '@tanstack/react-query', 'superjson'],
            true
        );
    });

    it('svelte-query generator regular json', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
    target = 'svelte'
}

${sharedModel}
        `,
            true,
            false,
            [`${origDir}/dist`, 'svelte@4.0.0', '@types/react', '@tanstack/svelte-query'],
            true
        );
    });

    it('svelte-query generator superjson', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
    target = 'svelte'
    useSuperJson = true
}

${sharedModel}
        `,
            true,
            false,
            [`${origDir}/dist`, 'svelte@^4.0.0', '@types/react', '@tanstack/svelte-query', 'superjson'],
            true
        );
    });
});
