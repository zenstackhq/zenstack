/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';

describe('tRPC Plugin Tests', () => {
    let origDir: string;

    beforeAll(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('run plugin absolute output', async () => {
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

    it('run plugin relative output', async () => {
        const { projectDir } = await loadSchema(
            `
plugin trpc {
    provider = '${process.cwd()}/dist'
    output = './trpc'
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
        expect(fs.existsSync(path.join(projectDir, 'trpc'))).toBe(true);
    });

    it('run plugin non-standard zmodel location', async () => {
        const { projectDir } = await loadSchema(
            `
plugin trpc {
    provider = '${process.cwd()}/dist'
    output = './trpc'
}

model User {
    id String @id
    posts Post[]
}

model Post {
    id String @id
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
}
        `,
            true,
            false,
            [`${origDir}/dist`, '@trpc/client', '@trpc/server'],
            true,
            'zenstack/schema.zmodel'
        );
        expect(fs.existsSync(path.join(projectDir, 'zenstack/trpc'))).toBe(true);
    });

    it('generateModelActions option string', async () => {
        const { projectDir } = await loadSchema(
            `
plugin trpc {
    provider = '${process.cwd()}/dist'
    output = './trpc'
    generateModelActions = 'findMany,findUnique,update'
}

model Post {
    id String @id
    title String
}
        `,
            true,
            false,
            [`${origDir}/dist`, '@trpc/client', '@trpc/server'],
            true,
            'zenstack/schema.zmodel'
        );
        const content = fs.readFileSync(path.join(projectDir, 'zenstack/trpc/routers/Post.router.ts'), 'utf-8');
        expect(content).toContain('findMany:');
        expect(content).toContain('findUnique:');
        expect(content).toContain('update:');
        expect(content).not.toContain('create:');
        expect(content).not.toContain('aggregate:');
    });

    it('generateModelActions option array', async () => {
        const { projectDir } = await loadSchema(
            `
plugin trpc {
    provider = '${process.cwd()}/dist'
    output = './trpc'
    generateModelActions = ['findMany', 'findUnique', 'update']
}

model Post {
    id String @id
    title String
}
        `,
            true,
            false,
            [`${origDir}/dist`, '@trpc/client', '@trpc/server'],
            true,
            'zenstack/schema.zmodel'
        );
        const content = fs.readFileSync(path.join(projectDir, 'zenstack/trpc/routers/Post.router.ts'), 'utf-8');
        expect(content).toContain('findMany:');
        expect(content).toContain('findUnique:');
        expect(content).toContain('update:');
        expect(content).not.toContain('create:');
        expect(content).not.toContain('aggregate:');
    });

    const BLOG_BASE_SCHEMA = `
        model User {
            id String @id
            createdAt DateTime @default(now())
            updatedAt DateTime @updatedAt
            email String @unique
            posts Post[]
        }
        
        model Post {
            id String @id
            createdAt DateTime @default(now())
            updatedAt DateTime @updatedAt
            title String
            author User? @relation(fields: [authorId], references: [id])
            authorId String?
        }
                `;

    it('generate client helper react-query', async () => {
        await loadSchema(
            `
            plugin trpc {
                provider = '${process.cwd()}/dist'
                output = '$projectRoot/trpc'
                generateClientHelpers = 'react'
            }

            ${BLOG_BASE_SCHEMA}
            `,
            true,
            false,
            [`${origDir}/dist`, '@trpc/client', '@trpc/server', '@trpc/react-query'],
            true
        );
    });

    it('generate client helper next', async () => {
        await loadSchema(
            `
            plugin trpc {
                provider = '${process.cwd()}/dist'
                output = '$projectRoot/trpc'
                generateClientHelpers = 'next'
            }

            ${BLOG_BASE_SCHEMA}
            `,
            true,
            false,
            [`${origDir}/dist`, '@trpc/client', '@trpc/server', '@trpc/next'],
            true
        );
    });
});
