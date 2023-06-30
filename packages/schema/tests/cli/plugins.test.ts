/* eslint-disable @typescript-eslint/no-var-requires */
/// <reference types="@types/jest" />

import { getWorkspaceNpmCacheFolder, run } from '@zenstackhq/testtools';
import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import { createProgram } from '../../src/cli';

describe('CLI Plugins Tests', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
        const r = tmp.dirSync({ unsafeCleanup: true });
        console.log(`Project dir: ${r.name}`);
        process.chdir(r.name);
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    function createNpmrc() {
        fs.writeFileSync('.npmrc', `cache=${getWorkspaceNpmCacheFolder(__dirname)}`);
    }

    async function initProject() {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        createNpmrc();
        const program = createProgram();

        // typescript
        run('npm install -D typescript');
        run('npx tsc --init');

        // deps
        run('npm install react swr @tanstack/react-query @trpc/server @types/react');

        await program.parseAsync(['init', '--tag', 'latest'], { from: 'user' });
        return program;
    }

    const plugins = [
        `plugin prisma {
            provider = '@core/prisma'
            output = 'prisma/my.prisma'
            generateClient = true
        }`,
        `plugin meta {
            provider = '@core/model-meta'
            output = 'model-meta'
        }
        `,
        `plugin policy {
            provider = '@core/access-policy'
            output = 'policy'
        }`,
        `plugin zod {
            provider = '@core/zod'
            output = 'zod'
        }`,
        `plugin tanstack {
            provider = '${path.join(__dirname, '../../../plugins/tanstack-query/dist')}'
            output = 'lib/tanstack-query'
            target = 'react'
        }`,
        `plugin swr {
            provider = '${path.join(__dirname, '../../../plugins/swr/dist')}'
            output = 'lib/swr'
        }`,
        `plugin trpc {
            provider = '${path.join(__dirname, '../../../plugins/trpc/dist')}'
            output = 'lib/trpc'
            zodSchemasImport = '../../../zod'
        }`,
        `plugin openapi {
            provider = '${path.join(__dirname, '../../../plugins/openapi/dist')}'
            output = 'myapi.yaml'
            specVersion = '3.0.0'
            title = 'My Awesome API'
            version = '1.0.0'
            description = 'awesome api'
            prefix = '/myapi'
            securitySchemes = {
                myBasic: { type: 'http', scheme: 'basic' },
                myBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
                myApiKey: { type: 'apiKey', in: 'header', name: 'X-API-KEY' }
            }
        }`,
    ];

    const BASE_MODEL = `
    datasource db {
        provider = 'postgresql'
        url = env('DATABASE_URL')
    }
    
    enum Role {
        USER
        ADMIN
    }
    
    model User {
        id String @id @default(cuid())
        email String @unique @email
        role Role @default(USER)
        posts Post[]
        @@allow('create', true)
        @@allow('all', auth() == this || role == ADMIN)
    }
    
    model Post {
        id String @id @default(cuid())
        createdAt DateTime @default(now())
        published Boolean @default(false)
        author User? @relation(fields: [authorId], references: [id])
        authorId String?
    
        @@allow('read', auth() != null && published)
        @@allow('all', auth() == author)
    }
    `;

    it('all plugins standard prisma client output path', async () => {
        const program = await initProject();

        let schemaContent = `
generator client {
    provider = "prisma-client-js"
}

${BASE_MODEL}
        `;
        for (const plugin of plugins) {
            schemaContent += `\n${plugin}`;
        }
        fs.writeFileSync('schema.zmodel', schemaContent);

        await program.parseAsync(['generate', '--no-dependency-check'], { from: 'user' });

        // compile
        run('npx tsc');
    });

    it('all plugins custom prisma client output path', async () => {
        const program = await initProject();

        let schemaContent = `
generator client {
    provider = "prisma-client-js"
    output = "foo/bar"
}

${BASE_MODEL}
`;
        for (const plugin of plugins) {
            schemaContent += `\n${plugin}`;
        }
        fs.writeFileSync('schema.zmodel', schemaContent);

        await program.parseAsync(['generate', '--no-dependency-check'], { from: 'user' });

        // compile
        run('npx tsc');
    });

    it('all plugins absolute prisma client output path', async () => {
        const { name: output } = tmp.dirSync({ unsafeCleanup: true });
        console.log('Output prisma client to:', output);

        const program = await initProject();

        let schemaContent = `
generator client {
    provider = "prisma-client-js"
    output = "${output}"
}

${BASE_MODEL}
`;
        for (const plugin of plugins) {
            schemaContent += `\n${plugin}`;
        }
        fs.writeFileSync('schema.zmodel', schemaContent);

        await program.parseAsync(['generate', '--no-dependency-check'], { from: 'user' });

        // compile
        run('npx tsc');
    });
});
