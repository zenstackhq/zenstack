/* eslint-disable @typescript-eslint/no-var-requires */
/// <reference types="@types/jest" />

import { getWorkspaceNpmCacheFolder } from '@zenstackhq/testtools';
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
        `plugin react {
            provider = '${path.join(__dirname, '../../../plugins/react/dist')}'
            output = 'lib/default-hooks'
        }`,
        `plugin trpc {
            provider = '${path.join(__dirname, '../../../plugins/trpc/dist')}'
            output = 'lib/trpc'
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

    it('all plugins', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        createNpmrc();
        const program = createProgram();
        await program.parseAsync(['init', '--tag', 'latest'], { from: 'user' });

        let schemaContent = fs.readFileSync('schema.zmodel', 'utf-8');
        for (const plugin of plugins) {
            schemaContent += `\n${plugin}`;
        }
        fs.writeFileSync('schema.zmodel', schemaContent);
        await program.parseAsync(['generate', '--no-dependency-check'], { from: 'user' });
    });
});
