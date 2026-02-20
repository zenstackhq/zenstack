import 'dotenv/config';
import { ZModelLanguageMetaData } from '@zenstackhq/language';
import colors from 'colors';
import { Command, CommanderError, Option } from 'commander';
import * as actions from './actions';
import { CliError } from './cli-error';
import { telemetry } from './telemetry';
import { checkNewVersion, getVersion } from './utils/version-utils';

const generateAction = async (options: Parameters<typeof actions.generate>[0]): Promise<void> => {
    await telemetry.trackCommand('generate', () => actions.generate(options));
};

const migrateAction = async (subCommand: string, options: any): Promise<void> => {
    await telemetry.trackCommand(`migrate ${subCommand}`, () => actions.migrate(subCommand, options));
};

const dbAction = async (subCommand: string, options: any): Promise<void> => {
    await telemetry.trackCommand(`db ${subCommand}`, () => actions.db(subCommand, options));
};

const infoAction = async (projectPath: string): Promise<void> => {
    await telemetry.trackCommand('info', () => actions.info(projectPath));
};

const initAction = async (projectPath: string): Promise<void> => {
    await telemetry.trackCommand('init', () => actions.init(projectPath));
};

const checkAction = async (options: Parameters<typeof actions.check>[0]): Promise<void> => {
    await telemetry.trackCommand('check', () => actions.check(options));
};

const formatAction = async (options: Parameters<typeof actions.format>[0]): Promise<void> => {
    await telemetry.trackCommand('format', () => actions.format(options));
};

const seedAction = async (options: Parameters<typeof actions.seed>[0], args: string[]): Promise<void> => {
    await telemetry.trackCommand('db seed', () => actions.seed(options, args));
};

const proxyAction = async (options: Parameters<typeof actions.proxy>[0]): Promise<void> => {
    await telemetry.trackCommand('proxy', () => actions.proxy(options));
};

function triStateBooleanOption(flag: string, description: string) {
    return new Option(flag, description).choices(['true', 'false']).argParser((value) => {
        if (value === undefined || value === 'true') return true;
        if (value === 'false') return false;
        throw new CliError(`Invalid value for ${flag}: ${value}`);
    });
}

