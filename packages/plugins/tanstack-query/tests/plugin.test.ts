/// <reference types="@types/jest" />

import { loadSchema, normalizePath } from '@zenstackhq/testtools';
import path from 'path';

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
    role role @default(USER)
    posts post_Item[]
}

enum role {
    USER
    ADMIN
}

model post_Item {
    id String @id
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    author User? @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
}

model Foo {
    id String @id
    @@ignore
}
    `;

    it('react-query run plugin v4', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'react'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['react@18.2.0', '@types/react@18.2.0', '@tanstack/react-query@4.29.7'],
                copyDependencies: [`${path.join(__dirname, '..')}/dist`],
                compile: true,
            }
        );
    });

    it('react-query run plugin v5', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'react'
    version = 'v5'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['react@18.2.0', '@types/react@18.2.0', '@tanstack/react-query@^5.0.0'],
                copyDependencies: [`${path.join(__dirname, '..')}/dist`],
                compile: true,
            }
        );
    });

    it('vue-query run plugin v4', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'vue'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['vue@^3.3.4', '@tanstack/vue-query@4.37.0'],
                copyDependencies: [`${path.join(__dirname, '..')}/dist`],
                compile: true,
            }
        );
    });

    it('vue-query run plugin v5', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'vue'
    version = 'v5'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['vue@^3.3.4', '@tanstack/vue-query@latest'],
                copyDependencies: [`${path.join(__dirname, '..')}/dist`],
                compile: true,
            }
        );
    });

    it('svelte-query run plugin v4', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'svelte'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['svelte@^3.0.0', '@tanstack/svelte-query@4.29.7'],
                copyDependencies: [`${path.join(__dirname, '..')}/dist`],
                compile: true,
            }
        );
    });

    it('svelte-query run plugin v5', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'svelte'
    version = 'v5'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['svelte@^3.0.0', '@tanstack/svelte-query@^5.0.0'],
                copyDependencies: [`${path.join(__dirname, '..')}/dist`],
                compile: true,
            }
        );
    });
});
