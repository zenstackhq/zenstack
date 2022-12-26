/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZModelLanguageMetaData } from '@zenstackhq/language/module';
import colors from 'colors';
import { Command, Option } from 'commander';
import telemetry from '../telemetry';
import { PackageManagers } from '../utils/pkg-utils';
import { initProject, runPlugins } from './cli-util';
import * as semver from 'semver';
import { CliError } from './cli-error';

// required minimal version of Prisma
export const requiredPrismaVersion = '4.0.0';

export const initAction = async (
    projectPath: string,
    options: {
        packageManager: PackageManagers | undefined;
    }
): Promise<void> => {
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'init' },
        () => initProject(projectPath, options.packageManager)
    );
};

export const generateAction = async (options: {
    schema: string;
    packageManager: PackageManagers | undefined;
}): Promise<void> => {
    checkRequiredPackage('prisma', requiredPrismaVersion);
    checkRequiredPackage('@prisma/client', requiredPrismaVersion);
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'generate' },
        () => runPlugins(options)
    );
};

const checkRequiredPackage = (packageName: string, minVersion?: string) => {
    let packageVersion: string;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        packageVersion = require(`${packageName}/package.json`).version;
    } catch (error) {
        console.error(colors.red(`${packageName} not found, please install it`));
        throw new CliError(`${packageName} not found`);
    }

    if (minVersion && semver.lt(packageVersion, minVersion)) {
        console.error(
            colors.red(
                `${packageName} needs to be above ${minVersion}, the installed version is ${packageVersion}, please upgrade it`
            )
        );
        throw new CliError(`${packageName} version is too low`);
    }
};

export default async function (): Promise<void> {
    await telemetry.trackSpan('cli:start', 'cli:complete', 'cli:error', { args: process.argv }, async () => {
        const program = new Command('zenstack');

        program.version(
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('../../package.json').version,
            '-v --version',
            'display CLI version'
        );

        const schemaExtensions = ZModelLanguageMetaData.fileExtensions.join(', ');

        program
            .description(
                `${colors.bold.blue(
                    'ζ'
                )} ZenStack is a toolkit for building secure CRUD apps with Next.js + Typescript.\n\nDocumentation: https://zenstack.dev.`
            )
            .showHelpAfterError()
            .showSuggestionAfterError();

        const schemaOption = new Option('--schema <file>', `schema file (with extension ${schemaExtensions})`).default(
            './schema.zmodel'
        );

        const pmOption = new Option('-p, --package-manager <pm>', 'package manager to use').choices([
            'npm',
            'yarn',
            'pnpm',
        ]);

        //#region wraps Prisma commands

        program
            .command('init')
            .description('Set up a new ZenStack project.')
            .addOption(pmOption)
            .argument('[path]', 'project path', '.')
            .action(initAction);

        program
            .command('generate')
            .description('Generates RESTful API and Typescript client for your data model.')
            .addOption(schemaOption)
            .addOption(pmOption)
            .action(generateAction);

        //#endregion

        // handle errors explicitly to ensure telemetry
        program.exitOverride();

        await program.parseAsync(process.argv);
    });
}
