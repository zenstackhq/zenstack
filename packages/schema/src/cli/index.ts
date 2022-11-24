/* eslint-disable @typescript-eslint/no-explicit-any */
import { paramCase } from 'change-case';
import colors from 'colors';
import { Command, Option } from 'commander';
import path from 'path';
import { ZModelLanguageMetaData } from '../language-server/generated/module';
import telemetry from '../telemetry';
import { execSync } from '../utils/exec-utils';
import { CliError } from './cli-error';
import { initProject, runGenerator } from './cli-util';

export const initAction = async (projectPath: string): Promise<void> => {
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'init' },
        () => initProject(projectPath)
    );
};

export const generateAction = async (options: {
    schema: string;
}): Promise<void> => {
    await telemetry.trackSpan(
        'cli:command:start',
        'cli:command:complete',
        'cli:command:error',
        { command: 'generate' },
        () => runGenerator(options)
    );
};

function prismaAction(prismaCmd: string): (...args: any[]) => Promise<void> {
    return async (options: any, command: Command) => {
        await telemetry.trackSpan(
            'cli:command:start',
            'cli:command:complete',
            'cli:command:error',
            {
                command: prismaCmd
                    ? prismaCmd + ' ' + command.name()
                    : command.name(),
            },
            async () => {
                const optStr = Array.from(Object.entries<any>(options))
                    .map(([k, v]) => {
                        let optVal = v;
                        if (k === 'schema') {
                            optVal = path.join(
                                path.dirname(v),
                                'schema.prisma'
                            );
                        }
                        return (
                            '--' +
                            paramCase(k) +
                            (typeof optVal === 'string' ? ` ${optVal}` : '')
                        );
                    })
                    .join(' ');

                // regenerate prisma schema first
                await runGenerator(options, ['prisma'], false);

                const prismaExec = `npx prisma ${prismaCmd} ${command.name()} ${optStr}`;
                console.log(prismaExec);
                try {
                    execSync(prismaExec);
                } catch {
                    telemetry.track('cli:command:error', {
                        command: prismaCmd,
                    });
                    console.error(
                        colors.red(
                            'Prisma command failed to execute. See errors above.'
                        )
                    );
                    throw new CliError('prisma command run error');
                }
            }
        );
    };
}

export default async function (): Promise<void> {
    await telemetry.trackSpan(
        'cli:start',
        'cli:complete',
        'cli:error',
        { args: process.argv },
        async () => {
            const program = new Command('zenstack');

            program.version(
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                require('../../package.json').version,
                '-v --version',
                'display CLI version'
            );

            const schemaExtensions =
                ZModelLanguageMetaData.fileExtensions.join(', ');

            program
                .description(
                    `${colors.bold.blue(
                        'ζ'
                    )} ZenStack is a toolkit for building secure CRUD apps with Next.js + Typescript.\n\nDocumentation: https://go.zenstack.dev/doc.`
                )
                .showHelpAfterError()
                .showSuggestionAfterError();

            const schemaOption = new Option(
                '--schema <file>',
                `schema file (with extension ${schemaExtensions})`
            ).default('./zenstack/schema.zmodel');

            //#region wraps Prisma commands

            program
                .command('init')
                .description('Set up a new ZenStack project.')
                .argument('<path>', 'project path')
                .action(initAction);

            program
                .command('generate')
                .description(
                    'Generates RESTful API and Typescript client for your data model.'
                )
                .addOption(schemaOption)
                .action(generateAction);

            const migrate = program
                .command('migrate')
                .description(
                    `Updates the database schema with migrations\nAlias for ${colors.cyan(
                        'prisma migrate'
                    )}.`
                );

            migrate
                .command('dev')
                .description(
                    `Creates a migration, apply it to the database, generate db client\nAlias for ${colors.cyan(
                        'prisma migrate dev'
                    )}.`
                )
                .addOption(schemaOption)
                .option(
                    '--create-only',
                    'Create a migration without applying it'
                )
                .option('-n --name <name>', 'Name the migration')
                .option('--skip-seed', 'Skip triggering seed')
                .action(prismaAction('migrate'));

            migrate
                .command('reset')
                .description(
                    `Resets your database and apply all migrations\nAlias for ${colors.cyan(
                        'prisma migrate reset'
                    )}.`
                )
                .addOption(schemaOption)
                .option('--force', 'Skip the confirmation prompt')
                .action(prismaAction('migrate'));

            migrate
                .command('deploy')
                .description(
                    `Applies pending migrations to the database in production/staging\nAlias for ${colors.cyan(
                        'prisma migrate deploy'
                    )}.`
                )
                .addOption(schemaOption)
                .action(prismaAction('migrate'));

            migrate
                .command('status')
                .description(
                    `Checks the status of migrations in the production/staging database\nAlias for ${colors.cyan(
                        'prisma migrate status'
                    )}.`
                )
                .addOption(schemaOption)
                .action(prismaAction('migrate'));

            const db = program
                .command('db')
                .description(
                    `Manages your database schema and lifecycle during development\nAlias for ${colors.cyan(
                        'prisma db'
                    )}.`
                );

            db.command('push')
                .description(
                    `Pushes the Prisma schema state to the database\nAlias for ${colors.cyan(
                        'prisma db push'
                    )}.`
                )
                .addOption(schemaOption)
                .option('--accept-data-loss', 'Ignore data loss warnings')
                .action(prismaAction('db'));

            program
                .command('studio')
                .description(
                    `Browses your data with Prisma Studio\nAlias for ${colors.cyan(
                        'prisma studio'
                    )}.`
                )
                .addOption(schemaOption)
                .option('-p --port <port>', 'Port to start Studio in')
                .option('-b --browser <browser>', 'Browser to open Studio in')
                .option(
                    '-n --hostname',
                    'Hostname to bind the Express server to'
                )
                .action(prismaAction(''));

            //#endregion

            // handle errors explicitly to ensure telemetry
            program.exitOverride();

            await program.parseAsync(process.argv);
        }
    );
}
