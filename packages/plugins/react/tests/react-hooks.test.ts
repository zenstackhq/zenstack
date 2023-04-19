/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import fs from 'fs';

describe('React Hooks Plugin Tests', () => {
    let origDir: string;
    let projDir: string;

    beforeAll(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
        if (projDir) {
            fs.rmSync(projDir, { recursive: true, force: true });
        }
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

    it('swr generator', async () => {
        const { projectDir } = await loadSchema(
            `
plugin react {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
}

${sharedModel}
        `,
            true,
            false,
            [`${origDir}/dist`, 'react', '@types/react', 'swr'],
            true
        );
        projDir = projectDir;
    });

    it('react-query generator', async () => {
        const { projectDir } = await loadSchema(
            `
plugin react {
    provider = '${process.cwd()}/dist'
    output = '$projectRoot/hooks'
    fetcher = 'react-query'
}

${sharedModel}
        `,
            true,
            false,
            [`${origDir}/dist`, 'react', '@types/react', '@tanstack/react-query'],
            true
        );
        projDir = projectDir;
    });
});
