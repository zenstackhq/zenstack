/* eslint-disable @typescript-eslint/no-var-requires */
/// <reference types="@types/jest" />

import { getWorkspaceNpmCacheFolder } from '@zenstackhq/testtools';
import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import { createProgram } from '../../src/cli';
import { execSync } from '../../src/utils/exec-utils';

describe('CLI Tests', () => {
    let projDir: string;
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
        const r = tmp.dirSync();
        projDir = r.name;
        console.log(`Project dir: ${projDir}`);
        process.chdir(projDir);
    });

    afterEach(() => {
        fs.rmSync(projDir, { recursive: true, force: true });
        process.chdir(origDir);
    });

    function createNpmrc() {
        fs.writeFileSync('.npmrc', `cache=${getWorkspaceNpmCacheFolder(__dirname)}`);
    }

    it('init project t3 npm std', async () => {
        execSync('npx --yes create-t3-app@latest --prisma --CI --noGit .', 'inherit', {
            npm_config_user_agent: 'npm',
            npm_config_cache: getWorkspaceNpmCacheFolder(__dirname),
        });
        createNpmrc();

        const program = createProgram();
        program.parse(['init'], { from: 'user' });

        expect(fs.readFileSync('schema.zmodel', 'utf-8')).toEqual(fs.readFileSync('prisma/schema.prisma', 'utf-8'));

        checkDependency('zenstack', true, true);
        checkDependency('@zenstackhq/runtime', false, true);
    });

    it('init project t3 yarn std', async () => {
        execSync('npx --yes create-t3-app@latest --prisma --CI --noGit .', 'inherit', {
            npm_config_user_agent: 'yarn',
            npm_config_cache: getWorkspaceNpmCacheFolder(__dirname),
        });
        createNpmrc();

        const program = createProgram();
        program.parse(['init'], { from: 'user' });

        expect(fs.readFileSync('schema.zmodel', 'utf-8')).toEqual(fs.readFileSync('prisma/schema.prisma', 'utf-8'));

        checkDependency('zenstack', true, true);
        checkDependency('@zenstackhq/runtime', false, true);
    });

    it('init project t3 pnpm std', async () => {
        execSync('npx --yes create-t3-app@latest --prisma --CI --noGit .', 'inherit', {
            npm_config_user_agent: 'pnpm',
            npm_config_cache: getWorkspaceNpmCacheFolder(__dirname),
        });
        createNpmrc();

        const program = createProgram();
        program.parse(['init'], { from: 'user' });

        expect(fs.readFileSync('schema.zmodel', 'utf-8')).toEqual(fs.readFileSync('prisma/schema.prisma', 'utf-8'));

        checkDependency('zenstack', true, true);
        checkDependency('@zenstackhq/runtime', false, true);
    });

    it('init project t3 non-std prisma schema', async () => {
        execSync('npx --yes create-t3-app@latest --prisma --CI --noGit .', 'inherit', {
            npm_config_user_agent: 'npm',
            npm_config_cache: getWorkspaceNpmCacheFolder(__dirname),
        });
        createNpmrc();
        fs.renameSync('prisma/schema.prisma', 'prisma/my.prisma');

        const program = createProgram();
        program.parse(['init', '--tag', 'latest', '--prisma', 'prisma/my.prisma'], { from: 'user' });

        expect(fs.readFileSync('schema.zmodel', 'utf-8')).toEqual(fs.readFileSync('prisma/my.prisma', 'utf-8'));
    });

    it('init project empty project', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        createNpmrc();
        const program = createProgram();
        program.parse(['init', '--tag', 'latest'], { from: 'user' });
        expect(fs.readFileSync('schema.zmodel', 'utf-8')).toBeTruthy();

        checkDependency('prisma', true, false);
        checkDependency('@prisma/client', false, false);
    });

    it('init project existing zmodel', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        const origZModelContent = `
        datasource db {
            provider = 'sqlite'
            url = 'file:./todo.db'
        }
        `;
        fs.writeFileSync('schema.zmodel', origZModelContent);
        createNpmrc();
        const program = createProgram();
        program.parse(['init', '--tag', 'latest'], { from: 'user' });
        expect(fs.readFileSync('schema.zmodel', 'utf-8')).toEqual(origZModelContent);
    });
});

function checkDependency(pkg: string, isDev: boolean, requireExactVersion = true) {
    const pkgJson = require(path.resolve('./package.json'));

    if (isDev) {
        expect(pkgJson.devDependencies[pkg]).toBeTruthy();
        if (requireExactVersion) {
            expect(pkgJson.devDependencies[pkg]).not.toMatch(/^[\^~].*/);
        }
    } else {
        expect(pkgJson.dependencies[pkg]).toBeTruthy();
        if (requireExactVersion) {
            expect(pkgJson.dependencies[pkg]).not.toMatch(/^[\^~].*/);
        }
    }
}
