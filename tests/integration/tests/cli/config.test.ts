/* eslint-disable @typescript-eslint/no-var-requires */
/// <reference types="@types/jest" />

import * as fs from 'fs';
import * as tmp from 'tmp';
import { createProgram } from '../../../../packages/schema/src/cli';

tmp.setGracefulCleanup();

describe('CLI Config Tests', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
        const r = tmp.dirSync({ unsafeCleanup: true });
        console.log(`Project dir: ${r.name}`);
        process.chdir(r.name);

        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    // for ensuring backward compatibility only
    it('valid default config empty', async () => {
        fs.writeFileSync('zenstack.config.json', JSON.stringify({}));
        const program = createProgram();
        await program.parseAsync(['init', '--tag', 'latest'], { from: 'user' });
    });

    // for ensuring backward compatibility only
    it('valid default config non-empty', async () => {
        fs.writeFileSync(
            'zenstack.config.json',
            JSON.stringify({ guardFieldName: 'myGuardField', transactionFieldName: 'myTransactionField' })
        );

        const program = createProgram();
        await program.parseAsync(['init', '--tag', 'latest'], { from: 'user' });
    });

    it('custom config file does not exist', async () => {
        const program = createProgram();
        const configFile = `my.config.json`;
        await expect(
            program.parseAsync(['init', '--tag', 'latest', '--config', configFile], { from: 'user' })
        ).rejects.toThrow(/Config file could not be found/i);
    });

    it('custom config file is not json', async () => {
        const program = createProgram();
        const configFile = `my.config.json`;
        fs.writeFileSync(configFile, ` 😬 😬 😬`);
        await expect(
            program.parseAsync(['init', '--tag', 'latest', '--config', configFile], { from: 'user' })
        ).rejects.toThrow(/Config is not a valid JSON file/i);
    });

    // for ensuring backward compatibility only
    it('valid custom config file', async () => {
        fs.writeFileSync('my.config.json', JSON.stringify({ guardFieldName: 'myGuardField' }));
        const program = createProgram();
        await program.parseAsync(['init', '--tag', 'latest', '--config', 'my.config.json'], { from: 'user' });
    });
});
