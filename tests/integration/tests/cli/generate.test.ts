/* eslint-disable @typescript-eslint/no-var-requires */
/// <reference types="@types/jest" />

import { installPackage } from '@zenstackhq/testtools';
import * as fs from 'fs';
import path from 'path';
import * as tmp from 'tmp';
import { createProgram } from '../../../../packages/schema/src/cli';
import { createNpmrc } from './share';

tmp.setGracefulCleanup();

describe('CLI generate command tests', () => {
    let origDir: string;
    const MODEL = `
datasource db {
    provider = "sqlite"
    url = "file:./dev.db"
}

generator js {
    provider = "prisma-client-js"
}

model User {
    id Int @id @default(autoincrement())
    email String @unique @email
    posts Post[]
}    

model Post {
    id Int @id @default(autoincrement())
    title String
    author User @relation(fields: [authorId], references: [id])
    authorId Int
}
    `;

    beforeEach(() => {
        origDir = process.cwd();
        const r = tmp.dirSync({ unsafeCleanup: true });
        console.log(`Project dir: ${r.name}`);
        process.chdir(r.name);

        // set up project
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        createNpmrc();
        installPackage('prisma @prisma/client zod');
        installPackage(path.join(__dirname, '../../../../packages/runtime/dist'));

        // set up schema
        fs.writeFileSync('schema.zmodel', MODEL, 'utf-8');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('generate standard', async () => {
        const program = createProgram();
        await program.parseAsync(['generate', '--no-dependency-check'], { from: 'user' });
        expect(fs.existsSync('./node_modules/.zenstack/policy.js')).toBeTruthy();
        expect(fs.existsSync('./node_modules/.zenstack/model-meta.js')).toBeTruthy();
        expect(fs.existsSync('./node_modules/.zenstack/zod/index.js')).toBeTruthy();
    });

    it('generate custom output default', async () => {
        const program = createProgram();
        await program.parseAsync(['generate', '--no-dependency-check', '-o', 'out'], { from: 'user' });
        expect(fs.existsSync('./node_modules/.zenstack')).toBeFalsy();
        expect(fs.existsSync('./out/policy.js')).toBeTruthy();
        expect(fs.existsSync('./out/model-meta.js')).toBeTruthy();
        expect(fs.existsSync('./out/zod')).toBeTruthy();
    });

    it('generate custom output non-std schema location', async () => {
        fs.mkdirSync('./schema');
        fs.cpSync('schema.zmodel', './schema/my.zmodel');
        fs.rmSync('schema.zmodel');

        const program = createProgram();
        await program.parseAsync(['generate', '--no-dependency-check', '--schema', './schema/my.zmodel', '-o', 'out'], {
            from: 'user',
        });
        expect(fs.existsSync('./node_modules/.zenstack')).toBeFalsy();
        expect(fs.existsSync('./out/policy.js')).toBeTruthy();
        expect(fs.existsSync('./out/model-meta.js')).toBeTruthy();
        expect(fs.existsSync('./out/zod')).toBeTruthy();
    });

    it('generate no default plugins run nothing', async () => {
        const program = createProgram();
        await program.parseAsync(['generate', '--no-dependency-check', '--no-default-plugins'], { from: 'user' });
        expect(fs.existsSync('./node_modules/.zenstack/policy.js')).toBeFalsy();
        expect(fs.existsSync('./node_modules/.zenstack/model-meta.js')).toBeFalsy();
        expect(fs.existsSync('./prisma/schema.prisma')).toBeFalsy();
    });

    it('generate no default plugins with prisma only', async () => {
        fs.appendFileSync(
            'schema.zmodel',
            `
        plugin prisma {
            provider = '@core/prisma'
        }
        `
        );
        const program = createProgram();
        await program.parseAsync(['generate', '--no-dependency-check', '--no-default-plugins'], { from: 'user' });
        expect(fs.existsSync('./node_modules/.zenstack/policy.js')).toBeFalsy();
        expect(fs.existsSync('./node_modules/.zenstack/model-meta.js')).toBeFalsy();
        expect(fs.existsSync('./prisma/schema.prisma')).toBeTruthy();
    });

    it('generate no default plugins with enhancer and zod', async () => {
        fs.appendFileSync(
            'schema.zmodel',
            `
        plugin prisma {
            provider = '@core/prisma'
        }

        plugin zod {
            provider = '@core/zod'
        }

        plugin enhancer {
            provider = '@core/enhancer'
        }
        `
        );
        const program = createProgram();
        await program.parseAsync(['generate', '--no-dependency-check', '--no-default-plugins'], { from: 'user' });
        expect(fs.existsSync('./node_modules/.zenstack/policy.js')).toBeTruthy();
        expect(fs.existsSync('./node_modules/.zenstack/model-meta.js')).toBeTruthy();
        expect(fs.existsSync('./prisma/schema.prisma')).toBeTruthy();
    });

    it('generate no compile', async () => {
        const program = createProgram();
        await program.parseAsync(['generate', '--no-dependency-check', '--no-compile'], { from: 'user' });
        expect(fs.existsSync('./node_modules/.zenstack/policy.js')).toBeFalsy();
        expect(fs.existsSync('./node_modules/.zenstack/policy.ts')).toBeTruthy();
        expect(fs.existsSync('./node_modules/.zenstack/model-meta.js')).toBeFalsy();
        expect(fs.existsSync('./node_modules/.zenstack/model-meta.ts')).toBeTruthy();
        expect(fs.existsSync('./node_modules/.zenstack/zod/index.js')).toBeFalsy();
        expect(fs.existsSync('./node_modules/.zenstack/zod/index.ts')).toBeTruthy();
    });

    it('generate with prisma generateArgs', async () => {
        fs.appendFileSync(
            'schema.zmodel',
            `
        plugin prisma {
            provider = '@core/prisma'
            generateArgs = '--no-engine'
        }
        `
        );
        const program = createProgram();
        await program.parseAsync(['generate', '--no-dependency-check', '--no-default-plugins'], { from: 'user' });
    });
});