function createProgram() {
    const program = new Command('zen')
        .alias('zenstack')
        .helpOption('-h, --help', 'Show this help message')
        .version(getVersion()!, '-v --version', 'Show CLI version');

    const schemaExtensions = ZModelLanguageMetaData.fileExtensions.join(', ');

    program
        .description(
            `${colors.bold.blue(
                'ζ',
            )} ZenStack is the modern data layer for TypeScript apps.\n\nDocumentation: https://zenstack.dev/docs`,
        )
        .showHelpAfterError()
        .showSuggestionAfterError();

    const schemaOption = new Option(
        '--schema <file>',
        `schema file (with extension ${schemaExtensions}). Defaults to "zenstack/schema.zmodel" unless specified in package.json.`,
    );

    const noVersionCheckOption = new Option('--no-version-check', 'do not check for new version');

    program
        .command('generate')
        .description('Run code generation plugins')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .addOption(new Option('-o, --output <path>', 'default output directory for code generation'))
        .addOption(new Option('-w, --watch', 'enable watch mode').default(false))
        .addOption(
            triStateBooleanOption(
                '--lite [boolean]',
                'also generate a lite version of schema without attributes, defaults to false',
            ),
        )
        .addOption(
            triStateBooleanOption(
                '--lite-only [boolean]',
                'only generate lite version of schema without attributes, defaults to false',
            ),
        )
        .addOption(triStateBooleanOption('--generate-models [boolean]', 'generate models.ts file, defaults to true'))
        .addOption(triStateBooleanOption('--generate-input [boolean]', 'generate input.ts file, defaults to true'))
        .addOption(new Option('--silent', 'suppress all output except errors').default(false))
        .action(generateAction);

    const migrateCommand = program.command('migrate').description('Run database schema migration related tasks.');
    const migrationsOption = new Option('--migrations <path>', 'path that contains the "migrations" directory');

    migrateCommand
        .command('dev')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .addOption(new Option('-n, --name <name>', 'migration name'))
        .addOption(new Option('--create-only', 'only create migration, do not apply'))
        .addOption(migrationsOption)
        .description('Create a migration from changes in schema and apply it to the database')
        .action((options) => migrateAction('dev', options));

    migrateCommand
        .command('reset')
        .addOption(schemaOption)
        .addOption(new Option('--force', 'skip the confirmation prompt'))
        .addOption(migrationsOption)
        .addOption(new Option('--skip-seed', 'skip seeding the database after reset'))
        .addOption(noVersionCheckOption)
        .description('Reset your database and apply all migrations, all data will be lost')
        .addHelpText(
            'after',
            '\nIf there is a seed script defined in package.json, it will be run after the reset. Use --skip-seed to skip it.',
        )
        .action((options) => migrateAction('reset', options));

    migrateCommand
        .command('deploy')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .addOption(migrationsOption)
        .description('Deploy your pending migrations to your production/staging database')
        .action((options) => migrateAction('deploy', options));

    migrateCommand
        .command('status')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .addOption(migrationsOption)
        .description('Check the status of your database migrations')
        .action((options) => migrateAction('status', options));

    migrateCommand
        .command('resolve')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .addOption(migrationsOption)
        .addOption(new Option('--applied <migration>', 'record a specific migration as applied'))
        .addOption(new Option('--rolled-back <migration>', 'record a specific migration as rolled back'))
        .description('Resolve issues with database migrations in deployment databases')
        .action((options) => migrateAction('resolve', options));

    const dbCommand = program.command('db').description('Manage your database schema during development');

    dbCommand
        .command('push')
        .description('Push the state from your schema to your database')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .addOption(new Option('--accept-data-loss', 'ignore data loss warnings'))
        .addOption(new Option('--force-reset', 'force a reset of the database before push'))
        .action((options) => dbAction('push', options));

    dbCommand
        .command('pull')
        .description('Introspect your database.')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .addOption(
            new Option(
                '-o, --output <path>',
                'set custom output path for the introspected schema. If a file path is provided, all schemas are merged into that single file. If a directory path is provided, files are written to the directory and imports are kept.',
            ),
        )
        .addOption(
            new Option('--model-casing <pascal|camel|snake|none>', 'set the casing of generated models').default(
                'pascal',
            ),
        )
        .addOption(
            new Option('--field-casing <pascal|camel|snake|none>', 'set the casing of generated fields').default(
                'camel',
            ),
        )
        .addOption(
            new Option('--always-map', 'always add @map and @@map attributes to models and fields').default(false),
        )
        .addOption(
            new Option('--quote <double|single>', 'set the quote style of generated schema files').default('single'),
        )
        .addOption(new Option('--indent <number>', 'set the indentation of the generated schema files').default(4))
        .action((options) => dbAction('pull', options));

    dbCommand
        .command('seed')
        .description('Seed the database')
        .allowExcessArguments(true)
        .addHelpText(
            'after',
            `
Seed script is configured under the "zenstack.seed" field in package.json.
E.g.:
{
    "zenstack": {
        "seed": "ts-node ./zenstack/seed.ts"
    }
}

Arguments following -- are passed to the seed script. E.g.: "zen db seed -- --users 10"`,
        )
        .addOption(noVersionCheckOption)
        .action((options, command) => seedAction(options, command.args));

    program
        .command('info')
        .description('Get information of installed ZenStack packages')
        .argument('[path]', 'project path', '.')
        .addOption(noVersionCheckOption)
        .action(infoAction);

    program
        .command('init')
        .description('Initialize an existing project for ZenStack')
        .argument('[path]', 'project path', '.')
        .addOption(noVersionCheckOption)
        .action(initAction);

    program
        .command('check')
        .description('Check a ZModel schema for syntax or semantic errors')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .action(checkAction);

    program
        .command('format')
        .description('Format a ZModel schema file')
        .addOption(schemaOption)
        .addOption(noVersionCheckOption)
        .action(formatAction);

    program
        .command('proxy')
        .alias('studio')
        .description('Start the ZenStack proxy server')
        .addOption(schemaOption)
        .addOption(new Option('-p, --port <port>', 'port to run the proxy server on').default(2311))
        .addOption(new Option('-o, --output <path>', 'output directory for `zen generate` command'))
        .addOption(new Option('-d, --databaseUrl <url>', 'database connection URL'))
        .addOption(new Option('-l, --logLevel <level...>', 'Query log levels (e.g., query, error)'))
        .addOption(noVersionCheckOption)
        .action(proxyAction);

    program.addHelpCommand('help [command]', 'Display help for a command');

    program.hook('preAction', async (_thisCommand, actionCommand) => {
        if (actionCommand.getOptionValue('versionCheck') !== false) {
            await checkNewVersion();
        }
    });

    return program;
}

async function main() {
    let exitCode = 0;

    const program = createProgram();
    program.exitOverride();

    try {
        await telemetry.trackCli(async () => {
            await program.parseAsync();
        });
    } catch (e) {
        if (e instanceof CommanderError) {
            // ignore
            exitCode = e.exitCode;
        } else if (e instanceof CliError) {
            // log
            console.error(colors.red(e.message));
            exitCode = 1;
        } else {
            console.error(colors.red(`Unhandled error: ${e}`));
            exitCode = 1;
        }
    }

    if (
        (program.args.includes('generate') && (program.args.includes('-w') || program.args.includes('--watch'))) ||
        ['proxy', 'studio'].some((cmd) => program.args.includes(cmd))
    ) {
        // A "hack" way to prevent the process from terminating because we don't want to stop it.
        return;
    }

    if (telemetry.isTracking) {
        // give telemetry a chance to send events before exit
        setTimeout(() => {
            process.exit(exitCode);
        }, 200);
    } else {
        process.exit(exitCode);
    }
}

main();
