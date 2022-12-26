/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZModelLanguageMetaData } from '@zenstackhq/language/module';
import colors from 'colors';
import { Command, Option } from 'commander';
import telemetry from '../telemetry';
import { PackageManagers } from '../utils/pkg-utils';
import { initProject, runPlugins } from './cli-util';

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
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'generate' },
        () => runPlugins(options)
    );
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
