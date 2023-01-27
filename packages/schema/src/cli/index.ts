/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZModelLanguageMetaData } from '@zenstackhq/language/module';
import colors from 'colors';
import { Command, Option } from 'commander';
import * as semver from 'semver';
import telemetry from '../telemetry';
import { PackageManagers } from '../utils/pkg-utils';
import { getVersion } from '../utils/version-utils';
import { CliError } from './cli-error';
import { initProject, runPlugins } from './cli-util';

// required minimal version of Prisma
export const requiredPrismaVersion = '4.0.0';

export const initAction = async (
    projectPath: string,
    options: {
        prisma: string | undefined;
        packageManager: PackageManagers | undefined;
        tag: string;
    }
): Promise<void> => {
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'init' },
        () => initProject(projectPath, options.prisma, options.packageManager, options.tag)
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

export function createProgram() {
    const program = new Command('zenstack');

    program.version(getVersion(), '-v --version', 'display CLI version');

    const schemaExtensions = ZModelLanguageMetaData.fileExtensions.join(', ');

    program
        .description(
            `${colors.bold.blue(
                'ζ'
            )} ZenStack is a Prisma power pack for building full-stack apps.\n\nDocumentation: https://zenstack.dev.`
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

    program
        .command('init')
        .description('Initialize an existing project for ZenStack.')
        .addOption(pmOption)
        .addOption(new Option('--prisma <file>', 'location of Prisma schema file to bootstrap from'))
        .addOption(
            new Option('--tag <tag>', 'the NPM package tag to use when installing dependencies').default(
                '<DEFAULT_NPM_TAG>'
            )
        )
        .argument('[path]', 'project path', '.')
        .action(initAction);

    program
        .command('generate')
        .description('Generates RESTful API and Typescript client for your data model.')
        .addOption(schemaOption)
        .addOption(pmOption)
        .action(generateAction);
    return program;
}

export default async function (): Promise<void> {
    await telemetry.trackSpan('cli:start', 'cli:complete', 'cli:error', { args: process.argv }, async () => {
        const program = createProgram();

        // handle errors explicitly to ensure telemetry
        program.exitOverride();

        await program.parseAsync(process.argv);
    });
}
