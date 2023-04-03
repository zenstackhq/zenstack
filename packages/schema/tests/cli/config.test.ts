/* eslint-disable @typescript-eslint/no-var-requires */
/// <reference types="@types/jest" />

import * as fs from 'fs';
import * as tmp from 'tmp';
import { createProgram } from '../../src/cli';
import { CliError } from '../../src/cli/cli-error';
import { config } from '../../src/cli/config';
import { GUARD_FIELD_NAME, TRANSACTION_FIELD_NAME } from '@zenstackhq/sdk';

describe('CLI Config Tests', () => {
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

    it('invalid default config', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        fs.writeFileSync('zenstack.config.json', JSON.stringify({ abc: 'def' }));

        const program = createProgram();
        await expect(program.parseAsync(['init', '--tag', 'latest'], { from: 'user' })).rejects.toBeInstanceOf(
            CliError
        );
    });

    it('valid default config empty', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        fs.writeFileSync('zenstack.config.json', JSON.stringify({}));

        const program = createProgram();
        await program.parseAsync(['init', '--tag', 'latest'], { from: 'user' });

        // custom config
        expect(config.guardFieldName).toBe(GUARD_FIELD_NAME);

        // default value
        expect(config.transactionFieldName).toBe(TRANSACTION_FIELD_NAME);
    });

    it('valid default config non-empty', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        fs.writeFileSync(
            'zenstack.config.json',
            JSON.stringify({ guardFieldName: 'myGuardField', transactionFieldName: 'myTransactionField' })
        );

        const program = createProgram();
        await program.parseAsync(['init', '--tag', 'latest'], { from: 'user' });

        // custom config
        expect(config.guardFieldName).toBe('myGuardField');

        // default value
        expect(config.transactionFieldName).toBe('myTransactionField');
    });

    it('config not found', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        const program = createProgram();
        await expect(
            program.parseAsync(['init', '--tag', 'latest', '--config', 'my.config.json'], { from: 'user' })
        ).rejects.toBeInstanceOf(CliError);
    });

    it('valid custom config file', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        fs.writeFileSync('my.config.json', JSON.stringify({ guardFieldName: 'myGuardField' }));
        const program = createProgram();
        await program.parseAsync(['init', '--tag', 'latest', '--config', 'my.config.json'], { from: 'user' });

        // custom config
        expect(config.guardFieldName).toBe('myGuardField');

        // default value
        expect(config.transactionFieldName).toBe(TRANSACTION_FIELD_NAME);
    });

    it('invalid custom config file', async () => {
        fs.writeFileSync('package.json', JSON.stringify({ name: 'my app', version: '1.0.0' }));
        fs.writeFileSync('my.config.json', JSON.stringify({ abc: 'def' }));
        const program = createProgram();
        await expect(
            program.parseAsync(['init', '--tag', 'latest', '--config', 'my.config.json'], { from: 'user' })
        ).rejects.toBeInstanceOf(CliError);
    });
});
