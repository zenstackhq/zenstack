/// <reference types="@types/jest" />

import { loadSchema, normalizePath } from '@zenstackhq/testtools';
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
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/trpc'
}

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
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server'],
                compile: true,
                fullZod: true,
            }
        );
    });

    it('run plugin relative output', async () => {
        const { projectDir } = await loadSchema(
            `
plugin trpc {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
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
            {
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server'],
                compile: true,
                fullZod: true,
            }
        );
        expect(fs.existsSync(path.join(projectDir, 'trpc'))).toBe(true);
    });

    it('run plugin non-standard zmodel location', async () => {
        const { projectDir } = await loadSchema(
            `
plugin trpc {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
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
            {
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server'],
                compile: true,
                fullZod: true,
                customSchemaFilePath: 'zenstack/schema.zmodel',
            }
        );
        expect(fs.existsSync(path.join(projectDir, 'zenstack/trpc'))).toBe(true);
    });

    it('generateModelActions option string', async () => {
        const { projectDir } = await loadSchema(
            `
plugin trpc {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = './trpc'
    generateModelActions = 'findMany,findUnique,update'
}

model Post {
    id String @id
    title String
}
        `,
            {
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server'],
                compile: true,
                fullZod: true,
                customSchemaFilePath: 'zenstack/schema.zmodel',
            }
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
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = './trpc'
    generateModelActions = ['findMany', 'findUnique', 'update']
}

model Post {
    id String @id
    title String
}
        `,
            {
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server'],
                compile: true,
                fullZod: true,
                customSchemaFilePath: 'zenstack/schema.zmodel',
            }
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
                provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
                output = '$projectRoot/trpc'
                generateClientHelpers = 'react'
            }

            ${BLOG_BASE_SCHEMA}
            `,
            {
                pushDb: false,
                extraDependencies: [
                    path.resolve(__dirname, '../dist'),
                    '@trpc/client',
                    '@trpc/server',
                    '@trpc/react-query',
                ],
                compile: true,
                fullZod: true,
            }
        );
    });

    it('generate client helper next', async () => {
        await loadSchema(
            `
            plugin trpc {
                provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
                output = '$projectRoot/trpc'
                generateClientHelpers = 'next'
            }

            ${BLOG_BASE_SCHEMA}
            `,
            {
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server', '@trpc/next'],
                compile: true,
                fullZod: true,
            }
        );
    });

    it('mixed casing', async () => {
        await loadSchema(
            `
plugin trpc {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/trpc'
}

model User {
    id String @id
    email String @unique
    posts post_item[]
}

model post_item {
    id String @id
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
}
        `,
            {
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server'],
                compile: true,
                fullZod: true,
            }
        );
    });

    it('generate for selected models and actions', async () => {
        const { projectDir } = await loadSchema(
            `
datasource db {
    provider = 'postgresql'
    url = env('DATABASE_URL')
}

generator js {
    provider = 'prisma-client-js'
}
        
plugin trpc {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/trpc'
    generateModels = ['Post']
    generateModelActions = ['findMany', 'update']
}

model User {
    id String @id
    email String @unique
    posts Post[]
}

model Post {
    id String @id
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
}

model Foo {
    id String @id
    value Int
}
        `,
            {
                addPrelude: false,
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server'],
                compile: true,
            }
        );

        expect(fs.existsSync(path.join(projectDir, 'trpc/routers/User.router.ts'))).toBeFalsy();
        expect(fs.existsSync(path.join(projectDir, 'trpc/routers/Foo.router.ts'))).toBeFalsy();
        expect(fs.existsSync(path.join(projectDir, 'trpc/routers/Post.router.ts'))).toBeTruthy();

        const postRouterContent = fs.readFileSync(path.join(projectDir, 'trpc/routers/Post.router.ts'), 'utf8');
        expect(postRouterContent).toContain('findMany:');
        expect(postRouterContent).toContain('update:');
        expect(postRouterContent).not.toContain('findUnique:');
        expect(postRouterContent).not.toContain('create:');

        // trpc plugin passes "generateModels" option down to implicitly enabled zod plugin

        expect(
            fs.existsSync(path.join(projectDir, 'node_modules/.zenstack/zod/input/PostInput.schema.js'))
        ).toBeTruthy();
        // zod for User is generated due to transitive dependency
        expect(
            fs.existsSync(path.join(projectDir, 'node_modules/.zenstack/zod/input/UserInput.schema.js'))
        ).toBeTruthy();
        expect(fs.existsSync(path.join(projectDir, 'node_modules/.zenstack/zod/input/FooInput.schema.js'))).toBeFalsy();
    });

    it('generate for selected models with zod plugin declared', async () => {
        const { projectDir } = await loadSchema(
            `
datasource db {
    provider = 'postgresql'
    url = env('DATABASE_URL')
}

generator js {
    provider = 'prisma-client-js'
}

plugin zod {
    provider = '@core/zod'
}
                    
plugin trpc {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/trpc'
    generateModels = ['Post']
    generateModelActions = ['findMany', 'update']
}

model User {
    id String @id
    email String @unique
    posts Post[]
}

model Post {
    id String @id
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
}

model Foo {
    id String @id
    value Int
} 
        `,
            {
                addPrelude: false,
                pushDb: false,
                extraDependencies: [path.resolve(__dirname, '../dist'), '@trpc/client', '@trpc/server'],
                compile: true,
            }
        );

        // trpc plugin's "generateModels" shouldn't interfere in this case

        expect(
            fs.existsSync(path.join(projectDir, 'node_modules/.zenstack/zod/input/PostInput.schema.js'))
        ).toBeTruthy();
        expect(
            fs.existsSync(path.join(projectDir, 'node_modules/.zenstack/zod/input/UserInput.schema.js'))
        ).toBeTruthy();
        expect(
            fs.existsSync(path.join(projectDir, 'node_modules/.zenstack/zod/input/FooInput.schema.js'))
        ).toBeTruthy();
    });
});
