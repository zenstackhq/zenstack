import { Command, Option } from 'commander';
import { NodeFileSystem } from 'langium/node';
import { Model } from '../language-server/generated/ast';
import { ZModelLanguageMetaData } from '../language-server/generated/module';
import { createZModelServices } from '../language-server/zmodel-module';
import { extractAstNode } from './cli-util';
import { Context, GeneratorError } from '../generator/types';
import { ZenStackGenerator } from '../generator';
import { GENERATED_CODE_PATH } from '../generator/constants';
import colors from 'colors';
import { execSync } from '../utils/exec-utils';
import { paramCase } from 'change-case';
import path from 'path';

export const generateAction = async (options: {
    schema: string;
}): Promise<void> => {
    const services = createZModelServices(NodeFileSystem).ZModel;
    const model = await extractAstNode<Model>(options.schema, services);

    const context: Context = {
        schema: model,
        outDir: path.dirname(options.schema),
        // TODO: make this configurable
        generatedCodeDir: GENERATED_CODE_PATH,
    };

    try {
        await new ZenStackGenerator().generate(context);
    } catch (err) {
        if (err instanceof GeneratorError) {
            console.error(colors.red(err.message));
            process.exit(1);
        }
    }
};

function prismaAction(prismaCmd: string): (...args: any[]) => Promise<void> {
    return async (options: any, command: Command) => {
        let optStr = Array.from(Object.entries<any>(options))
            .map(([k, v]) => {
                let optVal = v;
                if (k === 'schema') {
                    optVal = path.join(path.dirname(v), 'schema.prisma');
                }
                return (
                    '--' +
                    paramCase(k) +
                    (typeof optVal === 'string' ? ` ${optVal}` : '')
                );
            })
            .join(' ');
        const prismaExec = `npx prisma ${prismaCmd} ${command.name()} ${optStr}`;
        console.log(prismaExec);
        try {
            execSync(prismaExec);
        } catch {
            console.error(
                colors.red(
                    'Prisma command failed to execute. See errors above.'
                )
            );
            process.exit(1);
        }
    };
}

export default function (): void {
    const program = new Command('zenstack');

    program.version(
        require('../../package.json').version,
        '-v --version',
        'display CLI version'
    );

    const schemaExtensions = ZModelLanguageMetaData.fileExtensions.join(', ');

    program
        .description(
            `${colors.bold.blue(
                'ζ'
            )} ZenStack simplifies fullstack development by generating backend services and Typescript clients from a data model.\n\nDocumentation: https://zenstack.dev/doc.`
        )
        .showHelpAfterError()
        .showSuggestionAfterError();

    const schemaOption = new Option(
        '--schema <file>',
        `schema file (with extension ${schemaExtensions})`
    ).default('./zenstack/schema.zmodel');

    program
        .command('generate')
        .description(
            'generates RESTful API and Typescript client for your data model'
        )
        .addOption(schemaOption)
        .action(generateAction);

    const migrate = program
        .command('migrate')
        .description(`wraps Prisma's ${colors.cyan('migrate')} command`);

    migrate
        .command('dev')
        .description(
            `alias for ${colors.cyan(
                'prisma migrate dev'
            )}\nCreate a migration, apply it to the database, generate db client.`
        )
        .addOption(schemaOption)
        .option('--create-only', 'Create a migration without applying it')
        .action(prismaAction('migrate'));

    migrate
        .command('reset')
        .description(
            `alias for ${colors.cyan(
                'prisma migrate reset'
            )}\nReset your database and apply all migrations.`
        )
        .addOption(schemaOption)
        .option('--force', 'Skip the confirmation prompt')
        .action(prismaAction('migrate'));

    migrate
        .command('deploy')
        .description(
            `alias for ${colors.cyan(
                'prisma migrate deploy'
            )}\nApply pending migrations to the database in production/staging.`
        )
        .addOption(schemaOption)
        .action(prismaAction('migrate'));

    migrate
        .command('status')
        .description(
            `alias for ${colors.cyan(
                'prisma migrate status'
            )}\nCheck the status of migrations in the production/staging database.`
        )
        .addOption(schemaOption)
        .action(prismaAction('migrate'));

    const db = program
        .command('db')
        .description(`wraps Prisma's ${colors.cyan('db')} command`);

    db.command('push')
        .description(
            `alias for ${colors.cyan(
                'prisma db push'
            )}\nPush the Prisma schema state to the database.`
        )
        .addOption(schemaOption)
        .option('--accept-data-loss', 'Ignore data loss warnings')
        .action(prismaAction('db'));

    program.parse(process.argv);
}
