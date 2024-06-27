/* eslint-disable @typescript-eslint/no-var-requires */
/// <reference types="@types/jest" />

import { getWorkspaceNpmCacheFolder, installPackage, run } from '@zenstackhq/testtools';
import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import { createProgram } from '../../../../packages/schema/src/cli';

tmp.setGracefulCleanup();

describe('CLI Plugins Tests', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    function createNpmrc() {
        fs.writeFileSync('.npmrc', `cache=${getWorkspaceNpmCacheFolder(__dirname)}`);
    }

    const PACKAGE_MANAGERS = ['npm' /*, 'pnpm', 'pnpm-workspace'*/] as const;

    function zenstackGenerate(pm: (typeof PACKAGE_MANAGERS)[number], output?: string) {
        switch (pm) {
            case 'npm':
                run(`ZENSTACK_TEST=0 npx zenstack generate${output ? ' --output ' + output : ''}`);
                break;
            // case 'pnpm':
            // case 'pnpm-workspace':
            //     run(`ZENSTACK_TEST=0 pnpm zenstack generate`);
            //     break;
        }
    }

    async function initProject(pm: (typeof PACKAGE_MANAGERS)[number] = 'npm') {
        const r = tmp.dirSync({ unsafeCleanup: true });
        console.log(`Project dir: ${r.name}`);
        process.chdir(r.name);

        createNpmrc();

        // init project
        switch (pm) {
            case 'npm':
                run('npm init -y');
                break;
            // case 'yarn':
            //     run('yarn init');
            //     break;
            // case 'pnpm':
            // case 'pnpm-workspace':
            //     run('pnpm init');
            //     break;
        }

        // if (pm === 'pnpm-workspace') {
        //     // create a package
        //     fs.writeFileSync('pnpm-workspace.yaml', JSON.stringify({ packages: ['db'] }));
        //     fs.mkdirSync('db');
        //     process.chdir('db');
        //     run('pnpm init');
        // }

        // deps
        const ver = require('../../../../packages/schema/package.json').version;
        const depPkgs = [
            'zod@3.21.1',
            'react',
            'swr',
            '@tanstack/react-query@^5.0.0',
            '@trpc/server',
            '@prisma/client@5.16.x',
            `${path.join(__dirname, '../../../../.build/zenstackhq-language-' + ver + '.tgz')}`,
            `${path.join(__dirname, '../../../../.build/zenstackhq-sdk-' + ver + '.tgz')}`,
            `${path.join(__dirname, '../../../../.build/zenstackhq-runtime-' + ver + '.tgz')}`,
        ];
        const deps = depPkgs.join(' ');

        const devDepPkgs = [
            'typescript',
            '@types/react',
            'prisma@5.16.x',
            `${path.join(__dirname, '../../../../.build/zenstack-' + ver + '.tgz')}`,
            `${path.join(__dirname, '../../../../.build/zenstackhq-tanstack-query-' + ver + '.tgz')}`,
            `${path.join(__dirname, '../../../../.build/zenstackhq-swr-' + ver + '.tgz')}`,
            `${path.join(__dirname, '../../../../.build/zenstackhq-trpc-' + ver + '.tgz')}`,
            `${path.join(__dirname, '../../../../.build/zenstackhq-openapi-' + ver + '.tgz')}`,
        ];
        const devDeps = devDepPkgs.join(' ');

        switch (pm) {
            case 'npm':
                installPackage(deps);
                installPackage(devDeps, true);
                break;
            // case 'yarn':
            //     run('yarn add ' + deps);
            //     run('yarn add --dev ' + devDeps);
            //     break;
            // case 'pnpm':
            // case 'pnpm-workspace':
            //     run('pnpm add ' + deps);
            //     run('pnpm add -D ' + devDeps);
            //     break;
        }

        // init typescript project
        fs.writeFileSync(
            'tsconfig.json',
            JSON.stringify({
                compilerOptions: {
                    strict: true,
                    lib: ['esnext', 'dom'],
                    esModuleInterop: true,
                    skipLibCheck: true,
                },
            })
        );

        return createProgram();
    }

    const plugins = [
        `plugin prisma {
            provider = '@core/prisma'
            output = 'prisma/my.prisma'
            generateClient = true
        }`,
        `plugin enhancer {
            provider = '@core/enhancer'
        }`,
        `plugin tanstack {
            provider = '@zenstackhq/tanstack-query'
            output = 'lib/tanstack-query'
            target = 'react'
        }`,
        `plugin swr {
            provider = '@zenstackhq/swr'
            output = 'lib/swr'
        }`,
        `plugin trpc {
            provider = '@zenstackhq/trpc'
            output = 'lib/trpc'
        }`,
        `plugin openapi {
            provider = '@zenstackhq/openapi'
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
    
    enum role {
        USER
        ADMIN
    }
    
    model User {
        id String @id @default(cuid())
        email String @unique @email
        role role @default(USER)
        posts post_item[]
        @@allow('create', true)
        @@allow('all', auth() == this || role == ADMIN)
    }
    
    model post_item {
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
        for (const pm of PACKAGE_MANAGERS) {
            console.log('[PACKAGE MANAGER]', pm);
            await initProject(pm);

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

            // generate
            zenstackGenerate(pm);

            // compile
            run('npx tsc');
        }
    });

    it('all plugins custom prisma client output path', async () => {
        for (const pm of PACKAGE_MANAGERS) {
            console.log('[PACKAGE MANAGER]', pm);
            await initProject(pm);

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

            // generate
            zenstackGenerate(pm);

            // compile
            run('npx tsc');
        }
    });

    it('all plugins absolute prisma client output path', async () => {
        for (const pm of PACKAGE_MANAGERS) {
            console.log('[PACKAGE MANAGER]', pm);
            const { name: output } = tmp.dirSync({ unsafeCleanup: true });
            console.log('Output prisma client to:', output);

            await initProject(pm);

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

            // generate
            zenstackGenerate(pm);

            // compile
            run('npx tsc');
        }
    });

    it('all plugins custom core output path', async () => {
        for (const pm of PACKAGE_MANAGERS) {
            console.log('[PACKAGE MANAGER]', pm);
            await initProject(pm);

            let schemaContent = `
generator client {
    provider = "prisma-client-js"
}

${BASE_MODEL}
        `;
            for (const plugin of plugins) {
                if (!plugin.includes('trp')) {
                    schemaContent += `\n${plugin}`;
                }
            }

            schemaContent += `plugin trpc {
                provider = '@zenstackhq/trpc'
                output = 'lib/trpc'
                zodSchemasImport = '../../../zen/zod'
            }`;

            fs.writeFileSync('schema.zmodel', schemaContent);

            // generate
            zenstackGenerate(pm, './zen');

            // compile
            run('npx tsc');
        }
    });
});
