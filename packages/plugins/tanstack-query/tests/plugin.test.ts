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

    it('react-query run plugin', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
    target = 'react'
}

${sharedModel}
        `,
            {
                pushDb: false,
                extraDependencies: [
                    `${origDir}/dist`,
                    'react@18.2.0',
                    '@types/react@18.2.0',
                    '@tanstack/react-query@4.29.7',
                ],
                compile: true,
            }
        );
    });

    it('svelte-query run plugin', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
    target = 'svelte'
}

${sharedModel}
        `,
            {
                pushDb: false,
                extraDependencies: [`${origDir}/dist`, 'svelte@^3.0.0', '@tanstack/svelte-query@4.29.7'],
                compile: true,
            }
        );
    });
});
