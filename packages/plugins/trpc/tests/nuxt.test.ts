/* eslint-disable @typescript-eslint/no-var-requires */
import { run } from '@zenstackhq/testtools';
import path from 'path';

describe('tRPC plugin tests with nuxt', () => {
    let origDir: string | undefined;

    beforeEach(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        if (origDir) {
            process.chdir(origDir);
        }
    });

    it('project test trpc v10', () => {
        const ver = require(path.join(__dirname, '../package.json')).version;
        process.chdir(path.join(__dirname, './projects/nuxt-trpc-v10'));

        const deps = ['zenstackhq-language', 'zenstackhq-runtime', 'zenstackhq-sdk', 'zenstack'];
        for (const dep of deps) {
            run(`npm install ${path.join(__dirname, '../../../../.build/') + dep + '-' + ver + '.tgz'}`);
        }

        run('npx zenstack generate');
        run('npm run build');
    });

    it('project test trpc v11', () => {
        const ver = require(path.join(__dirname, '../package.json')).version;
        process.chdir(path.join(__dirname, './projects/nuxt-trpc-v11'));

        const deps = ['zenstackhq-language', 'zenstackhq-runtime', 'zenstackhq-sdk', 'zenstack'];
        for (const dep of deps) {
            run(`npm install ${path.join(__dirname, '../../../../.build/') + dep + '-' + ver + '.tgz'}`);
        }

        run('npx zenstack generate');
        run('npm run build');
    });
});
