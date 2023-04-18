/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import fs from 'fs';

describe('tRPC Plugin Tests', () => {
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

    it('run plugin', async () => {
        const { projectDir } = await loadSchema(
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
        projDir = projectDir;
    });
});
