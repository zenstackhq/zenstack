import colors from 'colors';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { detect, resolveCommand } from 'package-manager-detector';
import { CliError } from '../cli-error';
import { execSync } from '../utils/exec-utils';
import { STARTER_ZMODEL } from './templates';

/**
 * CLI action for getting information about installed ZenStack packages
 */
export async function run(projectPath: string) {
    const packages = [
        { name: '@zenstackhq/cli@latest', dev: true },
        { name: '@zenstackhq/schema@latest', dev: false },
        { name: '@zenstackhq/orm@latest', dev: false },
    ];
    let pm = await detect();
    if (!pm) {
        pm = { agent: 'npm', name: 'npm' };
    }

    console.log(colors.gray(`Using package manager: ${pm.agent}`));

    for (const pkg of packages) {
        const resolved = resolveCommand(pm.agent, 'add', [
            pkg.name,
            ...(pkg.dev ? [pm.agent.startsWith('yarn') || pm.agent === 'bun' ? '--dev' : '--save-dev'] : []),
        ]);
        if (!resolved) {
            throw new CliError(`Unable to determine how to install package "${pkg.name}". Please install it manually.`);
        }

        const spinner = ora(`Installing "${pkg.name}"`).start();
        try {
            execSync(`${resolved.command} ${resolved.args.join(' ')}`, {
                cwd: projectPath,
            });
            spinner.succeed();
        } catch (e) {
            spinner.fail();
            throw e;
        }
    }

    const generationFolder = 'zenstack';

    if (!fs.existsSync(path.join(projectPath, generationFolder))) {
        fs.mkdirSync(path.join(projectPath, generationFolder));
    }

    if (!fs.existsSync(path.join(projectPath, generationFolder, 'schema.zmodel'))) {
        fs.writeFileSync(path.join(projectPath, generationFolder, 'schema.zmodel'), STARTER_ZMODEL);
    } else {
        console.log(colors.yellow('Schema file already exists. Skipping generation of sample.'));
    }

    console.log(colors.green('ZenStack project initialized successfully!'));
    console.log(colors.gray(`See "${generationFolder}/schema.zmodel" for your database schema.`));
    console.log(colors.gray('Run `zenstack generate` to compile the the schema into a TypeScript file.'));
}
