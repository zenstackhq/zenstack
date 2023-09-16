/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZModelLanguageMetaData } from '@zenstackhq/language/module';
import colors from 'colors';
import { Command, Option } from 'commander';
import fs from 'fs';
import telemetry from '../telemetry';
import { getVersion } from '../utils/version-utils';
import * as actions from './actions';
import { loadConfig } from './config';

const DEFAULT_CONFIG_FILE = 'zenstack.config.json';

export const initAction = async (projectPath: string, options: Parameters<typeof actions.init>[1]): Promise<void> => {
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'init' },
        () => actions.init(projectPath, options)
    );
};

export const infoAction = async (projectPath: string): Promise<void> => {
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'info' },
        () => actions.info(projectPath)
    );
};

export const generateAction = async (options: Parameters<typeof actions.generate>[1]): Promise<void> => {
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'generate' },
        () => actions.generate(process.cwd(), options)
    );
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

    const configOption = new Option('-c, --config [file]', 'config file');
    const pmOption = new Option('-p, --package-manager <pm>', 'package manager to use').choices([
        'npm',
        'yarn',
        'pnpm',
    ]);
    const noVersionCheckOption = new Option('--no-version-check', 'do not check for new version');
    const noDependencyCheck = new Option('--no-dependency-check', 'do not check if dependencies are installed');

    program
        .command('info')
        .description('Get information of installed ZenStack and related packages.')
        .argument('[path]', 'project path', '.')
        .action(infoAction);

    program
        .command('init')
        .description('Initialize an existing project for ZenStack.')
        .addOption(configOption)
        .addOption(pmOption)
        .addOption(new Option('--prisma <file>', 'location of Prisma schema file to bootstrap from'))
        .addOption(new Option('--tag [tag]', 'the NPM package tag to use when installing dependencies'))
        .addOption(noVersionCheckOption)
        .argument('[path]', 'project path', '.')
        .action(initAction);

    program
        .command('generate')
        .description('Run code generation.')
        .addOption(schemaOption)
        .addOption(configOption)
        .addOption(pmOption)
        .addOption(noVersionCheckOption)
        .addOption(noDependencyCheck)
        .action(generateAction);

    // make sure config is loaded before actions run
    program.hook('preAction', async (_, actionCommand) => {
        let configFile: string | undefined = actionCommand.opts().config;

        if (!configFile && fs.existsSync(DEFAULT_CONFIG_FILE)) {
            configFile = DEFAULT_CONFIG_FILE;
        }

        if (configFile) {
            loadConfig(configFile);
        }
    });

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
